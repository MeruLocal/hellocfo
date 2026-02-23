import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  selectToolsForQuery,
  buildOpenAIToolsFromMcp,
  type OpenAITool,
} from "./tool-groups.ts";
import { classifyQuery, type QueryCategory } from "./classifier.ts";
import { SYSTEM_PROMPTS } from "./model-selector.ts";
import { detectAutoEnrichments, buildEnrichmentInstructions } from "./enrichment-auto-apply.ts";
import { logFeedback } from "./feedback-logger.ts";
import { logIntentRouting, logLLMPathPattern, checkForSuggestedIntents } from "../_shared/rl-logger.ts";
import { createMCPClient, StreamableMCPClient } from "./mcp-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, h-authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SSEEvent {
  type: string;
  data: unknown;
  timestamp: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  id?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

interface Attachment {
  name: string;
  url: string;
  type: string;
}

interface LLMConfig {
  id: string;
  provider: string;
  model: string;
  api_key: string | null;
  endpoint: string | null;
  max_tokens: number;
  temperature: number;
}

interface Intent {
  id: string;
  name: string;
  description: string;
  module_id: string;
  training_phrases: string[];
  entities: Record<string, unknown>[];
  resolution_flow: {
    dataPipeline?: { tool: string; mcpTool?: string; description: string; purpose?: string; nodeType?: string }[];
    enrichments?: { type: string; description: string }[];
    responseConfig?: { template: string; format: string };
  };
  is_active: boolean;
}

const MAX_TOOL_RESULT_CHARS = 50000;
const SIMPLE_DIRECT_LLM_MODE = false;
const NO_DATABASE_ID_EXPOSURE_RULE = `⚠️ ABSOLUTE RULE — NO EXCEPTIONS:
NEVER show database IDs, internal IDs, UUIDs, or numeric system IDs in any user-facing response.
Never show internal fields like id, *_id, entity_id, org_id, customer_id, vendor_id, invoice_id, bill_id, payment_id, created_by, or updated_by.
If tool data includes these fields or values, omit them entirely and only present human-readable references (invoice/bill numbers, names, dates, statuses, and amounts).`;

function truncateResult(result: unknown, maxLength = 8000): string {
  const str = typeof result === 'string' ? result : JSON.stringify(result);
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + `... [truncated, ${str.length - maxLength} chars omitted]`;
}

// ─── Role Normalization ──────────────────────────────────────────────────────

function normalizeConversationHistory(history: ChatMessage[]): ChatMessage[] {
  return history.map(m => ({
    ...m,
    role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
  }));
}

function parseConversationMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const parsed: ChatMessage[] = [];
  for (const msg of raw) {
    if (!msg || typeof msg !== 'object') continue;
    const obj = msg as Record<string, unknown>;
    const content = typeof obj.content === 'string' ? obj.content.trim() : '';
    if (!content) continue;
    const roleRaw = typeof obj.role === 'string' ? obj.role.toLowerCase() : 'assistant';
    const role: 'user' | 'assistant' = roleRaw === 'user' ? 'user' : 'assistant';
    parsed.push({
      role,
      content,
      ...(typeof obj.id === 'string' ? { id: obj.id } : {}),
      ...(typeof obj.timestamp === 'string' ? { timestamp: obj.timestamp } : {}),
      ...(obj.metadata && typeof obj.metadata === 'object' ? { metadata: obj.metadata as Record<string, unknown> } : {}),
    });
  }
  return parsed;
}

// ─── Created Document Tracking ───────────────────────────────────────────────

interface CreatedDoc {
  docType: string;
  docNumber: string | null;
  internalId: string | null;
  party: string | null;
  amount: number | null;
  createdAt: string;
}

function parseCreatedDoc(toolName: string, resultStr: string): CreatedDoc | null {
  const docTypeMatch = toolName.match(/^(?:create|update)_(\w+)/);
  if (!docTypeMatch) return null;
  const docType = docTypeMatch[1];
  let docNumber: string | null = null;
  let internalId: string | null = null;
  let party: string | null = null;
  let amount: number | null = null;
  try {
    const parsed = JSON.parse(resultStr);
    const obj = parsed?.data || parsed?.result || parsed || {};
    const record = Array.isArray(obj) ? obj[0] : obj;
    if (!record || typeof record !== 'object') return null;
    docNumber = record.invoice_number || record.invoiceNumber || record.bill_number ||
      record.billNumber || record.number || record.document_number || record.reference_number ||
      record.credit_note_number || record.payment_number || null;
    internalId = record.id || record.invoice_id || record.bill_id || record.payment_id ||
      record.customer_id || record.vendor_id || record.contact_id || null;
    party = record.customer_name || record.vendor_name || record.contact_name ||
      record.party_name || record.name || null;
    amount = record.total || record.amount || record.grand_total || record.balance || null;
    if (typeof amount === 'string') amount = parseFloat(amount) || null;
  } catch (_e) { /* not JSON */ }
  return { docType, docNumber, internalId, party, amount, createdAt: new Date().toISOString() };
}

function extractCreatedDocs(conversationHistory: ChatMessage[]): CreatedDoc[] {
  const docs: CreatedDoc[] = [];
  for (let i = conversationHistory.length - 1; i >= Math.max(0, conversationHistory.length - 10); i--) {
    const msg = conversationHistory[i];
    if (msg.role !== 'assistant') continue;
    const meta = msg.metadata || {};
    if (meta.createdDocs && Array.isArray(meta.createdDocs)) {
      docs.push(...(meta.createdDocs as CreatedDoc[]));
    }
  }
  return docs;
}

function normalizeDocRef(ref: string): string {
  return ref.replace(/[\s\-_]+/g, '').toUpperCase();
}

const DETAIL_LOOKUP_PATTERNS = [
  /\b(?:show|get|view|display|find|fetch|details?\s+(?:of|for)?|info\s+(?:of|for)?)\b.*?\b(invoice|bill|credit.?note|payment)\b.*?\b([A-Z]{2,5}[\-\s]?\d{3,})\b/i,
  /\b(invoice|bill|credit.?note|payment)\b.*?\b([A-Z]{2,5}[\-\s]?\d{3,})\b/i,
];

interface DetailLookupIntent {
  docType: string;
  docRef: string;
}

function detectDetailLookup(query: string): DetailLookupIntent | null {
  for (const pattern of DETAIL_LOOKUP_PATTERNS) {
    const match = query.match(pattern);
    if (match) {
      return { docType: match[1].toLowerCase().replace(/\s+/g, '_'), docRef: match[2] };
    }
  }
  return null;
}


// ─── Follow-up / Confirmation Detection ──────────────────────────────────────

const CONFIRMATION_PATTERNS = [
  /\b(yes|yep|yeah|haan|ha|kar\s*do|ok|okay|sure|correct|sahi|theek|confirm|confirmed)\b/i,
  /\bplease\s+(try|create|do|make|send|retry)\b/i,
  /\btry\s+again\b/i,
  /\b(do\s+it|go\s+ahead|proceed|retry|execute)\b/i,
];

interface PendingAction {
  toolName: string;
  args: Record<string, unknown>;
  summary: string;
}

function isConfirmationMessage(query: string): boolean {
  const q = query.trim();
  // Pure confirmations (short) are always confirmations
  if (q.split(/\s+/).length <= 8 && CONFIRMATION_PATTERNS.some(p => p.test(q))) return true;
  // Longer messages that contain confirmation keywords + additional data (e.g., invoice number)
  // are also confirmations if they have at least one confirmation keyword
  if (q.split(/\s+/).length <= 25 && CONFIRMATION_PATTERNS.some(p => p.test(q))) return true;
  return false;
}

/** Extract extra fields from a confirmation message (e.g., "invoice number is INV-123, yes confirm") */
function extractFieldsFromConfirmation(query: string): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  // Invoice number
  const invMatch = query.match(/invoice\s*(?:number|no|#)?\s*(?:is|:)?\s*([A-Z0-9][\w-]+)/i);
  if (invMatch) fields.invoice_number = invMatch[1];
  // Bill number
  const billMatch = query.match(/bill\s*(?:number|no|#)?\s*(?:is|:)?\s*([A-Z0-9][\w-]+)/i);
  if (billMatch) fields.bill_number = billMatch[1];
  return fields;
}

function extractPendingAction(conversationHistory: ChatMessage[]): PendingAction | null {
  // Walk backwards to find the last assistant message that proposed an action
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const msg = conversationHistory[i];
    if (msg.role !== 'assistant') continue;
    const content = msg.content || '';
    const meta = msg.metadata || {};

    // Check if metadata has pending tool info (persisted from previous turn)
    if (meta.pendingTool && meta.pendingArgs) {
      return {
        toolName: String(meta.pendingTool),
        args: meta.pendingArgs as Record<string, unknown>,
        summary: String(meta.pendingSummary || content.slice(0, 300)),
      };
    }

    // Check if metadata has toolsUsed with write tools
    const prevCategory = meta.category as string | undefined;
    const prevToolsUsed = (meta.toolsUsed as string[]) || [];
    if ((prevCategory === 'unified' || prevCategory === 'bookkeeper') && prevToolsUsed.length > 0) {
      const writeTools = prevToolsUsed.filter(t => /^(create_|update_|delete_|void_|cancel_)/.test(t));
      if (writeTools.length > 0) {
        return {
          toolName: writeTools[0],
          args: {},
          summary: content.slice(0, 300),
        };
      }
    }

    // Heuristic: if assistant said it will create/retry and mentioned specific details
    const createMatch = content.match(/create\s+(invoice|bill|payment|customer|vendor)/i);
    if (createMatch) {
      return {
        toolName: `create_${createMatch[1].toLowerCase()}`,
        args: {},
        summary: content.slice(0, 300),
      };
    }

    // If assistant mentioned "confirm" or "retry"
    if (/confirm|retry|try again|I'll.*create|shall I|would you like me to/i.test(content)) {
      // Try to infer tool from content
      const actionMatch = content.match(/(create|update|delete|void|cancel)\s+(?:the\s+)?(?:this\s+)?(invoice|bill|payment|customer|vendor|credit.?note)/i);
      if (actionMatch) {
        return {
          toolName: `${actionMatch[1].toLowerCase()}_${actionMatch[2].toLowerCase().replace(/\s+/g, '_')}`,
          args: {},
          summary: content.slice(0, 300),
        };
      }
      // Generic pending action
      return {
        toolName: '',
        args: {},
        summary: content.slice(0, 300),
      };
    }
  }
  return null;
}

// ─── Pagination Helpers ──────────────────────────────────────────────────────

const BULK_LIST_PATTERNS = [
  /\b(all|every|list|show\s+all|show\s+me\s+all|get\s+all|fetch\s+all|sab|sabhi|saare)\b/i,
  /\b(show|give|get|fetch|list)\s+(me\s+)?(all\s+)?(bills?|invoices?|customers?|vendors?|payments?|credit.?notes?|delivery.?challans?|transactions?)/i,
];

const PAGINATION_FOLLOW_PATTERNS = [
  /\b(more|next|next\s+page|show\s+more|aur\s+dikhao|agla|agle|next\s+\d+)\b/i,
  /\b(previous|prev|pichla|pehle\s+wale)\b/i,
];
const OVERDUE_PATTERNS = [/\boverdue\b/i, /\bpast\s+due\b/i, /\bdue\s+date\s+passed\b/i, /\blate\s+payments?\b/i];

const LIST_TOOL_PATTERNS = /^(get_|list_|fetch_|search_|find_)/i;

function isBulkListQuery(query: string): boolean {
  return BULK_LIST_PATTERNS.some(p => p.test(query));
}

function isPaginationFollowUp(query: string): boolean {
  return PAGINATION_FOLLOW_PATTERNS.some(p => p.test(query));
}

function isOverdueQuery(query: string): boolean {
  return OVERDUE_PATTERNS.some(p => p.test(query));
}

function isListTool(toolName: string): boolean {
  return LIST_TOOL_PATTERNS.test(toolName);
}

/** Detect which entity types the query asks for (bills, invoices, etc.) */
function detectRequestedEntities(query: string): string[] {
  const entities: string[] = [];
  const q = query.toLowerCase();
  if (/\bbills?\b/.test(q)) entities.push('bills');
  if (/\binvoices?\b/.test(q)) entities.push('invoices');
  if (/\bcustomers?\b/.test(q)) entities.push('customers');
  if (/\bvendors?\b/.test(q)) entities.push('vendors');
  if (/\bpayments?\b/.test(q)) entities.push('payments');
  if (/\bcredit.?notes?\b/.test(q)) entities.push('credit_notes');
  if (/\bdelivery.?challans?\b/.test(q)) entities.push('delivery_challans');
  if (/\btransactions?\b/.test(q)) entities.push('transactions');
  return entities;
}

const ENTITY_KEYWORDS: Record<string, string[]> = {
  bills: ['bill', 'bills', 'purchase', 'payable', 'vendor'],
  invoices: ['invoice', 'invoices', 'sales', 'receivable', 'customer'],
  customers: ['customer', 'customers', 'client', 'buyer', 'debtor'],
  vendors: ['vendor', 'vendors', 'supplier', 'creditor'],
  payments: ['payment', 'payments', 'receipt', 'collection'],
  credit_notes: ['credit note', 'credit notes', 'refund', 'return'],
  delivery_challans: ['delivery challan', 'challan', 'dispatch'],
  transactions: ['transaction', 'transactions', 'bank', 'statement'],
};

function inferEntityFromTool(
  toolName: string,
  toolDescription: string,
  fallbackEntities: string[],
): string | null {
  const text = `${toolName} ${toolDescription}`.toLowerCase();
  let bestEntity: string | null = null;
  let bestScore = 0;

  for (const [entity, keywords] of Object.entries(ENTITY_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (!text.includes(keyword)) continue;
      score += toolName.toLowerCase().includes(keyword) ? 2 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestEntity = entity;
    }
  }

  if (bestEntity) return bestEntity;
  if (fallbackEntities.length === 1) return fallbackEntities[0];
  return null;
}

function scoreListToolForEntity(
  tool: { name: string; description: string; inputSchema: unknown },
  entity: string,
  preferOverdue = false,
): number {
  const keywords = ENTITY_KEYWORDS[entity] || [entity.replace(/_/g, ' ')];
  const text = `${tool.name} ${tool.description || ''}`.toLowerCase();
  const nameLower = tool.name.toLowerCase();

  let entitySignal = 0;
  for (const keyword of keywords) {
    if (!text.includes(keyword)) continue;
    entitySignal += nameLower.includes(keyword) ? 2 : 1;
  }
  if (entitySignal === 0) return Number.NEGATIVE_INFINITY;

  let score = entitySignal * 3;
  if (/\b(list|get|fetch|search|find)\b/.test(nameLower)) score += 2;
  if (/\b(all|list|fetch|search|find)\b/.test(text)) score += 3;
  if (/\bby[_\s-]?id\b|\bdetail\b|\bsingle\b/.test(text)) score -= 5;
  if (/^(create_|update_|delete_|void_|cancel_)/.test(nameLower)) score -= 8;
  if (preferOverdue && /\boverdue|aging|ageing|receivable|payable|due\b/.test(text)) score += 5;

  const schema = tool.inputSchema as { properties?: Record<string, unknown> } | undefined;
  const properties = schema?.properties ? Object.keys(schema.properties) : [];
  if (properties.some(k => ['limit', 'page', 'offset', 'page_size', 'per_page', 'cursor', 'skip'].includes(k))) {
    score += 2;
  }
  if (properties.some(k => k.toLowerCase().includes('id')) && properties.length <= 2) {
    score -= 2;
  }

  return score;
}

function selectPreferredListToolForEntity(
  entity: string,
  tools: Array<{ name: string; description: string; inputSchema: unknown }>,
  preferOverdue = false,
): { toolName: string; score: number } | null {
  let best: { toolName: string; score: number } | null = null;
  for (const tool of tools) {
    const score = scoreListToolForEntity(tool, entity, preferOverdue);
    if (!Number.isFinite(score)) continue;
    if (!best || score > best.score) best = { toolName: tool.name, score };
  }
  if (!best || best.score <= 0) return null;
  return best;
}

function selectPreferredListToolsForEntities(
  entities: string[],
  tools: Array<{ name: string; description: string; inputSchema: unknown }>,
  preferOverdue = false,
): Array<{ entity: string; toolName: string; score: number }> {
  const picks: Array<{ entity: string; toolName: string; score: number }> = [];
  const used = new Set<string>();

  for (const entity of entities) {
    let best: { toolName: string; score: number } | null = null;
    for (const tool of tools) {
      if (!isListTool(tool.name) || used.has(tool.name)) continue;
      const score = scoreListToolForEntity(tool, entity, preferOverdue);
      if (!Number.isFinite(score)) continue;
      if (!best || score > best.score) best = { toolName: tool.name, score };
    }
    if (best && best.score > 0) {
      picks.push({ entity, toolName: best.toolName, score: best.score });
      used.add(best.toolName);
    }
  }

  return picks;
}

function stripMarkdownCodeFence(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fence ? fence[1] : trimmed;
}

function coerceToObjectArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v));
}

function extractFirstObjectArray(obj: Record<string, unknown>): Record<string, unknown>[] {
  const preferred = ['data', 'items', 'results', 'records', 'rows', 'invoices', 'bills', 'vendors', 'customers', 'payments'];
  for (const key of preferred) {
    const arr = coerceToObjectArray(obj[key]);
    if (arr.length > 0) return arr;
  }
  for (const value of Object.values(obj)) {
    const arr = coerceToObjectArray(value);
    if (arr.length > 0) return arr;
  }
  return [];
}

function extractTotalCount(obj: Record<string, unknown>): number | undefined {
  const keys = ['total', 'total_count', 'totalCount', 'count', 'record_count', 'recordCount'];
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function extractHasMore(obj: Record<string, unknown>): boolean | undefined {
  const keys = ['has_more', 'hasMore', 'more', 'has_next', 'hasNext'];
  for (const key of keys) {
    if (typeof obj[key] === 'boolean') return obj[key] as boolean;
  }
  return undefined;
}

function parseListToolResult(result: string): {
  rows: Record<string, unknown>[];
  totalCount?: number;
  hasMore?: boolean;
  parseError?: string;
} {
  const cleaned = stripMarkdownCodeFence(result);
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return { rows: coerceToObjectArray(parsed) };
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      return {
        rows: extractFirstObjectArray(obj),
        totalCount: extractTotalCount(obj),
        hasMore: extractHasMore(obj),
      };
    }
    return { rows: [] };
  } catch (e) {
    return { rows: [], parseError: e instanceof Error ? e.message : String(e) };
  }
}

function normalizeKeyForMatch(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findKeyByAlias(keys: string[], aliases: string[]): string | null {
  const byNorm = new Map(keys.map(k => [normalizeKeyForMatch(k), k]));
  for (const alias of aliases) {
    const found = byNorm.get(normalizeKeyForMatch(alias));
    if (found) return found;
  }
  return null;
}

const ENTITY_COLUMN_ALIASES: Record<string, string[][]> = {
  invoices: [
    ['invoice_number', 'invoice_no', 'invoice'],
    ['customer_name', 'customer', 'party_name', 'party'],
    ['issue_date', 'invoice_date', 'date'],
    ['due_date', 'due'],
    ['status', 'workflow_status', 'invoice_status'],
    ['total', 'total_amount', 'amount', 'grand_total', 'balance'],
  ],
  bills: [
    ['bill_number', 'bill_no', 'bill'],
    ['vendor_name', 'vendor', 'party_name', 'party'],
    ['issue_date', 'bill_date', 'date'],
    ['due_date', 'due'],
    ['status', 'workflow_status', 'bill_status'],
    ['total', 'total_amount', 'amount', 'grand_total', 'balance'],
  ],
  vendors: [
    ['vendor_name', 'name', 'display_name'],
    ['gstin', 'gst_number', 'tax_id'],
    ['email', 'email_address'],
    ['phone', 'mobile', 'contact_number'],
    ['status', 'state'],
    ['balance', 'outstanding', 'payable'],
  ],
  customers: [
    ['customer_name', 'name', 'display_name'],
    ['gstin', 'gst_number', 'tax_id'],
    ['email', 'email_address'],
    ['phone', 'mobile', 'contact_number'],
    ['status', 'state'],
    ['balance', 'outstanding', 'receivable'],
  ],
  payments: [
    ['payment_number', 'payment_no', 'payment'],
    ['party_name', 'customer_name', 'vendor_name', 'party'],
    ['payment_date', 'date', 'transaction_date'],
    ['payment_mode', 'mode'],
    ['status', 'state'],
    ['amount', 'total', 'received', 'paid'],
  ],
};

function isInternalOrIdField(key: string, values: unknown[]): boolean {
  const lower = key.toLowerCase();
  if (
    lower === 'id' ||
    lower.endsWith('_id') ||
    lower.includes('uuid') ||
    lower.includes('entity') ||
    lower.includes('org') ||
    lower.includes('created_by') ||
    lower.includes('updated_by')
  ) return true;

  return values.some(v => {
    if (typeof v !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.trim());
  });
}

function pickDisplayColumns(entity: string, rows: Record<string, unknown>[]): string[] {
  if (rows.length === 0) return [];
  const keys = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
  const aliases = ENTITY_COLUMN_ALIASES[entity] || [];
  const selected: string[] = [];

  for (const aliasGroup of aliases) {
    const key = findKeyByAlias(keys, aliasGroup);
    if (key && !selected.includes(key)) selected.push(key);
  }

  const fallbackKeys = keys.filter(k => !selected.includes(k)).filter(k => {
    const values = rows.map(r => r[k]).filter(v => v !== undefined && v !== null);
    return !isInternalOrIdField(k, values);
  });
  for (const k of fallbackKeys) {
    if (selected.length >= 6) break;
    selected.push(k);
  }

  return selected.slice(0, 6);
}

function formatColumnLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bNo\b/g, '#');
}

function toDisplayString(value: unknown, key: string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') {
    if (/(amount|total|balance|rate|price|value|tax|gst)/i.test(key)) {
      return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return value.toLocaleString('en-IN');
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') {
    const v = value.trim();
    if (!v) return '—';
    return v.length > 80 ? `${v.slice(0, 77)}...` : v;
  }
  if (Array.isArray(value)) return value.length === 0 ? '—' : `${value.length} items`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const name = obj.name || obj.display_name || obj.title || obj.value;
    if (typeof name === 'string' && name.trim()) return name.trim();
    return '[object]';
  }
  return String(value);
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function entityTitle(entity: string): string {
  const map: Record<string, string> = {
    invoices: 'Invoices',
    bills: 'Bills',
    customers: 'Customers',
    vendors: 'Vendors',
    payments: 'Payments',
    credit_notes: 'Credit Notes',
    delivery_challans: 'Delivery Challans',
    transactions: 'Transactions',
  };
  return map[entity] || entity.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function renderEntityTableSection(
  entity: string,
  rows: Record<string, unknown>[],
  totalCount?: number,
  hasMore?: boolean,
): string {
  if (rows.length === 0) return `## ${entityTitle(entity)} (showing 0)\nNo records found for current filters.`;

  const columns = pickDisplayColumns(entity, rows);
  if (columns.length === 0) return `## ${entityTitle(entity)} (showing ${rows.length})\nNo displayable columns found.`;

  const countText = totalCount && totalCount >= rows.length ? `${rows.length} of ${totalCount}` : `${rows.length}`;
  const header = `## ${entityTitle(entity)} (showing ${countText})`;
  const tableHeader = `| ${columns.map(c => formatColumnLabel(c)).join(' | ')} |`;
  const tableDivider = `| ${columns.map(() => '---').join(' | ')} |`;
  const tableRows = rows.map(row => {
    const cells = columns.map(col => escapeMarkdownCell(toDisplayString(row[col], col)));
    return `| ${cells.join(' | ')} |`;
  });

  const lines = [header, tableHeader, tableDivider, ...tableRows];
  if (hasMore) lines.push(`_More records are available. Ask "show more ${entity}" to load next page._`);
  return lines.join('\n');
}

const DEFAULT_PAGE_SIZE = 15;
const MAX_PAGE_SIZE = 50;

function extractRequestedPageSize(query: string): number | undefined {
  const patterns = [
    /\b(?:top|first|latest|last|next)\s+(\d{1,3})\b/i,
    /\b(\d{1,3})\s+(?:records?|rows?|items?|bills?|invoices?|customers?|vendors?|payments?|transactions?)\b/i,
  ];
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (!match) continue;
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) return Math.min(parsed, MAX_PAGE_SIZE);
  }
  return undefined;
}

/** Inject pagination defaults into list tool args */
function injectPaginationDefaults(
  args: Record<string, unknown>,
  schema: unknown,
  requestedSize?: number,
  forceMinimum = false,
): Record<string, unknown> {
  const s = schema as { properties?: Record<string, unknown> } | undefined;
  if (!s?.properties) return args;
  const result = { ...args };
  const pageSize = requestedSize ? Math.min(requestedSize, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;

  // Try common pagination param names
  const paginationKeys = ['limit', 'page_size', 'per_page', 'take', 'pageSize', 'perPage', 'size', 'count', 'max_results', 'maxResults'];
  for (const key of paginationKeys) {
    if (!(key in s.properties)) continue;
    const existingValue = result[key];
    if (existingValue === undefined || existingValue === null || existingValue === '') {
      result[key] = pageSize;
      break;
    }
    if (forceMinimum) {
      const existingNum = typeof existingValue === 'number'
        ? existingValue
        : (typeof existingValue === 'string' ? Number.parseInt(existingValue, 10) : NaN);
      if (Number.isFinite(existingNum) && existingNum > 0 && existingNum < pageSize) {
        result[key] = pageSize;
      }
    }
    break;
  }

  // Inject page/offset defaults if schema supports
  const offsetKeys = ['offset', 'skip', 'page', 'cursor', 'start'];
  for (const key of offsetKeys) {
    if (key in s.properties && !(key in result)) {
      result[key] = key === 'page' ? 1 : 0;
      break;
    }
  }

  return result;
}

function injectAllRecordsDefaults(
  args: Record<string, unknown>,
  schema: unknown,
): Record<string, unknown> {
  const s = schema as { properties?: Record<string, unknown> } | undefined;
  if (!s?.properties) return args;
  const result = { ...args };

  const allStatusKeys = [
    'status',
    'statuses',
    'workflow_status',
    'workflowStatus',
    'payment_status',
    'paymentStatus',
    'approval_status',
    'approvalStatus',
    'bill_status',
    'invoice_status',
    'state',
  ];

  for (const key of allStatusKeys) {
    if (!(key in s.properties)) continue;
    if (result[key] === undefined || result[key] === null || result[key] === '') {
      const fieldSchema = s.properties[key] as { enum?: unknown[] } | undefined;
      const enumValues = Array.isArray(fieldSchema?.enum) ? fieldSchema!.enum : [];
      const enumAllowsAll = enumValues.length === 0 || enumValues.some(v => String(v).toLowerCase() === 'all');
      if (enumAllowsAll) result[key] = 'all';
    }
  }

  return result;
}

function injectOverdueDefaults(
  args: Record<string, unknown>,
  schema: unknown,
): Record<string, unknown> {
  const s = schema as { properties?: Record<string, unknown> } | undefined;
  if (!s?.properties) return args;
  const result = { ...args };

  const statusKeys = ['status', 'statuses', 'workflow_status', 'workflowStatus', 'invoice_status', 'bill_status', 'state'];
  for (const key of statusKeys) {
    if (!(key in s.properties)) continue;
    if (result[key] !== undefined && result[key] !== null && result[key] !== '') continue;

    const fieldSchema = s.properties[key] as { enum?: unknown[] } | undefined;
    const enumValues = Array.isArray(fieldSchema?.enum) ? fieldSchema!.enum.map(v => String(v)) : [];
    if (enumValues.length === 0) {
      result[key] = 'overdue';
      break;
    }

    const overdueCandidate = enumValues.find(v => v.toLowerCase() === 'overdue');
    if (overdueCandidate) {
      result[key] = overdueCandidate;
      break;
    }
  }

  // Common cutoff keys for due-date queries
  const today = new Date().toISOString().slice(0, 10);
  const cutoffKeys = ['due_before', 'due_date_to', 'to_date', 'end_date', 'before_date', 'date_to'];
  for (const key of cutoffKeys) {
    if (key in s.properties && (result[key] === undefined || result[key] === null || result[key] === '')) {
      result[key] = today;
      break;
    }
  }

  if ('include_draft' in s.properties && (result.include_draft === undefined || result.include_draft === null)) {
    result.include_draft = false;
  }
  if ('includeDraft' in s.properties && (result.includeDraft === undefined || result.includeDraft === null)) {
    result.includeDraft = false;
  }

  return result;
}

function injectPaginationFollowUpArgs(
  args: Record<string, unknown>,
  schema: unknown,
  paginationState: PaginationState,
): Record<string, unknown> {
  const s = schema as { properties?: Record<string, unknown> } | undefined;
  if (!s?.properties) return args;
  const result = { ...args };

  const nextPage = Math.max(1, (paginationState.lastPage || 1) + 1);
  const nextOffset = Math.max(0, paginationState.lastOffset || 0);

  if (paginationState.nextCursor) {
    for (const cursorKey of ['cursor', 'next_cursor', 'nextCursor', 'page_token', 'pageToken']) {
      if (cursorKey in s.properties) {
        result[cursorKey] = paginationState.nextCursor;
        break;
      }
    }
  }

  if ('page' in s.properties) result.page = nextPage;
  if ('offset' in s.properties) result.offset = nextOffset;
  if ('skip' in s.properties) result.skip = nextOffset;
  if ('start' in s.properties) result.start = nextOffset;

  return result;
}

/** Extract pagination metadata from a tool result */
function extractPaginationMeta(toolName: string, result: string): {
  hasMore: boolean;
  nextPage?: number;
  nextCursor?: string;
  totalCount?: number;
  returnedCount: number;
} {
  let returnedCount = 0;
  let hasMore = false;
  let nextPage: number | undefined;
  let nextCursor: string | undefined;
  let totalCount: number | undefined;

  try {
    const parsed = JSON.parse(result);
    // Handle array response
    if (Array.isArray(parsed)) {
      returnedCount = parsed.length;
      hasMore = parsed.length >= DEFAULT_PAGE_SIZE;
    }
    // Handle object with data array
    if (parsed?.data && Array.isArray(parsed.data)) {
      returnedCount = parsed.data.length;
    }
    // Check pagination indicators
    if (parsed?.has_more !== undefined) hasMore = !!parsed.has_more;
    if (parsed?.hasMore !== undefined) hasMore = !!parsed.hasMore;
    if (parsed?.next_page !== undefined) { nextPage = parsed.next_page; hasMore = true; }
    if (parsed?.nextPage !== undefined) { nextPage = parsed.nextPage; hasMore = true; }
    if (parsed?.next_cursor !== undefined) { nextCursor = parsed.next_cursor; hasMore = true; }
    if (parsed?.nextCursor !== undefined) { nextCursor = parsed.nextCursor; hasMore = true; }
    if (parsed?.total !== undefined) totalCount = parsed.total;
    if (parsed?.total_count !== undefined) totalCount = parsed.total_count;
    if (parsed?.totalCount !== undefined) totalCount = parsed.totalCount;
    if (totalCount && returnedCount < totalCount) hasMore = true;
  } catch (_e) { /* not JSON, estimate from text */ }

  return { hasMore, nextPage, nextCursor, totalCount, returnedCount };
}

interface PaginationState {
  toolName: string;
  lastPage: number;
  lastOffset: number;
  nextCursor?: string;
  totalCount?: number;
  returnedSoFar: number;
  hasMore: boolean;
}

/** Extract pagination state from conversation history */
function extractPaginationState(conversationHistory: ChatMessage[]): Record<string, PaginationState> | null {
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const msg = conversationHistory[i];
    if (msg.role !== 'assistant') continue;
    const meta = msg.metadata || {};
    if (meta.pendingPagination) {
      return meta.pendingPagination as Record<string, PaginationState>;
    }
  }
  return null;
}

// ─── Tool Arg Helpers ────────────────────────────────────────────────────────

function sanitizeToolArgs(
  args: Record<string, unknown>,
  schema: unknown
): Record<string, unknown> {
  const s = schema as { properties?: Record<string, unknown> } | undefined;
  if (!s?.properties) return args;
  const allowed = new Set(Object.keys(s.properties));
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (allowed.has(k)) cleaned[k] = v;
  }
  return cleaned;
}

function injectScopeIds(
  args: Record<string, unknown>,
  schema: unknown,
  entityId: string,
  orgId: string
): Record<string, unknown> {
  const s = schema as { properties?: Record<string, unknown> } | undefined;
  if (!s?.properties) return args;
  const result = { ...args };
  // Inject entity_id / entityId if schema expects it and it's missing
  if ('entity_id' in s.properties && !result.entity_id && entityId) result.entity_id = entityId;
  if ('entityId' in s.properties && !result.entityId && entityId) result.entityId = entityId;
  if ('org_id' in s.properties && !result.org_id && orgId) result.org_id = orgId;
  if ('orgId' in s.properties && !result.orgId && orgId) result.orgId = orgId;
  return result;
}

function isWriteTool(toolName: string): boolean {
  return /^(create_|update_|delete_|void_|cancel_)/.test(toolName);
}

function isToolResultError(result: string): boolean {
  const lower = result.toLowerCase();
  if (lower.startsWith('error:') || lower.startsWith('{"error"')) return true;
  try {
    const parsed = JSON.parse(result);
    if (parsed.error || parsed.Error || parsed.message?.toLowerCase().includes('error')) return true;
  } catch (_e) { /* not JSON */ }
  return false;
}

const DEFAULT_AZURE_OPENAI_ENDPOINT = "https://lovable-hellobooks-resource.cognitiveservices.azure.com/openai/v1/";

function resolveLLMBaseEndpoint(endpoint: string | null | undefined): string {
  const raw = (endpoint || "").trim();
  if (!raw) return DEFAULT_AZURE_OPENAI_ENDPOINT;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (
      host.endsWith(".supabase.co") ||
      path.includes("/functions/v1") ||
      path.endsWith("/v1/messages")
    ) {
      console.warn(`[api] LLM endpoint "${raw}" looks incompatible with chat/completions. Falling back to default endpoint.`);
      return DEFAULT_AZURE_OPENAI_ENDPOINT;
    }
    return raw;
  } catch (_e) {
    console.warn(`[api] Invalid LLM endpoint "${raw}". Falling back to default endpoint.`);
    return DEFAULT_AZURE_OPENAI_ENDPOINT;
  }
}

function getUserFacingErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("fetch failed")) {
    return "I couldn't reach the AI service right now. Please try again in a moment. If this keeps happening, check LLM endpoint and API key in settings.";
  }
  if (lower.includes("llm service unreachable")) {
    return "I couldn't reach the AI service right now. Please verify LLM endpoint and API key in settings.";
  }
  if (lower.includes("openai api error") && lower.includes("401")) {
    return "AI credentials look invalid. Please verify the LLM API key and endpoint in settings.";
  }
  if (lower.includes("openai api error") && lower.includes("429")) {
    return "The AI service is rate-limited right now. Please wait a moment and try again.";
  }
  if (lower.includes("openai api error") && lower.includes("404")) {
    return "LLM endpoint appears misconfigured. Please verify endpoint and model settings.";
  }
  if (lower.includes("mcp connection failed")) {
    return "HelloBooks connection failed. Please reconnect and try again.";
  }
  return "I couldn't complete this request right now. Please try again in a moment.";
}

// ─── Attachment Processing ────────────────────────────────────────────────────

async function buildUserContent(query: string, attachments?: Attachment[]): Promise<string | unknown[]> {
  if (!attachments || attachments.length === 0) return query;

  const contentParts: unknown[] = [];
  let textContext = query;

  for (const att of attachments) {
    const isImage = att.type?.startsWith("image/");

    if (isImage && att.url) {
      // Images: pass as image_url for GPT-4o vision
      contentParts.push({ type: "image_url", image_url: { url: att.url, detail: "auto" } });
      console.log(`[api] Attachment image: ${att.name}`);
    } else if (att.url) {
      // Documents (PDF, Excel, CSV, etc.): fetch and extract text content
      try {
        console.log(`[api] Fetching document: ${att.name} (${att.type})`);
        const res = await fetch(att.url);
        if (!res.ok) {
          textContext += `\n\n[Attached file: ${att.name} — could not fetch content (HTTP ${res.status})]`;
          continue;
        }

        if (att.type === "text/csv" || att.name.endsWith(".csv")) {
          // CSV: include raw text
          const csvText = await res.text();
          const preview = csvText.length > 8000 ? csvText.slice(0, 8000) + "\n... (truncated)" : csvText;
          textContext += `\n\n--- Content of ${att.name} ---\n${preview}\n--- End of file ---`;
        } else {
          // PDF / other binary: try to extract readable text from raw bytes
          const buffer = await res.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          // Extract text streams from PDF (between parentheses after Tj/TJ operators)
          let extracted = "";
          const text = new TextDecoder("latin1").decode(bytes);
          // Method 1: Extract text between BT...ET blocks with Tj/TJ operators
          const tjMatches = text.matchAll(/\(([^)]{1,500})\)\s*Tj/g);
          for (const m of tjMatches) extracted += m[1];
          // Method 2: Extract TJ array strings
          const tjArrayMatches = text.matchAll(/\[([^\]]{1,2000})\]\s*TJ/g);
          for (const m of tjArrayMatches) {
            const innerStrings = m[1].matchAll(/\(([^)]{1,500})\)/g);
            for (const s of innerStrings) extracted += s[1];
          }

          if (extracted.length > 50) {
            // Clean up common PDF encoding artifacts
            const cleaned = extracted
              .replace(/\\n/g, "\n")
              .replace(/\\r/g, "")
              .replace(/\\t/g, " ")
              .replace(/\\\(/g, "(")
              .replace(/\\\)/g, ")")
              .replace(/\s{3,}/g, "  ")
              .trim();
            const preview = cleaned.length > 8000 ? cleaned.slice(0, 8000) + "\n... (truncated)" : cleaned;
            textContext += `\n\n--- Content extracted from ${att.name} ---\n${preview}\n--- End of file ---`;
            console.log(`[api] Extracted ${cleaned.length} chars from ${att.name}`);
          } else {
            textContext += `\n\n[Attached file: ${att.name} (${att.type}) — content could not be extracted as text. The user may need to share a screenshot or image of the document for visual analysis.]`;
            console.log(`[api] Could not extract text from ${att.name}, only got ${extracted.length} chars`);
          }
        }
      } catch (err) {
        console.error(`[api] Error processing attachment ${att.name}:`, err);
        textContext += `\n\n[Attached file: ${att.name} — error processing: ${err instanceof Error ? err.message : "unknown"}]`;
      }
    }
  }

  // If we have image parts, build a multimodal content array
  if (contentParts.length > 0) {
    return [{ type: "text", text: textContext }, ...contentParts];
  }

  // Text-only (documents were injected into textContext)
  return textContext;
}

// ─── OpenAI Call ──────────────────────────────────────────────────────────────

async function callOpenAI(
  config: LLMConfig,
  systemPrompt: string,
  messages: unknown[],
  tools?: OpenAITool[],
  maxTokens?: number
): Promise<{
  finish_reason: string;
  message: {
    role: string;
    content: string | null;
    tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[];
  };
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}> {
  const baseEndpoint = resolveLLMBaseEndpoint(config.endpoint);
  const endpoint = `${baseEndpoint.replace(/\/$/, "")}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "api-key": config.api_key || "",
  };

  const allMessages = [
    { role: "developer", content: systemPrompt },
    ...messages,
  ];

  const body: Record<string, unknown> = {
    model: config.model,
    max_completion_tokens: maxTokens || config.max_tokens || 4096,
    messages: allMessages,
  };
  if (tools && tools.length > 0) body.tools = tools;

  let res: Response;
  try {
    res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`LLM service unreachable: ${msg}`);
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${res.status} - ${err.slice(0, 200)}`);
  }

  const result = await res.json();
  const choice = result.choices?.[0];
  if (!choice) throw new Error("No choices returned from OpenAI");

  return {
    finish_reason: choice.finish_reason,
    message: choice.message,
    usage: result.usage,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Validate Authorization
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized', code: 'MISSING_AUTH' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const token = authHeader.replace('Bearer ', '').trim();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid token', code: 'INVALID_TOKEN' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  let body: {
    query: string;
    conversationId?: string;
    conversationHistory?: ChatMessage[];
    stream?: boolean;
    entityId?: string;
    orgId?: string;
    attachments?: Attachment[];
  };
  try {
    body = await req.json();
  } catch (_e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const { query, conversationId, conversationHistory: rawConversationHistory = [], stream = true, entityId, orgId, attachments } = body;
  const normalizedConversationId = typeof conversationId === 'string' ? conversationId.trim() : '';
  const effectiveConversationId = normalizedConversationId || crypto.randomUUID();
  // Normalize roles: treat 'agent' as 'assistant'
  let conversationHistory = normalizeConversationHistory(rawConversationHistory);
  const hAuthHeader = req.headers.get('H-Authorization');
  const mcpAuthFromHeader = hAuthHeader?.startsWith('Bearer ') ? hAuthHeader.replace('Bearer ', '').trim() : null;
  const mcpAuthToken = mcpAuthFromHeader || Deno.env.get('MCP_HELLOBOOKS_AUTH_TOKEN');
  const mcpEntityId = entityId || Deno.env.get('MCP_HELLOBOOKS_ENTITY_ID');
  const mcpOrgId = orgId || Deno.env.get('MCP_HELLOBOOKS_ORG_ID');
  const effectiveEntityId = mcpEntityId || "default";

  if (!query || typeof query !== 'string') {
    return new Response(JSON.stringify({ error: 'Query is required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Prefer persisted conversation history from DB when available
  if (normalizedConversationId) {
    try {
      const { data: existingRows, error: historyLoadError } = await supabase
        .from("unified_conversations")
        .select("messages")
        .eq("conversation_id", effectiveConversationId)
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (historyLoadError) throw historyLoadError;

      const persistedHistory = parseConversationMessages(existingRows?.[0]?.messages);
      if (persistedHistory.length > 0) {
        conversationHistory = persistedHistory;
        console.log(`[api] Loaded ${persistedHistory.length} persisted messages for conversation ${effectiveConversationId}`);
      }
    } catch (historyError) {
      console.warn('[api] Failed to load persisted conversation history, falling back to request history:', historyError);
    }
  }

  // Get LLM config
  const { data: llmConfig, error: llmError } = await supabase
    .from("llm_configs").select("*").eq("is_default", true).single();

  if (llmError || !llmConfig?.api_key) {
    return new Response(JSON.stringify({ error: 'LLM not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const startTime = Date.now();

  // ─── Confirmation Detection ─────────────────────────────────────────────
  const isConfirmation = isConfirmationMessage(query);
  const pendingAction = isConfirmation ? extractPendingAction(conversationHistory) : null;
  // Merge any extra fields from the confirmation message into pending args
  if (isConfirmation && pendingAction) {
    const extraFields = extractFieldsFromConfirmation(query);
    Object.assign(pendingAction.args, extraFields);
    console.log(`[api] Confirmation with pending action: ${pendingAction.toolName}, extra fields:`, extraFields);
  }

  // ============================
  // Setup SSE stream
  const encoder = new TextEncoder();
  let streamController: ReadableStreamDefaultController<Uint8Array>;

  const responseStream = new ReadableStream({
    start(controller) { streamController = controller; },
    cancel() { console.log('[SSE] Client disconnected'); }
  });

  const sendEvent = (type: string, data: unknown) => {
    const event: SSEEvent = { type, data, timestamp: new Date().toISOString() };
    const message = `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
    try { streamController.enqueue(encoder.encode(message)); } catch (_e) { /* ignore */ }
  };

  const sendComplete = (data: Record<string, unknown>) => {
    sendEvent('complete', {
      conversationId: effectiveConversationId,
      ...data,
    });
  };

  const closeStream = () => {
    try { streamController.close(); } catch (_e) { /* ignore */ }
  };

  // Process in background
  (async () => {
    const apiMessageId = crypto.randomUUID().slice(0, 8);
    let feedbackPath = "unknown";
    let feedbackIntent: string | null = null;
    let feedbackIntentConfidence: number | null = null;
    let feedbackModel: string | null = null;
    let feedbackToolsLoaded: string[] = [];
    let feedbackToolsUsed: string[] = [];
    let feedbackStrategy: string | null = null;
    let feedbackResponse: string | null = null;
    let feedbackTokenCost: number | null = null;
    let feedbackCategory: QueryCategory | 'unknown' = 'unknown';
    let mcpClientInstance: StreamableMCPClient | null = null;
    // Hoisted so finally block can access real tool inputs/results
    let allMcpResults: { tool: string; input?: Record<string, unknown>; result?: string; error?: string; success: boolean; attempts?: number }[] = [];

    try {
      sendEvent('connected', {
        sessionId: effectiveConversationId,
        conversationId: effectiveConversationId,
        userId: user.id,
        messageId: apiMessageId,
      });
      sendEvent('understanding_started', { message: 'Analyzing your query...' });

      // ─── MCP Connection ──────────────────────────────────────────────
      let mcpTools: { name: string; description: string; inputSchema: unknown }[] = [];

      console.log(`[api] MCP credentials check — auth:${!!mcpAuthToken}, entityId:${!!mcpEntityId}, orgId:${!!mcpOrgId}`);

      const mcpMissing = !mcpAuthToken || !mcpEntityId || !mcpOrgId;

      if (!mcpMissing) {
        try {
          const mcpBaseUrl = Deno.env.get('MCP_BASE_URL') || '';
          if (!mcpBaseUrl) {
            console.error('[api] MCP_BASE_URL not configured');
            sendEvent('error', { message: 'Data source not configured', recoverable: true });
          } else {
            const result = await createMCPClient(apiMessageId, mcpBaseUrl, mcpAuthToken!, mcpEntityId!, mcpOrgId!);
            if (result) {
              mcpClientInstance = result.client;
              mcpTools = result.tools;
              console.log(`[api] MCP: ${mcpTools.length} tools loaded`);
            } else {
              sendEvent('error', { message: 'MCP connection failed: could not initialize', recoverable: true });
            }
          }
        } catch (e) {
          sendEvent('error', { message: `MCP connection failed: ${e instanceof Error ? e.message : String(e)}`, recoverable: true });
        }
      }

      // ─── Check: if MCP not connected and query needs tools, return clear message ──
      if (attachments?.length) {
        console.log(`[api] Received ${attachments.length} attachment(s): ${attachments.map(a => `${a.name} (${a.type})`).join(', ')}`);
      }
      const classification = classifyQuery(query);
      feedbackCategory = classification.category;
      const needsTools = classification.category !== 'general_chat';

      if (needsTools && !mcpClientInstance && !isConfirmation) {
        const missingParts: string[] = [];
        if (!mcpAuthToken) missingParts.push('H-Authorization');
        if (!mcpEntityId) missingParts.push('entityId');
        if (!mcpOrgId) missingParts.push('orgId');

        const errorMsg = missingParts.length > 0
          ? "HelloBooks connection is not active. Please reconnect and retry. Missing: " + missingParts.join(', ')
          : "HelloBooks connection could not be established. Please check your connection and try again.";

        console.log(`[api] MCP not available — missing: ${missingParts.join(', ')}`);

        sendEvent('route_classified', { path: 'error', category: 'mcp_unavailable' });
        sendEvent('response_chunk', { text: errorMsg });
        sendComplete({
          success: false, query, path: 'error', response: errorMsg,
          matchedIntent: null, reasoning: 'MCP not connected',
          executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
        });

        feedbackPath = "error_mcp";
        feedbackResponse = errorMsg;
        return;
      }

      const queryIsBulkList = isBulkListQuery(query);
      const queryRequestedEntities = detectRequestedEntities(query);
      const queryRequestedPageSize = extractRequestedPageSize(query);
      const queryIsPaginationFollowUp = isPaginationFollowUp(query);
      const queryIsOverdueList = isOverdueQuery(query) && queryRequestedEntities.length > 0;
      const queryPaginationState = queryIsPaginationFollowUp ? extractPaginationState(conversationHistory) : null;
      const mcpToolsByName = new Map(mcpTools.map(t => [t.name, t]));

      // ─── Helper: Execute a tool call with sanitization, scope injection, and retry ──
      async function executeToolCall(
        toolName: string,
        rawArgs: Record<string, unknown>,
        toolCallId: string,
      ): Promise<{ result: string; success: boolean; attempts: number; failureReason?: string }> {
        const mcpTool = mcpTools.find(t => t.name === toolName);
        const schema = mcpTool?.inputSchema;

        // Sanitize args by schema and inject scope IDs
        let args = sanitizeToolArgs(rawArgs, schema);
        args = injectScopeIds(args, schema, effectiveEntityId, mcpOrgId || '');

        // For list tools, inject pagination defaults if not already set
        if (isListTool(toolName)) {
          args = injectPaginationDefaults(
            args,
            schema,
            queryRequestedPageSize,
            queryIsBulkList || queryIsPaginationFollowUp,
          );
          if (queryIsBulkList) {
            args = injectAllRecordsDefaults(args, schema);
          }
          if (queryIsOverdueList) {
            args = injectOverdueDefaults(args, schema);
          }
          if (queryIsPaginationFollowUp) {
            const state = queryPaginationState?.[toolName];
            if (state) args = injectPaginationFollowUpArgs(args, schema, state);
          }
          console.log(`[api] List tool ${toolName} — injected pagination defaults:`, JSON.stringify(args));
        }

        const maxAttempts = isWriteTool(toolName) ? 2 : 1;
        let lastError = '';

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            console.log(`[api] Tool ${toolName} attempt ${attempt}/${maxAttempts} args:`, JSON.stringify(args));
            const result = await mcpClientInstance!.callTool(toolName, args);
            const truncated = truncateResult(result, isListTool(toolName) ? MAX_TOOL_RESULT_CHARS : 8000);

            // Check if result payload indicates an error
            if (isToolResultError(result)) {
              lastError = `Tool returned error payload: ${result.slice(0, 200)}`;
              console.warn(`[api] Tool ${toolName} attempt ${attempt} returned error-like payload: ${result.slice(0, 200)}`);
              if (attempt < maxAttempts) {
                console.log(`[api] Retrying ${toolName}...`);
                await new Promise(r => setTimeout(r, 500));
                continue;
              }
              return { result: truncated, success: false, attempts: attempt, failureReason: lastError };
            }

            return { result: truncated, success: true, attempts: attempt };
          } catch (e) {
            lastError = e instanceof Error ? e.message : String(e);
            console.error(`[api] Tool ${toolName} attempt ${attempt} threw:`, lastError);
            if (attempt < maxAttempts) {
              await new Promise(r => setTimeout(r, 500));
              continue;
            }
            return { result: `Error: ${lastError}`, success: false, attempts: attempt, failureReason: lastError };
          }
        }

        return { result: `Error: ${lastError}`, success: false, attempts: maxAttempts, failureReason: lastError };
      }

      // Fetch intents
      const { data: intents, error: intentsError } = await supabase
        .from('intents').select('*').eq('is_active', true);
      if (intentsError) throw new Error(`Failed to fetch intents: ${intentsError.message}`);

      sendEvent('route_started', { query, intentCount: intents?.length || 0, mcpToolCount: mcpTools.length });

      // ─── Determine effective category ──────────────────────────────────
      let effectiveCategory: QueryCategory;

      if (isConfirmation && pendingAction) {
        // Confirmation with pending action → unified
        effectiveCategory = 'unified';
        console.log(`[api] Confirmation detected with pending action: ${pendingAction.toolName}`);
        sendEvent('route_classified', {
          path: 'llm', category: 'unified',
          confidence: 1.0, isConfirmation: true,
          pendingAction: pendingAction.toolName,
        });
      } else if (isConfirmation && !pendingAction) {
        // Confirmation but no pending action found — use unified
        effectiveCategory = 'unified';
        console.log(`[api] Confirmation without pending action, using unified category`);
        sendEvent('route_classified', {
          path: 'llm', category: 'unified',
          confidence: 0.8, isConfirmation: true, noPendingAction: true,
        });
      } else {
        effectiveCategory = classification.category;
      }
      feedbackCategory = effectiveCategory;

      // ============================
      // LAYER 1: Intent matching against DB (skip for confirmations)
      // ============================
      let bestIntent: { id: string; name: string; description: string; confidence: number; resolution_flow?: Intent['resolution_flow'] } | null = null;

      if (!isConfirmation) {
        for (const intent of (intents as Intent[]) || []) {
          const queryLower = query.toLowerCase();
          const trainingPhrases = intent.training_phrases || [];

          for (const phrase of trainingPhrases) {
            const phraseLower = (typeof phrase === 'string' ? phrase : '').toLowerCase();
            if (!phraseLower) continue;

            if (queryLower === phraseLower) {
              bestIntent = { id: intent.id, name: intent.name, description: intent.description, confidence: 0.95, resolution_flow: intent.resolution_flow };
              break;
            }
            if (queryLower.includes(phraseLower) || phraseLower.includes(queryLower)) {
              const similarity = Math.min(queryLower.length, phraseLower.length) / Math.max(queryLower.length, phraseLower.length);
              const candidateConfidence = 0.7 + similarity * 0.25;
              if (!bestIntent || candidateConfidence > bestIntent.confidence) {
                bestIntent = { id: intent.id, name: intent.name, description: intent.description, confidence: candidateConfidence, resolution_flow: intent.resolution_flow };
              }
            }
          }

          if (bestIntent?.confidence === 0.95) break;
        }
      }

      const deterministicListEntities = queryRequestedEntities.length > 0
        ? queryRequestedEntities
        : [];
      const useDeterministicListPath = !SIMPLE_DIRECT_LLM_MODE && !isConfirmation && queryIsBulkList && deterministicListEntities.length > 0;

      if (useDeterministicListPath) {
        sendEvent('route_classified', {
          path: 'deterministic_list',
          category: effectiveCategory,
          entities: deterministicListEntities,
        });

        const listPicks = selectPreferredListToolsForEntities(deterministicListEntities, mcpTools);
        const deterministicMcpResults: { tool: string; input?: Record<string, unknown>; result?: string; error?: string; success: boolean; attempts?: number }[] = [];
        allMcpResults = deterministicMcpResults;

        if (listPicks.length === 0) {
          const msg = "I couldn't find matching list tools from your connected data source. Please reconnect HelloBooks and try again.";
          sendEvent('response_chunk', { text: msg });
          sendComplete({
            success: false, query, path: 'deterministic_list',
            matchedIntent: null, reasoning: 'No matching dynamic list tools',
            response: msg,
            executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
          });
          feedbackPath = "deterministic_list";
          feedbackResponse = msg;
          return;
        }

        const sections: string[] = [];
        let anySuccess = false;
        const toolsUsed: string[] = [];

        for (const pick of listPicks) {
          sendEvent('executing_tool', { tool: pick.toolName, entity: pick.entity, isWrite: false });
          const execResult = await executeToolCall(pick.toolName, {}, `det-list-${pick.entity}`);

          deterministicMcpResults.push({
            tool: pick.toolName,
            input: {},
            result: execResult.result,
            success: execResult.success,
            error: execResult.failureReason,
            attempts: execResult.attempts,
          });

          const parsed = parseListToolResult(execResult.result || '');
          const pag = extractPaginationMeta(pick.toolName, execResult.result || '');
          const hasMore = parsed.hasMore !== undefined ? parsed.hasMore : pag.hasMore;
          const totalCount = parsed.totalCount ?? pag.totalCount;

          sendEvent('tool_result', {
            tool: pick.toolName,
            success: execResult.success,
            recordCount: parsed.rows.length,
            attempts: execResult.attempts,
            entity: pick.entity,
          });

          if (!execResult.success) {
            sections.push(`## ${entityTitle(pick.entity)}\nI couldn't fetch records right now.`);
            continue;
          }

          anySuccess = true;
          toolsUsed.push(pick.toolName);
          sections.push(renderEntityTableSection(pick.entity, parsed.rows, totalCount, hasMore));
        }

        const responseParts: string[] = [];
        if (sections.length > 0) responseParts.push(sections.join('\n\n'));
        if (anySuccess) {
          responseParts.push("Would you like to see more records, or apply filters (date range, status, customer/vendor, amount)?");
        } else {
          responseParts.push("I wasn't able to fetch records right now. Please try again in a moment.");
        }
        const responseText = responseParts.join('\n\n').trim();

        for (let i = 0; i < responseText.length; i += 50) {
          sendEvent('response_chunk', { text: responseText.slice(i, i + 50) });
          await new Promise(r => setTimeout(r, 20));
        }

        sendComplete({
          success: anySuccess,
          query,
          path: 'deterministic_list',
          category: effectiveCategory,
          matchedIntent: null,
          extractedEntities: {},
          reasoning: `Deterministic list fetch for ${deterministicListEntities.join(', ')}`,
          toolResults: deterministicMcpResults.map(r => ({ tool: r.tool, success: r.success, error: r.error, attempts: r.attempts })),
          response: responseText,
          executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
        });

        feedbackPath = "deterministic_list";
        feedbackModel = `${(llmConfig as LLMConfig).provider}/${(llmConfig as LLMConfig).model}`;
        feedbackToolsLoaded = mcpTools.map(t => t.name);
        feedbackToolsUsed = toolsUsed;
        feedbackStrategy = "deterministic_list";
        feedbackResponse = responseText;
      } else {
        // ========== LLM PATH ==========
        if (!isConfirmation) {
          sendEvent('route_classified', {
            path: 'llm', category: effectiveCategory, confidence: classification.confidence,
            subCategory: classification.subCategory, matchedKeywords: classification.matchedKeywords,
            intentAttempted: bestIntent ? { name: bestIntent.name, confidence: bestIntent.confidence } : null,
          });
        }

        if (bestIntent && !isConfirmation) {
          sendEvent('intent_detected', {
            intent: { id: bestIntent.id, name: bestIntent.name, confidence: bestIntent.confidence },
            reasoning: `Low confidence (${(bestIntent.confidence * 100).toFixed(0)}%) — using LLM path`,
            lowConfidence: true,
          });
        }

        if (!SIMPLE_DIRECT_LLM_MODE && effectiveCategory === 'general_chat' && !isConfirmation) {
          sendEvent('tools_filtered', { category: effectiveCategory, toolCount: 0 });
          sendEvent('response_generating', { path: 'llm', category: effectiveCategory });

          const chatUserContent = await buildUserContent(query, attachments);
          const response = await callOpenAI(llmConfig as LLMConfig,
            SYSTEM_PROMPTS.general_chat,
            [...conversationHistory.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: chatUserContent }],
            [], 512
          );

          const responseText = response.message.content || '';
          const chunkSize = 50;
          for (let i = 0; i < responseText.length; i += chunkSize) {
            sendEvent('response_chunk', { text: responseText.slice(i, i + chunkSize) });
            await new Promise(r => setTimeout(r, 20));
          }

          sendComplete({
            success: true, query, path: 'llm', category: 'general_chat',
            matchedIntent: null, extractedEntities: {}, reasoning: 'General conversation',
            pipelineSteps: [], enrichments: [], response: responseText,
            executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
          });

          feedbackPath = "general_chat";
          feedbackModel = `${(llmConfig as LLMConfig).provider}/${(llmConfig as LLMConfig).model}`;
          feedbackStrategy = "general_chat_bypass";
          feedbackResponse = responseText;

        } else {
          // Bookkeeper or CFO path with filtered tools
          let toolSelection: ReturnType<typeof selectToolsForQuery>;
          let filteredTools: OpenAITool[];

          if (SIMPLE_DIRECT_LLM_MODE) {
            toolSelection = {
              toolNames: mcpTools.map(t => t.name),
              matchedCategories: ['all_mcp_tools'],
              strategy: 'direct_llm_all_mcp_tools',
            };
            filteredTools = buildOpenAIToolsFromMcp(mcpTools, toolSelection.toolNames);
          } else if (isConfirmation && pendingAction && pendingAction.toolName) {
            // For confirmations, load the tool group relevant to the pending action
            toolSelection = selectToolsForQuery(pendingAction.summary || query, 'unified', mcpTools);
            // Also ensure the specific pending tool is included
            if (!toolSelection.toolNames.includes(pendingAction.toolName)) {
              toolSelection.toolNames.push(pendingAction.toolName);
            }
            filteredTools = buildOpenAIToolsFromMcp(mcpTools, toolSelection.toolNames);
          } else {
            toolSelection = selectToolsForQuery(query, effectiveCategory, mcpTools);
            filteredTools = buildOpenAIToolsFromMcp(mcpTools, toolSelection.toolNames);
          }

          // FALLBACK: If keyword filtering yielded 0 tools but MCP has tools, pass ALL
          const usingAllTools = filteredTools.length === 0 && mcpTools.length > 0;
          if (usingAllTools) {
            filteredTools = buildOpenAIToolsFromMcp(mcpTools, mcpTools.map(t => t.name));
            console.log(`[api] No keyword match — falling back to all ${filteredTools.length} MCP tools`);
          }

          sendEvent('tools_filtered', {
            category: effectiveCategory, toolCount: filteredTools.length,
            totalMcpTools: mcpTools.length, tools: filteredTools.map(t => t.function.name),
            strategy: toolSelection.strategy, groupsSelected: toolSelection.matchedCategories,
            isConfirmation,
          });

          const categoryPrompt = SIMPLE_DIRECT_LLM_MODE
            ? `You are a finance assistant connected to live MCP tools.
For every user request, call MCP tools when data/action is needed.
Do not invent data. Use tool results as the source of truth.
${NO_DATABASE_ID_EXPOSURE_RULE}`
            : SYSTEM_PROMPTS.unified;

          // ─── Pagination follow-up detection ───
          const isPaginationRequest = !SIMPLE_DIRECT_LLM_MODE && queryIsPaginationFollowUp;
          const existingPaginationState = queryPaginationState;
          let paginationContext = '';
          if (isPaginationRequest && existingPaginationState) {
            const stateEntries = Object.entries(existingPaginationState);
            const stateDesc = stateEntries.map(([tool, state]) =>
              `Tool "${tool}": returned ${state.returnedSoFar} so far, hasMore=${state.hasMore}, nextPage=${state.lastPage + 1}, offset=${state.lastOffset}`
            ).join('; ');
            paginationContext = `\n\n📄 PAGINATION CONTEXT: The user wants the NEXT page of results. Previous state: ${stateDesc}. Call the same list tool(s) with the next page/offset. Do NOT repeat the first page.`;
          }

          // ─── Bulk list detection ───
          const isBulkList = !SIMPLE_DIRECT_LLM_MODE && queryIsBulkList;
          const requestedEntities = queryRequestedEntities;
          let bulkListContext = '';
          if (isBulkList && requestedEntities.length >= 2) {
            bulkListContext = `\n\n📋 MULTI-LIST REQUEST: The user asked for ${requestedEntities.join(' AND ')}. You MUST call SEPARATE list tools for EACH entity type. Do NOT call just one tool. Call them all and present results in separate sections.`;
          }

          // Build system prompt with confirmation context
          let confirmationContext = '';
          if (isConfirmation && pendingAction) {
            const extraFieldsStr = Object.keys(pendingAction.args).length > 0
              ? ` Additional fields provided by user in this message: ${JSON.stringify(pendingAction.args)}.`
              : '';
            confirmationContext = `\n\n⚡ CONFIRMATION CONTEXT: The user just confirmed a previous action. You MUST immediately execute the action using tools. The pending tool is "${pendingAction.toolName || 'inferred from history'}".${extraFieldsStr} The previous context was: "${pendingAction.summary}". Do NOT ask for confirmation again. Do NOT generate fake data. Do NOT say you cannot create — call the appropriate tool NOW with all details from conversation history. If invoice_number is not specified, omit it to let the system auto-generate.`;
          } else if (isConfirmation) {
            confirmationContext = `\n\n⚡ CONFIRMATION CONTEXT: The user said "${query}" which is a confirmation/retry. Look at the conversation history to find what action was being discussed and execute it immediately using the available tools. Extract all parameters (customer, items, amounts, dates, tax) from the conversation history. Do NOT ask for more details unless a truly required field (customer name, amount, items) is completely missing. Do NOT generate fake data. Call the tool NOW.`;
          }

          // ─── Detail lookup context (created-doc resolver) ───
          const detailLookup = (!SIMPLE_DIRECT_LLM_MODE && !isConfirmation) ? detectDetailLookup(query) : null;
          let detailLookupContext = '';
          if (detailLookup) {
            const createdDocs = extractCreatedDocs(conversationHistory);
            const normalizedRef = normalizeDocRef(detailLookup.docRef);
            const matchedDoc = createdDocs.find(d =>
              d.docNumber && normalizeDocRef(d.docNumber) === normalizedRef
            );
            if (matchedDoc && matchedDoc.internalId) {
              detailLookupContext = `\n\n🔍 DOCUMENT LOOKUP CONTEXT: The user is asking about ${detailLookup.docType} "${detailLookup.docRef}". This document was created in this conversation. Internal ID: ${matchedDoc.internalId}. Use the get/view detail tool with this internal ID to fetch full details. If the first lookup returns empty, retry once after a brief pause — the record may still be syncing.`;
            } else {
              detailLookupContext = `\n\n🔍 DOCUMENT LOOKUP CONTEXT: The user is asking about ${detailLookup.docType} "${detailLookup.docRef}". Search by the document NUMBER/reference, NOT by ID. Use a search or find tool with the invoice/bill number parameter. If not found on first try and the document was recently created, retry once. Do NOT call get_invoice_by_id with the human-readable number — that requires an internal ID.`;
            }
          }

          let systemPrompt = `${categoryPrompt}\n\n${NO_DATABASE_ID_EXPOSURE_RULE}\n\nAvailable tools: ${filteredTools.map(t => t.function.name).join(', ')}\n\n⚠️ TOOL USAGE RULE: When the user asks for "all" records (all invoices, all bills, all customers, etc.), you MUST call the appropriate list tool immediately. Never say you cannot list records — always use the available tool to fetch them. Only pass parameters that are explicitly defined in the tool's schema.${confirmationContext}${paginationContext}${bulkListContext}${detailLookupContext}`;

          // For confirmations, include more history
          const historySlice = isConfirmation ? 20 : conversationHistory.length;
          const userContent = await buildUserContent(query, attachments);
          const messages: unknown[] = [
            ...conversationHistory.slice(-historySlice).map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userContent }
          ];

          let response = await callOpenAI(llmConfig as LLMConfig, systemPrompt, messages, filteredTools);
          let iterations = 0;
          const mcpResults: { tool: string; input?: Record<string, unknown>; result?: string; error?: string; success: boolean; attempts?: number }[] = [];
          // Keep outer reference in sync
          const syncMcpResults = () => { allMcpResults = mcpResults; };

          while (response.finish_reason === 'tool_calls' && iterations < 10) {
            iterations++;
            const toolCalls = response.message.tool_calls || [];
            if (toolCalls.length === 0) break;

            messages.push(response.message);

            for (const toolCall of toolCalls) {
              const requestedToolName = toolCall.function.name;
              let toolName = requestedToolName;
              let toolInput: Record<string, unknown> = {};
              try { toolInput = JSON.parse(toolCall.function.arguments); } catch (_e) { /* ok */ }

              if (!SIMPLE_DIRECT_LLM_MODE && (queryIsBulkList || queryIsOverdueList) && isListTool(requestedToolName)) {
                const requestedToolDef = mcpToolsByName.get(requestedToolName);
                const requestedEntity = inferEntityFromTool(
                  requestedToolName,
                  requestedToolDef?.description || '',
                  queryRequestedEntities,
                );

                if (requestedEntity && queryRequestedEntities.includes(requestedEntity)) {
                  const preferred = selectPreferredListToolForEntity(requestedEntity, mcpTools, queryIsOverdueList);
                  if (preferred && preferred.toolName !== requestedToolName) {
                    const currentScore = requestedToolDef
                      ? scoreListToolForEntity(requestedToolDef, requestedEntity, queryIsOverdueList)
                      : Number.NEGATIVE_INFINITY;
                    if (!Number.isFinite(currentScore) || preferred.score > currentScore + 1) {
                      toolName = preferred.toolName;
                      console.log(`[api] Remapped list tool ${requestedToolName} -> ${toolName} for entity ${requestedEntity} (score ${currentScore} -> ${preferred.score})`);
                    }
                  }
                }
              }

              if (mcpClientInstance) {
                sendEvent('executing_tool', { tool: toolName, requestedTool: requestedToolName, isWrite: isWriteTool(toolName) });

                // Note: extraction_state is emitted from AI-driven ```params blocks only (post-loop parsing)

                const execResult = await executeToolCall(toolName, toolInput, toolCall.id);

                mcpResults.push({
                  tool: toolName,
                  input: toolInput,
                  result: execResult.result,
                  success: execResult.success,
                  error: execResult.failureReason,
                  attempts: execResult.attempts,
                });

                let recordCount = 1;
                try { const p = JSON.parse(execResult.result); if (Array.isArray(p)) recordCount = p.length; } catch (_e) { /* ok */ }

                sendEvent('tool_result', {
                  tool: toolName,
                  success: execResult.success,
                  recordCount: execResult.success ? recordCount : 0,
                  attempts: execResult.attempts,
                  isWrite: isWriteTool(toolName),
                });

                messages.push({ role: 'tool', tool_call_id: toolCall.id, content: execResult.result });
              } else {
                const noMcpMsg = JSON.stringify({ error: 'HelloBooks connection is not active. Please reconnect and retry.' });
                messages.push({ role: 'tool', tool_call_id: toolCall.id, content: noMcpMsg });
                mcpResults.push({ tool: toolName, error: 'MCP not available', success: false });
              }
            }

            const autoEnrichments = detectAutoEnrichments(mcpResults);
            if (autoEnrichments.length > 0) sendEvent('enrichments_applying', { enrichments: autoEnrichments });

            sendEvent('response_generating', { iteration: iterations });

            const enrichmentContext = buildEnrichmentInstructions(autoEnrichments);
            if (enrichmentContext && iterations === 1) {
              systemPrompt += `\n\n${enrichmentContext}`;
            }

            response = await callOpenAI(llmConfig as LLMConfig, systemPrompt, messages, filteredTools);
          }

          syncMcpResults();

          // ─── Backend guardrail: block fake success cards ───
          let responseText = response.message.content || '';
          const hasSuccessfulWriteTool = mcpResults.some(r => isWriteTool(r.tool) && r.success);
          const hasSuccessCard = /\*\*📄.*\*\*|I've created the invoice successfully|invoice.*created.*successfully|bill.*created.*successfully/i.test(responseText);
          if (hasSuccessCard && !hasSuccessfulWriteTool) {
            console.warn(`[api] GUARDRAIL: Blocked fake success card (no successful write tool)`);
            const writeErrors = mcpResults.filter(r => isWriteTool(r.tool) && !r.success);
            if (writeErrors.length > 0) {
              responseText = "I wasn't able to complete this action right now. I've already retried automatically. Please check your HelloBooks connection and try again.";
            } else {
              responseText = responseText.replace(/---[\s\S]*?---/g, '').replace(/I've created.*successfully\./gi, '').trim();
              if (!responseText) responseText = "I need to call the creation tool first. Could you please confirm the details so I can proceed?";
            }
          }

          // ─── Guardrail: validate success card doc numbers against real tool output ───
          if (hasSuccessfulWriteTool && hasSuccessCard) {
            const successfulWrites = mcpResults.filter(r => isWriteTool(r.tool) && r.success && r.result);
            const realDocNumbers: string[] = [];
            for (const wr of successfulWrites) {
              const doc = parseCreatedDoc(wr.tool, wr.result!);
              if (doc?.docNumber) realDocNumbers.push(doc.docNumber);
            }
            // Check if card shows a doc number not in real results
            const cardDocMatch = responseText.match(/\*\*📄\s*([A-Z0-9][\w\-]+)\*\*/);
            if (cardDocMatch && realDocNumbers.length > 0) {
              const cardRef = normalizeDocRef(cardDocMatch[1]);
              const isReal = realDocNumbers.some(n => normalizeDocRef(n) === cardRef);
              if (!isReal) {
                console.warn(`[api] GUARDRAIL: Card shows "${cardDocMatch[1]}" but real doc numbers are: ${realDocNumbers.join(', ')}`);
                // Replace the fake number with the real one
                responseText = responseText.replace(cardDocMatch[1], realDocNumbers[0]);
              }
            }
            // If write succeeded but no doc number was returned, add note
            if (realDocNumbers.length === 0 && /INV-|BILL-/.test(responseText)) {
              responseText = responseText.replace(/INV-\S+|BILL-\S+/g, '(auto-generated)');
              responseText += "\n\n_Note: The reference number is being synced. Use 'show my latest invoice' to see it._";
            }
          }
          // ─── Parse AI-driven params block ───
          const paramsMatch = responseText.match(/```params\s*\n?([\s\S]*?)\n?\s*```/);
          if (paramsMatch) {
            try {
              const paramsData = JSON.parse(paramsMatch[1].trim());
              sendEvent('extraction_state', paramsData);
              console.log(`[api] params block: ${paramsData.operation}, applied=${paramsData.applied?.length || 0}, pending=${paramsData.pending?.length || 0}`);
            } catch (e) {
              console.warn('[api] Failed to parse params block:', e);
            }
            // Strip the block from visible text
            responseText = responseText.replace(/```params\s*\n?[\s\S]*?\n?\s*```/, '').trim();
          }

          const chunkSize = 50;
          for (let i = 0; i < responseText.length; i += chunkSize) {
            sendEvent('response_chunk', { text: responseText.slice(i, i + chunkSize) });
            await new Promise(r => setTimeout(r, 20));
          }

          const finalEnrichments = detectAutoEnrichments(mcpResults);

          // Build createdDocs for SSE so frontend can navigate to created records
          const createdDocsForComplete: CreatedDoc[] = [];
          for (const wr of mcpResults.filter(r => isWriteTool(r.tool) && r.success && r.result)) {
            const doc = parseCreatedDoc(wr.tool, wr.result!);
            if (doc) createdDocsForComplete.push(doc);
          }

          sendComplete({
            success: true, query, path: 'llm', category: effectiveCategory,
            matchedIntent: bestIntent ? { id: bestIntent.id, name: bestIntent.name, confidence: bestIntent.confidence } : null,
            extractedEntities: {},
            reasoning: isConfirmation
              ? `Confirmation flow: executed pending action`
              : (bestIntent ? `Low confidence (${(bestIntent.confidence * 100).toFixed(0)}%), used ${effectiveCategory} tools` : `Classified as ${effectiveCategory}`),
            pipelineSteps: mcpResults.map(r => ({ tool: r.tool, description: r.success ? 'Completed' : `Error: ${r.error}` })),
            enrichments: finalEnrichments,
            toolResults: mcpResults.map(r => ({ tool: r.tool, success: r.success, error: r.error, attempts: r.attempts })),
            response: responseText,
            executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
            isConfirmation,
            ...(createdDocsForComplete.length > 0 ? { createdDocs: createdDocsForComplete } : {}),
          });

          feedbackPath = "llm";
          feedbackIntent = bestIntent?.name || null;
          feedbackIntentConfidence = bestIntent?.confidence || null;
          feedbackModel = `${(llmConfig as LLMConfig).provider}/${(llmConfig as LLMConfig).model}`;
          feedbackToolsLoaded = filteredTools.map(t => t.function.name);
          feedbackToolsUsed = mcpResults.filter(r => r.success).map(r => r.tool);
          feedbackStrategy = isConfirmation ? 'confirmation_retry' : toolSelection.strategy;
          feedbackResponse = responseText;
        }
      }

    } catch (error) {
      console.error('[Error]', error);
      const safeMessage = getUserFacingErrorMessage(error);
      feedbackPath = "error";
      feedbackResponse = safeMessage;
      sendEvent('error', { message: safeMessage, code: 'PROCESSING_ERROR' });
      sendEvent('response_chunk', { text: safeMessage });
      sendComplete({
        success: false,
        query,
        path: 'error',
        response: safeMessage,
        matchedIntent: null,
        reasoning: 'Processing failed',
        executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
      });
    } finally {
      // Persist conversation to unified_conversations
      try {
        const userMsg = {
          id: crypto.randomUUID(),
          role: "user",
          content: query,
          timestamp: new Date().toISOString(),
        };
        // Detect pending action for next turn: if the bot used write tools or proposed a create
        let pendingToolForMeta: string | null = null;
        let pendingArgsForMeta: Record<string, unknown> | null = null;
        let pendingSummaryForMeta: string | null = null;

        // Use allMcpResults (hoisted) to capture REAL tool inputs for next-turn retry
        const writeToolResults = allMcpResults.filter(r => isWriteTool(r.tool));
        if (writeToolResults.length > 0) {
          const lastWrite = writeToolResults[writeToolResults.length - 1];
          pendingToolForMeta = lastWrite.tool;
          pendingArgsForMeta = lastWrite.input || {};
          pendingSummaryForMeta = (feedbackResponse || '').slice(0, 300);
        }
        // If the response text suggests a pending creation (e.g., "shall I create", "confirm")
        if (!pendingToolForMeta && feedbackResponse) {
          const proposalMatch = feedbackResponse.match(/(create|update)\s+(?:the\s+)?(?:this\s+)?(invoice|bill|payment|customer|vendor)/i);
          if (proposalMatch) {
            pendingToolForMeta = `${proposalMatch[1].toLowerCase()}_${proposalMatch[2].toLowerCase()}`;
            pendingSummaryForMeta = feedbackResponse.slice(0, 300);
            // Try to extract args from allMcpResults even if tool names don't exactly match
            const relatedResult = allMcpResults.find(r => r.tool.toLowerCase().includes(proposalMatch[2].toLowerCase()));
            if (relatedResult?.input) pendingArgsForMeta = relatedResult.input;
          }
        }

        // Build createdDocs from successful write tool results
        let createdDocsForMeta: CreatedDoc[] = [];
        const successfulWrites = allMcpResults.filter(r => isWriteTool(r.tool) && r.success && r.result);
        for (const wr of successfulWrites) {
          const doc = parseCreatedDoc(wr.tool, wr.result!);
          if (doc) createdDocsForMeta.push(doc);
        }

        // Build pagination state from REAL tool results
        let paginationStateForMeta: Record<string, PaginationState> | null = null;
        const listToolMcpResults = allMcpResults.filter(r => isListTool(r.tool) && r.success);
        if (listToolMcpResults.length > 0) {
          paginationStateForMeta = {};
          const prevPagState = extractPaginationState(conversationHistory);
          for (const mcpRes of listToolMcpResults) {
            const toolName = mcpRes.tool;
            const prevState = prevPagState?.[toolName];
            const pagMeta = extractPaginationMeta(toolName, mcpRes.result || '');
            paginationStateForMeta[toolName] = {
              toolName,
              lastPage: pagMeta.nextPage ? pagMeta.nextPage - 1 : (prevState?.lastPage ?? 0) + 1,
              lastOffset: (prevState?.lastOffset ?? 0) + pagMeta.returnedCount,
              nextCursor: pagMeta.nextCursor,
              totalCount: pagMeta.totalCount,
              returnedSoFar: (prevState?.returnedSoFar ?? 0) + pagMeta.returnedCount,
              hasMore: pagMeta.hasMore,
            };
          }
        }

        const agentMsg = {
          id: apiMessageId,
          role: "agent",
          content: feedbackResponse || "",
          timestamp: new Date().toISOString(),
          metadata: {
            route: feedbackPath,
            category: feedbackCategory,
            intent: feedbackIntent ? { name: feedbackIntent, confidence: feedbackIntentConfidence } : null,
            toolsUsed: feedbackToolsUsed,
            toolsLoaded: feedbackToolsLoaded,
            executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
            llmModel: feedbackModel,
            isConfirmation,
            ...(pendingToolForMeta ? {
              pendingTool: pendingToolForMeta,
              pendingArgs: pendingArgsForMeta || {},
              pendingSummary: pendingSummaryForMeta || '',
            } : {}),
            ...(paginationStateForMeta ? {
              pendingPagination: paginationStateForMeta,
            } : {}),
            ...(createdDocsForMeta.length > 0 ? {
              createdDocs: createdDocsForMeta,
            } : {}),
          },
        };

        const { data: existingRows, error: existingLookupError } = await supabase
          .from("unified_conversations")
          .select("id, messages, message_count")
          .eq("conversation_id", effectiveConversationId)
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(1);

        if (existingLookupError) throw existingLookupError;
        const existing = existingRows?.[0];

        if (existing) {
          const existingMessages = (existing.messages as unknown[]) || [];
          const updatedMessages = [...existingMessages, userMsg, agentMsg];
          const { error: updateError } = await supabase
            .from("unified_conversations")
            .update({
              messages: updatedMessages,
              message_count: updatedMessages.length,
              updated_at: new Date().toISOString(),
              last_message_preview: (feedbackResponse || '').slice(0, 200),
              mode: feedbackCategory || 'unified',
              entity_id: effectiveEntityId,
              org_id: mcpOrgId || null,
            })
            .eq("id", existing.id);
          if (updateError) {
            console.error('[Error] Failed to UPDATE conversation:', updateError);
            sendEvent('conversation_save_error', { error: 'update_failed' });
          }
        } else {
          const { error: insertError } = await supabase.from("unified_conversations").insert({
            conversation_id: effectiveConversationId,
            entity_id: effectiveEntityId,
            org_id: mcpOrgId || null,
            user_id: user.id,
            summary: query.slice(0, 100),
            messages: [userMsg, agentMsg],
            message_count: 2,
            auto_generated_name: query.slice(0, 80),
            mode: feedbackCategory || 'unified',
            last_message_preview: (feedbackResponse || '').slice(0, 200),
          });
          if (insertError) {
            console.error('[Error] Failed to INSERT conversation:', JSON.stringify(insertError));
            sendEvent('conversation_save_error', { error: 'insert_failed', detail: insertError.message || String(insertError) });
          }
        }
      } catch (convError) {
        console.error('[Error] Failed to persist conversation:', convError);
        try { sendEvent('conversation_save_error', { error: String(convError) }); } catch (_) { /* stream may be closed */ }
      }

      // Non-blocking feedback log
      const responseTimeMs = Date.now() - startTime;
      await logFeedback(supabase, {
        message_id: apiMessageId,
        conversation_id: effectiveConversationId,
        entity_id: effectiveEntityId,
        user_id: user.id,
        user_message: query,
        assistant_response: feedbackResponse,
        route_path: feedbackPath,
        intent_matched: feedbackIntent,
        intent_confidence: feedbackIntentConfidence,
        model_used: feedbackModel,
        tools_loaded: feedbackToolsLoaded,
        tools_used: feedbackToolsUsed,
        tool_selection_strategy: feedbackStrategy,
        response_time_ms: responseTimeMs,
        token_cost: feedbackTokenCost,
        implicit_signals: { source: "api", isConfirmation },
      }, "api");

      // RL logging
      if (feedbackPath === "fast" && feedbackIntent) {
        await logIntentRouting(supabase, {
          intentId: feedbackIntent,
          intentName: feedbackIntent,
          confidenceBucket: feedbackIntentConfidence ?? 0.85,
          success: !!feedbackResponse,
          responseTimeMs,
        }, "api");
      } else if (feedbackPath === "llm" || feedbackPath === "llm_tools") {
        await logLLMPathPattern(supabase, {
          queryText: query,
          entityId: effectiveEntityId,
          toolsUsed: feedbackToolsUsed || [],
          toolSelectionStrategy: feedbackStrategy || "unknown",
          responseTimeMs,
        }, "api");
        if (Math.random() < 0.1) {
          await checkForSuggestedIntents(supabase, "api");
        }
      }

      mcpClientInstance?.close();
      closeStream();
    }
  })();

  return new Response(responseStream, {
    headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }
  });
});

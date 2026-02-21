import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  selectToolsForQuery,
  buildOpenAIToolsFromMcp,
  type OpenAITool,
} from "./tool-groups.ts";
import { classifyQuery, detectCrossOver, type QueryCategory } from "./classifier.ts";
import { selectModelTier, SYSTEM_PROMPTS } from "./model-selector.ts";
import { detectAutoEnrichments, buildEnrichmentInstructions } from "./enrichment-auto-apply.ts";
import {
  generateCacheKey,
  checkCache,
  writeCache,
  determineTTL,
  invalidateCacheForEntity,
  hasWriteOperations,
} from "./response-cache.ts";
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
  metadata?: Record<string, unknown>;
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
  } catch { /* not JSON */ }
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



interface CreatedDoc {
  docType: string;          // 'invoice' | 'bill' | 'payment' | 'customer' | 'vendor'
  docNumber: string | null; // e.g. "INV-46466" — human-readable ref
  internalId: string | null;
  party: string | null;     // customer or vendor name
  amount: number | null;
  createdAt: string;
}

/** Parse a write-tool result to extract canonical document metadata */
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
    // Normalize: could be wrapped in arrays
    const record = Array.isArray(obj) ? obj[0] : obj;
    if (!record || typeof record !== 'object') return null;

    // Extract doc number variants
    docNumber = record.invoice_number || record.invoiceNumber || record.bill_number ||
      record.billNumber || record.number || record.document_number || record.reference_number ||
      record.credit_note_number || record.payment_number || null;

    // Internal ID
    internalId = record.id || record.invoice_id || record.bill_id || record.payment_id ||
      record.customer_id || record.vendor_id || record.contact_id || null;

    // Party
    party = record.customer_name || record.vendor_name || record.contact_name ||
      record.party_name || record.name || null;

    // Amount
    amount = record.total || record.amount || record.grand_total || record.balance || null;
    if (typeof amount === 'string') amount = parseFloat(amount) || null;
  } catch { /* not JSON */ }

  return { docType, docNumber, internalId, party, amount, createdAt: new Date().toISOString() };
}

/** Extract createdDocs from conversation history (recent messages only) */
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

/** Normalize an invoice/bill reference for comparison */
function normalizeDocRef(ref: string): string {
  return ref.replace(/[\s\-_]+/g, '').toUpperCase();
}

// ─── Invoice/Document Detail Lookup Patterns ─────────────────────────────────

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

    // Check if metadata has category=bookkeeper and toolsUsed
    const prevCategory = meta.category as string | undefined;
    const prevToolsUsed = (meta.toolsUsed as string[]) || [];
    if (prevCategory === 'bookkeeper' && prevToolsUsed.length > 0) {
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

const LIST_TOOL_PATTERNS = /^(get_|list_|fetch_|search_|find_)/i;

function isBulkListQuery(query: string): boolean {
  return BULK_LIST_PATTERNS.some(p => p.test(query));
}

function isPaginationFollowUp(query: string): boolean {
  return PAGINATION_FOLLOW_PATTERNS.some(p => p.test(query));
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

const DEFAULT_PAGE_SIZE = 15;
const MAX_PAGE_SIZE = 50;

/** Inject pagination defaults into list tool args */
function injectPaginationDefaults(
  args: Record<string, unknown>,
  schema: unknown,
  requestedSize?: number
): Record<string, unknown> {
  const s = schema as { properties?: Record<string, unknown> } | undefined;
  if (!s?.properties) return args;
  const result = { ...args };
  const pageSize = requestedSize ? Math.min(requestedSize, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;

  // Try common pagination param names
  const paginationKeys = ['limit', 'page_size', 'per_page', 'take', 'pageSize', 'perPage'];
  for (const key of paginationKeys) {
    if (key in s.properties && !(key in result)) {
      result[key] = pageSize;
      break;
    }
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
  } catch { /* not JSON, estimate from text */ }

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
  } catch { /* not JSON */ }
  return false;
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
  const baseEndpoint = config.endpoint || "https://lovable-hellobooks-resource.cognitiveservices.azure.com/openai/v1/";
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

  const res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });

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
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const { query, conversationId, conversationHistory: rawConversationHistory = [], stream = true, entityId, orgId } = body;
  // Normalize roles: treat 'agent' as 'assistant'
  const conversationHistory = normalizeConversationHistory(rawConversationHistory);
  const hAuthHeader = req.headers.get('H-Authorization');
  const mcpAuthFromHeader = hAuthHeader?.startsWith('Bearer ') ? hAuthHeader.replace('Bearer ', '').trim() : null;

  if (!query || typeof query !== 'string') {
    return new Response(JSON.stringify({ error: 'Query is required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Get LLM config
  const { data: llmConfig, error: llmError } = await supabase
    .from("llm_configs").select("*").eq("is_default", true).single();

  if (llmError || !llmConfig?.api_key) {
    return new Response(JSON.stringify({ error: 'LLM not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const mcpAuthToken = mcpAuthFromHeader || Deno.env.get('MCP_HELLOBOOKS_AUTH_TOKEN');
  const mcpEntityId = entityId || Deno.env.get('MCP_HELLOBOOKS_ENTITY_ID');
  const mcpOrgId = orgId || Deno.env.get('MCP_HELLOBOOKS_ORG_ID');
  const effectiveEntityId = mcpEntityId || "default";
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
  // CACHE CHECK — skip for confirmations and write intents
  // ============================
  if (!isConfirmation) {
    const { cacheKey, queryHash } = generateCacheKey(query, effectiveEntityId, "api");
    const cachedResponse = await checkCache(supabase, effectiveEntityId, cacheKey, "api");

    if (cachedResponse) {
      if (!stream) {
        return new Response(JSON.stringify({
          success: true, query, path: "cached", response: cachedResponse.content,
          matchedIntent: null, reasoning: "Served from cache",
          usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
          executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const encoder = new TextEncoder();
      const cacheStream = new ReadableStream({
        start(controller) {
          const send = (type: string, data: unknown) => {
            const event: SSEEvent = { type, data, timestamp: new Date().toISOString() };
            controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(event)}\n\n`));
          };
          send('connected', { sessionId: conversationId || crypto.randomUUID(), userId: user.id });
          send('route_classified', { path: 'cached', reason: 'Response served from cache' });
          send('response_chunk', { text: cachedResponse.content });
          send('complete', {
            success: true, query, path: 'cached', response: cachedResponse.content,
            matchedIntent: null, reasoning: 'Served from cache',
            usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
            executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
          });
          controller.close();
        }
      });
      return new Response(cacheStream, {
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }
      });
    }
  }

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
    try { streamController.enqueue(encoder.encode(message)); } catch { /* ignore */ }
  };

  const closeStream = () => {
    try { streamController.close(); } catch { /* ignore */ }
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
    let mcpClientInstance: StreamableMCPClient | null = null;
    // Hoisted so finally block can access real tool inputs/results
    let allMcpResults: { tool: string; input?: Record<string, unknown>; result?: string; error?: string; success: boolean; attempts?: number }[] = [];

    try {
      sendEvent('connected', { sessionId: conversationId || crypto.randomUUID(), userId: user.id, messageId: apiMessageId });
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
      const classification = classifyQuery(query);
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
        sendEvent('complete', {
          success: false, query, path: 'error', response: errorMsg,
          matchedIntent: null, reasoning: 'MCP not connected',
          executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
        });

        feedbackPath = "error_mcp";
        feedbackResponse = errorMsg;
        return;
      }

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
          args = injectPaginationDefaults(args, schema);
          console.log(`[api] List tool ${toolName} — injected pagination defaults:`, JSON.stringify(args));
        }

        const maxAttempts = isWriteTool(toolName) ? 2 : 1;
        let lastError = '';

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            console.log(`[api] Tool ${toolName} attempt ${attempt}/${maxAttempts} args:`, JSON.stringify(args));
            const result = await mcpClientInstance!.callTool(toolName, args);
            const truncated = truncateResult(result);

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
        // Confirmation with pending action → force bookkeeper category
        effectiveCategory = 'bookkeeper';
        console.log(`[api] Confirmation detected with pending action: ${pendingAction.toolName}`);
        sendEvent('route_classified', {
          path: 'llm', category: 'bookkeeper',
          confidence: 1.0, isConfirmation: true,
          pendingAction: pendingAction.toolName,
        });
      } else if (isConfirmation && !pendingAction) {
        // Confirmation but no pending action found — use previous category from history
        const lastAssistantMeta = conversationHistory.slice().reverse().find(m => m.role === 'assistant')?.metadata;
        const prevCategory = lastAssistantMeta?.category as QueryCategory | undefined;
        effectiveCategory = prevCategory || 'cfo';
        console.log(`[api] Confirmation without pending action, using previous category: ${effectiveCategory}`);
        sendEvent('route_classified', {
          path: 'llm', category: effectiveCategory,
          confidence: 0.8, isConfirmation: true, noPendingAction: true,
        });
      } else {
        effectiveCategory = classification.category;
      }

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

      const CONFIDENCE_THRESHOLD = 0.85;
      const useFastPath = !isConfirmation && bestIntent !== null && bestIntent.confidence >= CONFIDENCE_THRESHOLD;

      if (useFastPath && bestIntent) {
        // ========== FAST PATH ==========
        sendEvent('route_classified', { path: 'fast', intent: { name: bestIntent.name, confidence: bestIntent.confidence } });
        sendEvent('intent_detected', { intent: { id: bestIntent.id, name: bestIntent.name, confidence: bestIntent.confidence, description: bestIntent.description }, reasoning: `Matched with ${(bestIntent.confidence * 100).toFixed(0)}% confidence` });

        const resolutionFlow = bestIntent.resolution_flow || {};
        const pipeline = resolutionFlow.dataPipeline || [];
        const enrichments = resolutionFlow.enrichments || [];
        const responseConfig = resolutionFlow.responseConfig;

        if (pipeline.length > 0) sendEvent('pipeline_planned', { steps: pipeline.map(s => ({ tool: s.mcpTool || s.tool, description: s.description })) });
        if (enrichments.length > 0) sendEvent('enrichments_planned', { enrichments });

        // Execute pipeline
        const toolResults: { tool: string; success: boolean; data?: string; error?: string }[] = [];
        if (mcpClientInstance && pipeline.length > 0) {
          sendEvent('pipeline_executing', { stepCount: pipeline.length });
          for (const step of pipeline) {
            if (step.nodeType && step.nodeType !== 'api_call') continue;
            const toolName = step.mcpTool || step.tool;
            if (!toolName) continue;
            sendEvent('executing_tool', { tool: toolName });
            const mcpTool = mcpTools.find(t => t.name === toolName || t.name.toLowerCase().includes(toolName.toLowerCase()));
            if (mcpTool) {
              const execResult = await executeToolCall(mcpTool.name, {}, 'fast-path');
              let recordCount = 1;
              try { const p = JSON.parse(execResult.result); if (Array.isArray(p)) recordCount = p.length; } catch { /* ok */ }
              toolResults.push({ tool: toolName, success: execResult.success, data: execResult.success ? execResult.result : undefined, error: execResult.failureReason });
              sendEvent('tool_result', { tool: toolName, success: execResult.success, recordCount, attempts: execResult.attempts });
            } else {
              toolResults.push({ tool: toolName, success: false, error: 'Tool not found' });
              sendEvent('tool_result', { tool: toolName, success: false, error: 'Tool not available' });
            }
          }
        }

        // Format with LLM
        sendEvent('response_generating', { path: 'fast' });

        const dataContext = toolResults.filter(r => r.success).map(r => `[${r.tool}]: ${r.data}`).join('\n\n');
        const fastSystemPrompt = SYSTEM_PROMPTS.fast_path;

        const response = await callOpenAI(llmConfig as LLMConfig, fastSystemPrompt, [
          ...conversationHistory.map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: `Query: ${query}\n\nData:\n${dataContext}\n\n${responseConfig?.template ? `Format: ${responseConfig.template}` : ''}` }
        ], [], 2048);

        const responseText = response.message.content || '';

        const chunkSize = 50;
        for (let i = 0; i < responseText.length; i += chunkSize) {
          sendEvent('response_chunk', { text: responseText.slice(i, i + chunkSize) });
          await new Promise(r => setTimeout(r, 20));
        }

        sendEvent('complete', {
          success: true, query, path: 'fast',
          matchedIntent: { id: bestIntent.id, name: bestIntent.name, confidence: bestIntent.confidence },
          extractedEntities: {}, reasoning: `Fast path: ${(bestIntent.confidence * 100).toFixed(0)}% confidence`,
          pipelineSteps: pipeline, enrichments,
          toolResults: toolResults.map(r => ({ tool: r.tool, success: r.success, error: r.error })),
          response: responseText,
          executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
        });

        // Cache write — fast path
        const fastToolsUsed = toolResults.map(r => r.tool);
        if (!hasWriteOperations(fastToolsUsed)) {
          const ttl = determineTTL("fast", "fast", fastToolsUsed);
          const { cacheKey: ck, queryHash: qh } = generateCacheKey(query, effectiveEntityId, "api");
          await writeCache(supabase, effectiveEntityId, ck, qh, query, responseText, "fast", ttl, "api");
        } else {
          await invalidateCacheForEntity(supabase, effectiveEntityId, fastToolsUsed, "api");
        }

        feedbackPath = "fast";
        feedbackIntent = bestIntent.name;
        feedbackIntentConfidence = bestIntent.confidence;
        feedbackModel = `${(llmConfig as LLMConfig).provider}/${(llmConfig as LLMConfig).model}`;
        feedbackToolsLoaded = mcpTools.map(t => t.name);
        feedbackToolsUsed = toolResults.filter(r => r.success).map(r => r.tool);
        feedbackStrategy = "fast_path";
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

        if (effectiveCategory === 'general_chat' && !isConfirmation) {
          sendEvent('tools_filtered', { category: 'general_chat', toolCount: 0 });
          sendEvent('response_generating', { path: 'llm', category: 'general_chat' });

          const response = await callOpenAI(llmConfig as LLMConfig,
            SYSTEM_PROMPTS.general_chat,
            [...conversationHistory.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: query }],
            [], 512
          );

          const responseText = response.message.content || '';
          const chunkSize = 50;
          for (let i = 0; i < responseText.length; i += chunkSize) {
            sendEvent('response_chunk', { text: responseText.slice(i, i + chunkSize) });
            await new Promise(r => setTimeout(r, 20));
          }

          sendEvent('complete', {
            success: true, query, path: 'llm', category: 'general_chat',
            matchedIntent: null, extractedEntities: {}, reasoning: 'General conversation',
            pipelineSteps: [], enrichments: [], response: responseText,
            executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
          });

          const chatTTL = determineTTL("llm", "general_chat", []);
          const { cacheKey: ck, queryHash: qh } = generateCacheKey(query, effectiveEntityId, "api");
          await writeCache(supabase, effectiveEntityId, ck, qh, query, responseText, "general_chat", chatTTL, "api");

          feedbackPath = "general_chat";
          feedbackModel = `${(llmConfig as LLMConfig).provider}/${(llmConfig as LLMConfig).model}`;
          feedbackStrategy = "general_chat_bypass";
          feedbackResponse = responseText;

        } else {
          // Bookkeeper or CFO path with filtered tools
          let toolSelection: ReturnType<typeof selectToolsForQuery>;

          if (isConfirmation && pendingAction && pendingAction.toolName) {
            // For confirmations, load the tool group relevant to the pending action
            const pendingToolLower = pendingAction.toolName.toLowerCase();
            // Find which group contains this tool
            toolSelection = selectToolsForQuery(pendingAction.summary || query, 'bookkeeper');
            // Also ensure the specific pending tool is included
            if (!toolSelection.toolNames.includes(pendingAction.toolName)) {
              toolSelection.toolNames.push(pendingAction.toolName);
            }
          } else {
            toolSelection = selectToolsForQuery(query, effectiveCategory);
          }

          let filteredTools = buildOpenAIToolsFromMcp(mcpTools, toolSelection.toolNames);

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

          const categoryPrompt = effectiveCategory === 'bookkeeper' ? SYSTEM_PROMPTS.bookkeeper : SYSTEM_PROMPTS.cfo;

          // ─── Pagination follow-up detection ───
          const isPaginationRequest = isPaginationFollowUp(query);
          const existingPaginationState = isPaginationRequest ? extractPaginationState(conversationHistory) : null;
          let paginationContext = '';
          if (isPaginationRequest && existingPaginationState) {
            const stateEntries = Object.entries(existingPaginationState);
            const stateDesc = stateEntries.map(([tool, state]) =>
              `Tool "${tool}": returned ${state.returnedSoFar} so far, hasMore=${state.hasMore}, nextPage=${state.lastPage + 1}, offset=${state.lastOffset + DEFAULT_PAGE_SIZE}`
            ).join('; ');
            paginationContext = `\n\n📄 PAGINATION CONTEXT: The user wants the NEXT page of results. Previous state: ${stateDesc}. Call the same list tool(s) with the next page/offset. Do NOT repeat the first page.`;
          }

          // ─── Bulk list detection ───
          const isBulkList = isBulkListQuery(query);
          const requestedEntities = detectRequestedEntities(query);
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
          const detailLookup = !isConfirmation ? detectDetailLookup(query) : null;
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

          let systemPrompt = `${categoryPrompt}\n\nAvailable tools: ${filteredTools.map(t => t.function.name).join(', ')}\n\n⚠️ TOOL USAGE RULE: When the user asks for "all" records (all invoices, all bills, all customers, etc.), you MUST call the appropriate list tool immediately. Never say you cannot list records — always use the available tool to fetch them. Only pass parameters that are explicitly defined in the tool's schema.${confirmationContext}${paginationContext}${bulkListContext}${detailLookupContext}`;

          // For confirmations, include more history
          const historySlice = isConfirmation ? 20 : conversationHistory.length;
          const messages: unknown[] = [
            ...conversationHistory.slice(-historySlice).map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: query }
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
              const toolName = toolCall.function.name;
              let toolInput: Record<string, unknown> = {};
              try { toolInput = JSON.parse(toolCall.function.arguments); } catch { /* ok */ }

              if (mcpClientInstance) {
                sendEvent('executing_tool', { tool: toolName, isWrite: isWriteTool(toolName) });

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
                try { const p = JSON.parse(execResult.result); if (Array.isArray(p)) recordCount = p.length; } catch { /* ok */ }

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
          const chunkSize = 50;
          for (let i = 0; i < responseText.length; i += chunkSize) {
            sendEvent('response_chunk', { text: responseText.slice(i, i + chunkSize) });
            await new Promise(r => setTimeout(r, 20));
          }

          const finalEnrichments = detectAutoEnrichments(mcpResults);
          sendEvent('complete', {
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
          });

          // Cache write — LLM path (skip for write operations and confirmations)
          const llmToolsUsed = mcpResults.map(r => r.tool);
          if (!hasWriteOperations(llmToolsUsed) && !isConfirmation) {
            const ttl = determineTTL("llm", effectiveCategory, llmToolsUsed);
            const { cacheKey: ck, queryHash: qh } = generateCacheKey(query, effectiveEntityId, "api");
            await writeCache(supabase, effectiveEntityId, ck, qh, query, responseText, effectiveCategory, ttl, "api");
          } else if (hasWriteOperations(llmToolsUsed)) {
            await invalidateCacheForEntity(supabase, effectiveEntityId, llmToolsUsed, "api");
          }

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
      sendEvent('error', { message: error instanceof Error ? error.message : 'An unexpected error occurred', code: 'PROCESSING_ERROR' });
    } finally {
      // Persist conversation to unified_conversations
      const effectiveConversationId = conversationId || apiMessageId;
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
            category: isConfirmation ? 'bookkeeper' : (classification?.category || 'unknown'),
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

        const { data: existing } = await supabase
          .from("unified_conversations")
          .select("id, messages, message_count")
          .eq("conversation_id", effectiveConversationId)
          .single();

        if (existing) {
          const existingMessages = (existing.messages as unknown[]) || [];
          await supabase
            .from("unified_conversations")
            .update({
              messages: [...existingMessages, userMsg, agentMsg],
              message_count: (existing.message_count || 0) + 2,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        } else {
          await supabase.from("unified_conversations").insert({
            conversation_id: effectiveConversationId,
            entity_id: effectiveEntityId,
            user_id: user.id,
            summary: query.slice(0, 100),
            messages: [userMsg, agentMsg],
            message_count: 2,
          });
        }
      } catch (convError) {
        console.error('[Error] Failed to persist conversation:', convError);
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

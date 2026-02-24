export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  id?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface Attachment {
  name: string;
  url: string;
  type: string;
}

export interface CreatedDoc {
  docType: string;
  docNumber: string | null;
  internalId: string | null;
  party: string | null;
  amount: number | null;
  createdAt: string;
}

export interface PendingAction {
  toolName: string;
  args: Record<string, unknown>;
  summary: string;
}

export interface PaginationState {
  toolName: string;
  lastPage: number;
  lastOffset: number;
  nextCursor?: string;
  totalCount?: number;
  returnedSoFar: number;
  hasMore: boolean;
}

export interface DetailLookupIntent {
  docType: string;
  docRef: string;
}

const CONFIRMATION_PATTERNS = [
  /\b(yes|yep|yeah|haan|ha|kar\s*do|ok|okay|sure|correct|sahi|theek|confirm|confirmed)\b/i,
  /\bplease\s+(try|create|do|make|send|retry)\b/i,
  /\btry\s+again\b/i,
  /\b(do\s+it|go\s+ahead|proceed|retry|execute)\b/i,
];

const DETAIL_LOOKUP_PATTERNS = [
  /\b(?:show|get|view|display|find|fetch|details?\s+(?:of|for)?|info\s+(?:of|for)?)\b.*?\b(invoice|bill|credit.?note|payment)\b.*?\b([A-Z]{2,5}[\-\s]?\d{3,})\b/i,
  /\b(invoice|bill|credit.?note|payment)\b.*?\b([A-Z]{2,5}[\-\s]?\d{3,})\b/i,
];

const BULK_LIST_PATTERNS = [
  /\b(all|every|list|show\s+all|show\s+me\s+all|get\s+all|fetch\s+all|sab|sabhi|saare)\b/i,
  /\b(show|give|get|fetch|list)\s+(me\s+)?(all\s+)?(bills?|invoices?|customers?|vendors?|payments?|credit.?notes?|delivery.?challans?|transactions?)/i,
];

const PAGINATION_FOLLOW_PATTERNS = [
  /\b(more|next|next\s+page|show\s+more|aur\s+dikhao|agla|agle|next\s+\d+)\b/i,
  /\b(previous|prev|pichla|pehle\s+wale)\b/i,
];

const OVERDUE_PATTERNS = [
  /\boverdue\b/i,
  /\bpast\s+due\b/i,
  /\bdue\s+date\s+passed\b/i,
  /\blate\s+payments?\b/i,
];

const LIST_TOOL_PATTERNS = /^(get_|list_|fetch_|search_|find_)/i;

const DEFAULT_PAGE_SIZE = 15;
const MAX_PAGE_SIZE = 50;

export function normalizeConversationHistory(history: ChatMessage[]): ChatMessage[] {
  return history.map(m => ({
    ...m,
    role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
  }));
}

export function parseConversationMessages(raw: unknown): ChatMessage[] {
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

export function parseCreatedDoc(toolName: string, resultStr: string): CreatedDoc | null {
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
    if (typeof amount === 'string') amount = Number.parseFloat(amount) || null;
  } catch (_e) {
    // keep null defaults for non-JSON result
  }
  return { docType, docNumber, internalId, party, amount, createdAt: new Date().toISOString() };
}

export function extractCreatedDocs(conversationHistory: ChatMessage[]): CreatedDoc[] {
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

export function normalizeDocRef(ref: string): string {
  return ref.replace(/[\s\-_]+/g, '').toUpperCase();
}

export function detectDetailLookup(query: string): DetailLookupIntent | null {
  for (const pattern of DETAIL_LOOKUP_PATTERNS) {
    const match = query.match(pattern);
    if (match) {
      return { docType: match[1].toLowerCase().replace(/\s+/g, '_'), docRef: match[2] };
    }
  }
  return null;
}

export function isConfirmationMessage(query: string): boolean {
  const q = query.trim();
  if (q.split(/\s+/).length <= 8 && CONFIRMATION_PATTERNS.some(p => p.test(q))) return true;
  if (q.split(/\s+/).length <= 25 && CONFIRMATION_PATTERNS.some(p => p.test(q))) return true;
  return false;
}

export function extractFieldsFromConfirmation(query: string): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const invMatch = query.match(/invoice\s*(?:number|no|#)?\s*(?:is|:)?\s*([A-Z0-9][\w-]+)/i);
  if (invMatch) fields.invoice_number = invMatch[1];
  const billMatch = query.match(/bill\s*(?:number|no|#)?\s*(?:is|:)?\s*([A-Z0-9][\w-]+)/i);
  if (billMatch) fields.bill_number = billMatch[1];
  return fields;
}

export function extractPendingAction(conversationHistory: ChatMessage[]): PendingAction | null {
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const msg = conversationHistory[i];
    if (msg.role !== 'assistant') continue;
    const content = msg.content || '';
    const meta = msg.metadata || {};

    if (meta.pendingTool && meta.pendingArgs) {
      return {
        toolName: String(meta.pendingTool),
        args: meta.pendingArgs as Record<string, unknown>,
        summary: String(meta.pendingSummary || content.slice(0, 300)),
      };
    }

    const prevCategory = meta.category as string | undefined;
    const prevToolsUsed = (meta.toolsUsed as string[]) || [];
    if ((prevCategory === 'unified' || prevCategory === 'bookkeeper') && prevToolsUsed.length > 0) {
      const writeTools = prevToolsUsed.filter(t => /^(create_|update_|delete_|void_|cancel_)/.test(t));
      if (writeTools.length > 0) {
        return { toolName: writeTools[0], args: {}, summary: content.slice(0, 300) };
      }
    }

    const createMatch = content.match(/create\s+(invoice|bill|payment|customer|vendor)/i);
    if (createMatch) {
      return {
        toolName: `create_${createMatch[1].toLowerCase()}`,
        args: {},
        summary: content.slice(0, 300),
      };
    }

    if (/confirm|retry|try again|I'll.*create|shall I|would you like me to/i.test(content)) {
      const actionMatch = content.match(/(create|update|delete|void|cancel)\s+(?:the\s+)?(?:this\s+)?(invoice|bill|payment|customer|vendor|credit.?note)/i);
      if (actionMatch) {
        return {
          toolName: `${actionMatch[1].toLowerCase()}_${actionMatch[2].toLowerCase().replace(/\s+/g, '_')}`,
          args: {},
          summary: content.slice(0, 300),
        };
      }
      return { toolName: '', args: {}, summary: content.slice(0, 300) };
    }
  }

  return null;
}

export function isBulkListQuery(query: string): boolean {
  return BULK_LIST_PATTERNS.some(p => p.test(query));
}

export function isPaginationFollowUp(query: string): boolean {
  return PAGINATION_FOLLOW_PATTERNS.some(p => p.test(query));
}

export function isOverdueQuery(query: string): boolean {
  return OVERDUE_PATTERNS.some(p => p.test(query));
}

export function detectRequestedEntities(query: string): string[] {
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

export function extractRequestedPageSize(query: string): number | undefined {
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

export function isListTool(toolName: string): boolean {
  return LIST_TOOL_PATTERNS.test(toolName);
}

export function isWriteTool(toolName: string): boolean {
  return /^(create_|update_|delete_|void_|cancel_)/.test(toolName);
}

export function extractPaginationMeta(_toolName: string, result: string): {
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
    if (Array.isArray(parsed)) {
      returnedCount = parsed.length;
      hasMore = parsed.length >= DEFAULT_PAGE_SIZE;
    }
    if (parsed?.data && Array.isArray(parsed.data)) {
      returnedCount = parsed.data.length;
    }
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
  } catch (_e) {
    // estimate from text when not JSON
  }

  return { hasMore, nextPage, nextCursor, totalCount, returnedCount };
}

export function extractPaginationState(conversationHistory: ChatMessage[]): Record<string, PaginationState> | null {
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

export function buildPaginationStateFromToolResults(
  conversationHistory: ChatMessage[],
  toolResults: Array<{ tool: string; result?: string; success: boolean }>,
): Record<string, PaginationState> | null {
  const listResults = toolResults.filter(r => isListTool(r.tool) && r.success);
  if (listResults.length === 0) return null;

  const prevState = extractPaginationState(conversationHistory);
  const nextState: Record<string, PaginationState> = {};

  for (const result of listResults) {
    const prev = prevState?.[result.tool];
    const pag = extractPaginationMeta(result.tool, result.result || '');
    nextState[result.tool] = {
      toolName: result.tool,
      lastPage: pag.nextPage ? pag.nextPage - 1 : (prev?.lastPage ?? 0) + 1,
      lastOffset: (prev?.lastOffset ?? 0) + pag.returnedCount,
      nextCursor: pag.nextCursor,
      totalCount: pag.totalCount,
      returnedSoFar: (prev?.returnedSoFar ?? 0) + pag.returnedCount,
      hasMore: pag.hasMore,
    };
  }

  return nextState;
}

export function mergePendingActionArgs(
  pendingAction: PendingAction | null,
  confirmationQuery: string,
): PendingAction | null {
  if (!pendingAction) return null;
  const extraFields = extractFieldsFromConfirmation(confirmationQuery);
  if (Object.keys(extraFields).length === 0) return pendingAction;
  return {
    ...pendingAction,
    args: { ...pendingAction.args, ...extraFields },
  };
}

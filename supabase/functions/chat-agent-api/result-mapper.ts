import { normalizeDocRef, parseCreatedDoc, type CreatedDoc } from './conversation-state.ts';

export interface ToolExecutionResult {
  tool: string;
  input?: Record<string, unknown>;
  result?: string;
  error?: string;
  success: boolean;
  attempts?: number;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (_e) {
    return String(value);
  }
}

function readToolName(item: Record<string, unknown>): string | null {
  const candidates = [
    item.name,
    item.tool_name,
    item.toolName,
    (item.function as Record<string, unknown> | undefined)?.name,
    (item.rawItem as Record<string, unknown> | undefined)?.name,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

function readToolArgs(item: Record<string, unknown>): Record<string, unknown> | undefined {
  const direct = item.arguments ?? item.input ?? item.args;
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) return direct as Record<string, unknown>;

  const fromFunction = (item.function as Record<string, unknown> | undefined)?.arguments;
  if (typeof fromFunction === 'string') {
    try {
      const parsed = JSON.parse(fromFunction);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch (_e) {
      return undefined;
    }
  }

  return undefined;
}

function readToolResult(item: Record<string, unknown>): string {
  const candidates = [
    item.output,
    item.result,
    item.content,
    item.text,
    item.error,
    (item.rawItem as Record<string, unknown> | undefined)?.output,
    (item.rawItem as Record<string, unknown> | undefined)?.result,
  ];
  for (const value of candidates) {
    const str = asString(value).trim();
    if (str) return str;
  }
  return '';
}

function normalizeToolItem(item: unknown): ToolExecutionResult | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  const type = asString(obj.type || (obj.rawItem as Record<string, unknown> | undefined)?.type).toLowerCase();

  const couldBeTool =
    type.includes('tool') ||
    type.includes('function_call') ||
    'toolName' in obj ||
    'name' in obj ||
    'output' in obj ||
    'result' in obj;

  if (!couldBeTool) return null;

  const toolName = readToolName(obj);
  if (!toolName) return null;

  const output = readToolResult(obj);
  const error = asString(obj.error).trim();

  return {
    tool: toolName,
    input: readToolArgs(obj),
    result: output || undefined,
    error: error || undefined,
    success: !error && !/^(error:|\{\s*"error")/i.test(output),
    attempts: 1,
  };
}

export function collectToolResultsFromRunItems(items: unknown[]): ToolExecutionResult[] {
  const results: ToolExecutionResult[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const normalized = normalizeToolItem(item);
    if (!normalized) continue;
    const key = `${normalized.tool}|${JSON.stringify(normalized.input || {})}|${normalized.result || normalized.error || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(normalized);
  }

  return results;
}

export function extractTextFromRunResult(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const obj = result as Record<string, unknown>;

  if (typeof obj.finalOutput === 'string') return obj.finalOutput;
  if (typeof obj.final_output === 'string') return obj.final_output;

  const finalOutput = obj.finalOutput;
  if (Array.isArray(finalOutput)) {
    const text = finalOutput
      .map(item => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const rec = item as Record<string, unknown>;
          return asString(rec.text || rec.content || rec.output_text || rec.value);
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
    if (text.trim()) return text;
  }

  const output = obj.output;
  if (Array.isArray(output)) {
    const chunks: string[] = [];
    for (const item of output) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      if (rec.type === 'message' && Array.isArray(rec.content)) {
        for (const part of rec.content) {
          if (!part || typeof part !== 'object') continue;
          const p = part as Record<string, unknown>;
          const t = asString(p.text || p.output_text);
          if (t) chunks.push(t);
        }
      }
      const maybe = asString(rec.text || rec.content || rec.output_text);
      if (maybe) chunks.push(maybe);
    }
    if (chunks.length > 0) return chunks.join('\n');
  }

  return '';
}

export function applyWriteGuardrails(responseText: string, toolResults: ToolExecutionResult[]): string {
  const hasSuccessfulWriteTool = toolResults.some(r => /^(create_|update_|delete_|void_|cancel_)/.test(r.tool) && r.success);
  const hasSuccessCard = /\*\*📄.*\*\*|I've created the invoice successfully|invoice.*created.*successfully|bill.*created.*successfully/i.test(responseText);

  if (hasSuccessCard && !hasSuccessfulWriteTool) {
    return "I wasn't able to complete this action right now. I've already retried automatically. Please check your HelloBooks connection and try again.";
  }

  if (!hasSuccessCard || !hasSuccessfulWriteTool) return responseText;

  const successfulWrites = toolResults.filter(r => /^(create_|update_|delete_|void_|cancel_)/.test(r.tool) && r.success && r.result);
  const realDocNumbers: string[] = [];
  for (const writeResult of successfulWrites) {
    const doc = parseCreatedDoc(writeResult.tool, writeResult.result!);
    if (doc?.docNumber) realDocNumbers.push(doc.docNumber);
  }

  const cardDocMatch = responseText.match(/\*\*📄\s*([A-Z0-9][\w\-]+)\*\*/);
  if (cardDocMatch && realDocNumbers.length > 0) {
    const cardRef = normalizeDocRef(cardDocMatch[1]);
    const isReal = realDocNumbers.some(n => normalizeDocRef(n) === cardRef);
    if (!isReal) {
      return responseText.replace(cardDocMatch[1], realDocNumbers[0]);
    }
  }

  if (realDocNumbers.length === 0 && /INV-|BILL-/.test(responseText)) {
    return `${responseText.replace(/INV-\S+|BILL-\S+/g, '(auto-generated)')}\n\n_Note: The reference number is being synced. Use 'show my latest invoice' to see it._`;
  }

  return responseText;
}

export function buildCreatedDocs(toolResults: ToolExecutionResult[]): CreatedDoc[] {
  const docs: CreatedDoc[] = [];
  for (const result of toolResults) {
    if (!result.success || !result.result) continue;
    if (!/^(create_|update_)/.test(result.tool)) continue;
    const doc = parseCreatedDoc(result.tool, result.result);
    if (doc) docs.push(doc);
  }
  return docs;
}

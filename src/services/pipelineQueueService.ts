/**
 * Persistent Background Queue Service for AI Pipeline Suggestions
 * 
 * Features:
 * - localStorage persistence: survives page navigation & refresh
 * - Retry with exponential backoff (3 attempts: 2s, 4s, 8s)
 * - Auto-resume on initialization if pending items exist
 * - Rate-limit cooldown between requests (2s)
 * - Cancel support
 */

import { supabase } from '@/integrations/supabase/client';
import { toast as sonnerToast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────

export interface QueueItem {
  intentId: string;
  intentName: string;
  body: any;
  retryCount: number;
  maxRetries: number;
}

export interface QueueState {
  items: QueueItem[];
  processing: boolean;
  current: number;
  total: number;
  completed: number;
  failed: number;
  currentIntentName: string;
  cancelled: boolean;
}

export interface PendingSuggestion {
  status: 'pending' | 'done' | 'error';
  data?: any;
  error?: string;
  intentId: string;
  intentName: string;
}

// ─── Constants ───────────────────────────────────────────────────

const STORAGE_KEY = 'pipeline_queue_state';
const PENDING_KEY = 'pipeline_pending_suggestions';
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;
const COOLDOWN_MS = 2000;

// ─── State ───────────────────────────────────────────────────────

let queueState: QueueState = {
  items: [],
  processing: false,
  current: 0,
  total: 0,
  completed: 0,
  failed: 0,
  currentIntentName: '',
  cancelled: false,
};

const pendingSuggestions = new Map<string, PendingSuggestion>();
const suggestionListeners = new Map<string, (result: PendingSuggestion) => void>();
const queueStateListeners = new Set<() => void>();

// Navigation callback (set by component)
let navigateCallback: ((intentId: string) => void) | null = null;

// ─── Persistence ─────────────────────────────────────────────────

function saveToStorage() {
  try {
    const serializable = {
      items: queueState.items,
      current: queueState.current,
      total: queueState.total,
      completed: queueState.completed,
      failed: queueState.failed,
      cancelled: queueState.cancelled,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));

    // Save pending suggestions
    const pendingObj: Record<string, PendingSuggestion> = {};
    pendingSuggestions.forEach((v, k) => { pendingObj[k] = v; });
    localStorage.setItem(PENDING_KEY, JSON.stringify(pendingObj));
  } catch { /* localStorage full or unavailable */ }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.items?.length > 0 && !saved.cancelled) {
        queueState.items = saved.items;
        queueState.current = saved.current || 0;
        queueState.total = saved.total || saved.items.length;
        queueState.completed = saved.completed || 0;
        queueState.failed = saved.failed || 0;
        queueState.cancelled = false;
      }
    }

    const pendingRaw = localStorage.getItem(PENDING_KEY);
    if (pendingRaw) {
      const pendingObj = JSON.parse(pendingRaw);
      Object.entries(pendingObj).forEach(([k, v]) => {
        pendingSuggestions.set(k, v as PendingSuggestion);
      });
    }
  } catch { /* corrupted data */ }
}

function clearStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PENDING_KEY);
  } catch { /* ignore */ }
}

// ─── Notify ──────────────────────────────────────────────────────

function notifyListeners() {
  queueStateListeners.forEach(fn => fn());
}

// ─── Auto-save suggestion to DB ─────────────────────────────────

// Global refresh callback — set by the component
let refreshCallback: (() => void) | null = null;

export function setRefreshCallback(cb: (() => void) | null) {
  refreshCallback = cb;
}

async function autoSaveAISuggestion(intentId: string, aiData: any) {
  try {
    if (!aiData?.steps || aiData.steps.length === 0) return;

    const { data: intentRow, error: fetchErr } = await supabase
      .from('intents')
      .select('resolution_flow')
      .eq('id', intentId)
      .single();
    if (fetchErr || !intentRow) return;

    const currentFlow = (intentRow.resolution_flow as any) || {};
    const currentPipeline: any[] = currentFlow.dataPipeline || [];
    const existingTools = new Set(currentPipeline.filter((n: any) => n.mcpTool).map((n: any) => n.mcpTool));
    const existingVars = new Set(currentPipeline.map((n: any) => n.outputVariable));

    // Merge only new steps
    const newSteps = aiData.steps.filter((step: any) => {
      if (step.nodeType === 'api_call' && step.mcpTool && existingTools.has(step.mcpTool)) return false;
      if (existingVars.has(step.outputVariable)) return false;
      return true;
    });

    const mergedPipeline = [
      ...currentPipeline,
      ...newSteps.map((step: any, i: number) => ({
        nodeId: `ai_auto_${Date.now()}_${i}`,
        nodeType: step.nodeType,
        sequence: currentPipeline.length + i + 1,
        mcpTool: step.nodeType === 'api_call' ? step.mcpTool : undefined,
        parameters: [],
        formula: step.nodeType === 'computation' ? (step.formula || '') : undefined,
        condition: step.nodeType === 'conditional' ? (step.condition || '') : undefined,
        outputVariable: step.outputVariable,
        description: step.description,
      })),
    ];

    const updatedFlow = {
      ...currentFlow,
      dataPipeline: mergedPipeline,
      aiSuggestion: {
        summary: aiData.summary || '',
        personaRelevance: aiData.personaRelevance || {},
        suggestedAt: new Date().toISOString(),
        stepsAdded: newSteps.length,
        steps: aiData.steps || [],
        gaps: (aiData.steps || [])
          .filter((s: any) => s.toolAvailable === false)
          .map((s: any) => ({
            toolName: s.mcpTool,
            description: s.description,
            fallback: s.fallbackSuggestion,
          })),
      },
    };

    const { error: updateErr } = await supabase
      .from('intents')
      .update({ resolution_flow: updatedFlow })
      .eq('id', intentId);

    if (!updateErr) {
      console.log(`✅ Auto-saved AI pipeline for intent ${intentId}: ${newSteps.length} new steps merged`);
      if (refreshCallback) refreshCallback();
    }
  } catch (e) {
    console.error('Auto-save: unexpected error', e);
  }
}

// ─── Backoff helper ──────────────────────────────────────────────

function getBackoffDelay(retryCount: number): number {
  return BASE_DELAY_MS * Math.pow(2, retryCount); // 2s, 4s, 8s
}

// ─── Core Queue Processor ────────────────────────────────────────

async function processQueue() {
  if (queueState.processing) return;
  queueState.processing = true;
  queueState.cancelled = false;
  notifyListeners();
  saveToStorage();

  while (queueState.items.length > 0 && !queueState.cancelled) {
    const item = queueState.items[0]; // peek, don't shift yet
    queueState.current++;
    queueState.currentIntentName = item.intentName;
    notifyListeners();

    // Skip already-done items
    if (pendingSuggestions.get(item.intentId)?.status === 'done') {
      queueState.items.shift();
      queueState.completed++;
      notifyListeners();
      saveToStorage();
      continue;
    }

    pendingSuggestions.set(item.intentId, { status: 'pending', intentId: item.intentId, intentName: item.intentName });
    let success = false;

    try {
      const { data, error } = await supabase.functions.invoke('suggest-ideal-pipeline', { body: item.body });

      if (error || data?.error) {
        const errMsg = error?.message || data?.error || 'Unknown error';

        // Retry logic
        if (item.retryCount < item.maxRetries) {
          item.retryCount++;
          const delay = getBackoffDelay(item.retryCount);
          console.log(`[Queue] Retry ${item.retryCount}/${item.maxRetries} for "${item.intentName}" in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          // Don't shift — retry same item
          continue;
        }

        pendingSuggestions.set(item.intentId, { status: 'error', error: errMsg, intentId: item.intentId, intentName: item.intentName });
        queueState.failed++;
      } else {
        pendingSuggestions.set(item.intentId, { status: 'done', data, intentId: item.intentId, intentName: item.intentName });
        queueState.completed++;
        success = true;

        await autoSaveAISuggestion(item.intentId, data);
        sonnerToast.success(`AI pipeline saved for "${item.intentName}"`, {
          description: `${data.steps?.length || 0} steps suggested & auto-saved`,
          duration: 8000,
          action: navigateCallback ? { label: 'View', onClick: () => navigateCallback!(item.intentId) } : undefined,
        });
      }
    } catch (_e) {
      // Network error — retry
      if (item.retryCount < item.maxRetries) {
        item.retryCount++;
        const delay = getBackoffDelay(item.retryCount);
        console.log(`[Queue] Network retry ${item.retryCount}/${item.maxRetries} for "${item.intentName}" in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      pendingSuggestions.set(item.intentId, { status: 'error', error: 'Network error after retries', intentId: item.intentId, intentName: item.intentName });
      queueState.failed++;
    }

    // Remove processed item
    queueState.items.shift();

    // Notify per-intent listeners
    const listener = suggestionListeners.get(item.intentId);
    if (listener) listener(pendingSuggestions.get(item.intentId)!);
    notifyListeners();
    saveToStorage();

    // Cooldown between requests
    if (queueState.items.length > 0 && !queueState.cancelled) {
      await new Promise(r => setTimeout(r, COOLDOWN_MS));
    }
  }

  queueState.processing = false;
  queueState.currentIntentName = '';
  notifyListeners();

  if (queueState.items.length === 0) {
    clearStorage();
  } else {
    saveToStorage();
  }
}

// ─── Public API ──────────────────────────────────────────────────

export function initQueue(onNavigate?: (intentId: string) => void) {
  navigateCallback = onNavigate || null;
  loadFromStorage();
  // Auto-resume if there are pending items
  if (queueState.items.length > 0 && !queueState.processing) {
    console.log(`[Queue] Auto-resuming ${queueState.items.length} pending items`);
    processQueue();
  }
}

export function enqueueItems(items: Array<{ intentId: string; intentName: string; body: any }>) {
  resetQueueStats();
  const queueItems: QueueItem[] = items.map(i => ({
    ...i,
    retryCount: 0,
    maxRetries: MAX_RETRIES,
  }));
  queueState.items.push(...queueItems);
  queueState.total = queueItems.length;
  notifyListeners();
  saveToStorage();
  processQueue();
}

export function fireSingleSuggestion(
  intentId: string,
  intentName: string,
  body: any,
  onNavigate?: (intentId: string) => void,
) {
  if (pendingSuggestions.get(intentId)?.status === 'pending') return;
  pendingSuggestions.set(intentId, { status: 'pending', intentId, intentName });

  const attemptWithRetry = async (attempt: number) => {
    try {
      const { data, error } = await supabase.functions.invoke('suggest-ideal-pipeline', { body });
      if (error || data?.error) {
        const errMsg = error?.message || data?.error || 'Unknown error';
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, getBackoffDelay(attempt + 1)));
          return attemptWithRetry(attempt + 1);
        }
        pendingSuggestions.set(intentId, { status: 'error', error: errMsg, intentId, intentName });
        sonnerToast.error('Pipeline suggestion failed', { description: errMsg });
      } else {
        pendingSuggestions.set(intentId, { status: 'done', data, intentId, intentName });
        await autoSaveAISuggestion(intentId, data);
        sonnerToast.success(`AI pipeline saved for "${intentName}"`, {
          description: `${data.steps?.length || 0} steps suggested & auto-saved`,
          duration: 10000,
          action: onNavigate ? { label: 'View', onClick: () => onNavigate(intentId) } : undefined,
        });
      }
    } catch {
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, getBackoffDelay(attempt + 1)));
        return attemptWithRetry(attempt + 1);
      }
      pendingSuggestions.set(intentId, { status: 'error', error: 'Network error', intentId, intentName });
      sonnerToast.error('Pipeline suggestion failed', { description: 'Network error after retries' });
    }
    const listener = suggestionListeners.get(intentId);
    if (listener) listener(pendingSuggestions.get(intentId)!);
  };

  attemptWithRetry(0);
}

export function cancelQueue() {
  queueState.cancelled = true;
  queueState.items.length = 0;
  notifyListeners();
  clearStorage();
}

export function resetQueueStats() {
  queueState.current = 0;
  queueState.total = 0;
  queueState.completed = 0;
  queueState.failed = 0;
  queueState.cancelled = false;
  notifyListeners();
}

export function getQueueState(): QueueState {
  return { ...queueState };
}

export function getPendingSuggestion(intentId: string): PendingSuggestion | undefined {
  return pendingSuggestions.get(intentId);
}

export function subscribeToQueue(listener: () => void): () => void {
  queueStateListeners.add(listener);
  return () => { queueStateListeners.delete(listener); };
}

export function subscribeToSuggestion(intentId: string, listener: (result: PendingSuggestion) => void): () => void {
  suggestionListeners.set(intentId, listener);
  return () => { suggestionListeners.delete(intentId); };
}

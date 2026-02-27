import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart3, MessageSquare, Cpu, DollarSign, TrendingUp,
  Loader2, RefreshCw, Database, Zap, Clock, Hash, Building2, Users,
  Search, Filter, Calendar, X, ChevronRight, ChevronDown, User, Bot,
  AlertTriangle, CheckCircle2, XCircle, Wrench, Brain, Route
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { format, isToday, isYesterday, isThisWeek, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { EntityNameCompact } from '@/components/whatsapp/EntityName';
import { PipelineHealthBar } from '@/components/chat-history/PipelineHealthBar';
import { useQuery } from '@tanstack/react-query';

// ── Types ─────────────────────────────────────────────────────
interface ConversationRecord {
  id: string;
  conversation_id: string;
  entity_id: string;
  user_id: string;
  org_id: string | null;
  summary: string | null;
  auto_generated_name: string | null;
  chat_name: string | null;
  chat_display_id: string | null;
  message_count: number | null;
  messages: unknown[];
  mode: string | null;
  last_message_preview: string | null;
  is_deleted: boolean | null;
  created_at: string;
  updated_at: string;
}

interface ChatMessage {
  id?: string;
  role: string;
  content: string;
  timestamp?: string;
  metadata?: {
    route?: string;
    category?: string;
    routingStrategy?: string;
    intent?: { name: string; confidence?: number } | null;
    toolsUsed?: string[];
    toolsLoaded?: string[];
    toolResults?: { tool: string; input?: Record<string, unknown>; success: boolean; error?: string }[];
    enrichmentsApplied?: string[];
    executionTime?: string;
    llmModel?: string;
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
    errorDetail?: string;
    [key: string]: unknown;
  };
}

interface TokenStats {
  provider: string;
  model: string;
  total_calls: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
}

interface DailyActivity {
  date: string;
  chats: number;
  messages: number;
}

interface ToolUsageStats {
  tool_name: string;
  call_count: number;
  avg_response_ms: number;
}

// ── Helpers ───────────────────────────────────────────────────
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-5.2': { input: 3.00, output: 12.00 },
  'claude-opus-4-5': { input: 15.00, output: 75.00 },
  'claude-sonnet-4': { input: 3.00, output: 15.00 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[model] || { input: 2.50, output: 10.00 };
  return (inputTokens / 1_000_000) * costs.input + (outputTokens / 1_000_000) * costs.output;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  if (isThisWeek(date)) return 'This Week';
  return format(date, 'MMM yyyy');
}

function getRouteBadgeColor(route?: string): string {
  if (!route) return 'bg-muted text-muted-foreground';
  if (route === 'fast') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  if (route === 'llm' || route === 'llm_tools') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  if (route === 'cached') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  if (route === 'general_chat') return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
  return 'bg-muted text-muted-foreground';
}

function getStrategyLabel(strategy?: string): { label: string; color: string } | null {
  if (!strategy) return null;
  if (strategy.includes('fast_path')) return { label: '🟢 embedding_direct', color: 'text-green-600' };
  if (strategy.includes('general_chat')) return { label: '🟡 general_chat', color: 'text-purple-600' };
  if (strategy.includes('keyword') || strategy.includes('category')) return { label: '🟠 keyword_fallback', color: 'text-amber-600' };
  if (strategy.includes('emergency') || strategy.includes('fallback')) return { label: '🔴 fallback', color: 'text-red-600' };
  if (strategy.includes('registry')) return { label: '🔵 db_registry', color: 'text-blue-600' };
  return { label: strategy, color: 'text-muted-foreground' };
}

type SubTab = 'conversations' | 'analytics';

// ── Expandable Tool Detail ─────────────────────────────────────
function ToolResultDetail({ result }: { result: { tool: string; input?: Record<string, unknown>; success: boolean; error?: string } }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="text-[10px] border border-border rounded px-2 py-1">
      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 w-full text-left">
        {result.success ? <CheckCircle2 size={10} className="text-green-500 shrink-0" /> : <XCircle size={10} className="text-red-500 shrink-0" />}
        <span className="font-mono font-medium truncate">{result.tool}</span>
        <ChevronDown size={10} className={cn('ml-auto shrink-0 transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="mt-1 pt-1 border-t border-border space-y-1">
          {result.input && Object.keys(result.input).length > 0 && (
            <div>
              <span className="text-muted-foreground font-semibold">Args:</span>
              <pre className="text-[9px] bg-muted/50 rounded px-1.5 py-1 mt-0.5 overflow-x-auto max-h-24 whitespace-pre-wrap">
                {JSON.stringify(result.input, null, 2)}
              </pre>
            </div>
          )}
          {result.error && (
            <div className="text-red-600 dark:text-red-400">
              <span className="font-semibold">Error:</span> {result.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Message Panel (right side detail) ─────────────────────────
function MessagePanel({ conversation, onClose }: { conversation: ConversationRecord; onClose: () => void }) {
  const messages = useMemo(
    () => (Array.isArray(conversation.messages) ? (conversation.messages as ChatMessage[]) : []),
    [conversation.messages]
  );
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set());

  const toggleExpand = (idx: number) => {
    setExpandedMessages(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground truncate">
            {conversation.auto_generated_name || conversation.summary || 'Untitled conversation'}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
              <Building2 size={9} />
              <EntityNameCompact entityId={conversation.entity_id} orgId={conversation.org_id || ''} />
            </Badge>
            {conversation.org_id && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
                <Users size={9} />{conversation.org_id}
              </Badge>
            )}
            {conversation.chat_display_id && (
              <span className="text-[10px] text-muted-foreground font-mono">{conversation.chat_display_id}</span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="shrink-0 h-7 w-7" onClick={onClose}>
          <X size={14} />
        </Button>
      </div>

      <div className="flex items-center gap-4 px-4 py-2 border-b border-border text-[11px] text-muted-foreground shrink-0">
        <span className="flex items-center gap-1"><MessageSquare size={11} /> {conversation.message_count || 0} messages</span>
        <span className="flex items-center gap-1"><Clock size={11} /> {formatDistanceToNow(new Date(conversation.updated_at), { addSuffix: true })}</span>
        {conversation.mode && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{conversation.mode}</Badge>}
        <span>Created {format(new Date(conversation.created_at), 'MMM d, h:mm a')}</span>
      </div>

      <PipelineHealthBar messages={messages} />

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No messages in this conversation</p>
          ) : (
            messages.map((msg, idx) => {
              const isUserMsg = msg.role === 'user';
              const meta = msg.metadata;
              const isExpanded = expandedMessages.has(idx);
              const strategy = getStrategyLabel(meta?.routingStrategy);
              const hasError = meta?.errorDetail || msg.content?.includes('encountered an error');
              const toolResults = meta?.toolResults || [];
              const failedTools = toolResults.filter(r => !r.success);

              return (
                <div key={msg.id || idx} className={cn('flex gap-2', isUserMsg && 'flex-row-reverse')}>
                  <div className={cn('w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-1', isUserMsg ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                    {isUserMsg ? <User size={12} /> : <Bot size={12} />}
                  </div>
                  <div className={cn(
                    'rounded-lg px-3 py-2 max-w-[90%] text-sm',
                    isUserMsg ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                    hasError && !isUserMsg && 'border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30'
                  )}>
                    <div className="whitespace-pre-wrap break-words">{msg.content}</div>

                    {/* ── Metadata Row (always visible for bot messages) ── */}
                    {!isUserMsg && (
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {/* Timestamp */}
                        {msg.timestamp && (
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(msg.timestamp), 'h:mm a')}
                          </span>
                        )}
                        {/* Route badge with color */}
                        {meta?.route && (
                          <span className={cn('text-[9px] px-1.5 py-0 rounded-full font-medium', getRouteBadgeColor(meta.route))}>
                            <Route size={8} className="inline mr-0.5" />{meta.route}
                          </span>
                        )}
                        {/* Routing strategy */}
                        {strategy && (
                          <span className={cn('text-[9px] font-medium', strategy.color)}>
                            {strategy.label}
                          </span>
                        )}
                        {/* Intent with confidence */}
                        {meta?.intent?.name ? (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 gap-0.5">
                            <Brain size={8} />
                            {meta.intent.name}
                            {meta.intent.confidence != null && (
                              <span className="opacity-60">({(meta.intent.confidence * 100).toFixed(0)}%)</span>
                            )}
                          </Badge>
                        ) : (
                          meta?.route && meta.route !== 'general_chat' && meta.route !== 'cached' && (
                            <span className="text-[9px] text-red-500 font-medium">⚠ No intent</span>
                          )
                        )}
                        {/* Tool count (clickable to expand) */}
                        {(meta?.toolsUsed || meta?.toolsLoaded) && (meta?.toolsUsed?.length || 0) > 0 && (
                          <button onClick={() => toggleExpand(idx)} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                            <Wrench size={9} />
                            {meta?.toolsUsed?.length || 0}/{meta?.toolsLoaded?.length || '?'} tools
                            {failedTools.length > 0 && <span className="text-red-500 ml-0.5">({failedTools.length} failed)</span>}
                          </button>
                        )}
                        {/* Token usage */}
                        {meta?.usage?.total_tokens && meta.usage.total_tokens > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            📊 {formatNumber(meta.usage.total_tokens)} tok
                            {meta.usage.input_tokens && meta.usage.output_tokens ? (
                              <span className="opacity-60 ml-0.5">({formatNumber(meta.usage.input_tokens)}↑ {formatNumber(meta.usage.output_tokens)}↓)</span>
                            ) : null}
                          </span>
                        )}
                        {/* Execution time */}
                        {meta?.executionTime && (
                          <span className="text-[10px] text-muted-foreground">⏱ {meta.executionTime}</span>
                        )}
                        {/* LLM Model */}
                        {meta?.llmModel && (
                          <span className="text-[9px] text-muted-foreground font-mono">{meta.llmModel}</span>
                        )}
                        {/* Enrichments */}
                        {meta?.enrichmentsApplied && meta.enrichmentsApplied.length > 0 && (
                          <span className="text-[9px] text-muted-foreground">✨ {meta.enrichmentsApplied.join(', ')}</span>
                        )}
                      </div>
                    )}

                    {/* ── Error Detail (inline) ── */}
                    {!isUserMsg && hasError && (
                      <div className="mt-2 p-2 rounded bg-red-100 dark:bg-red-900/30 text-[10px] text-red-700 dark:text-red-400 flex items-start gap-1">
                        <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                        <span>{meta?.errorDetail || 'Unknown error — check edge function logs'}</span>
                      </div>
                    )}

                    {/* ── Expanded Tool Details ── */}
                    {!isUserMsg && isExpanded && (
                      <div className="mt-2 space-y-1.5 border-t border-border pt-2">
                        <div className="text-[10px] font-semibold text-muted-foreground mb-1">
                          Tools loaded: {meta?.toolsLoaded?.length || 0} → Used: {meta?.toolsUsed?.length || 0}
                        </div>
                        {/* Tool names list */}
                        {meta?.toolsLoaded && meta.toolsLoaded.length > 0 && !toolResults.length && (
                          <div className="flex flex-wrap gap-1">
                            {meta.toolsLoaded.map(t => (
                              <span key={t} className={cn(
                                'text-[9px] px-1.5 py-0.5 rounded font-mono',
                                meta.toolsUsed?.includes(t)
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                  : 'bg-muted text-muted-foreground'
                              )}>
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                        {/* Detailed tool results with args */}
                        {toolResults.length > 0 && (
                          <div className="space-y-1">
                            {toolResults.map((r, i) => (
                              <ToolResultDetail key={`${r.tool}-${i}`} result={r} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* User message timestamp */}
                    {isUserMsg && msg.timestamp && (
                      <span className="text-[10px] text-primary-foreground/60 mt-1 block">
                        {format(new Date(msg.timestamp), 'h:mm a')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      <div className="flex items-center gap-3 px-4 py-2 border-t border-border text-[10px] text-muted-foreground shrink-0">
        <span className="flex items-center gap-1"><Building2 size={10} /><EntityNameCompact entityId={conversation.entity_id} orgId={conversation.org_id || ''} /></span>
        {conversation.org_id && <span>Org: {conversation.org_id}</span>}
        <span>User: {conversation.user_id.slice(0, 8)}…</span>
      </div>
    </div>
  );
}

// ── Main Unified Component ────────────────────────────────────
export default function UnifiedAnalyticsView() {
  const [subTab, setSubTab] = useState<SubTab>('conversations');
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  // ── Shared data ──
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [convLoading, setConvLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [orgFilter, setOrgFilter] = useState('all');
  const [selectedConversation, setSelectedConversation] = useState<ConversationRecord | null>(null);
  const [debugFilter, setDebugFilter] = useState<string>('all');

  // ── Analytics data ──
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [tokenStats, setTokenStats] = useState<TokenStats[]>([]);
  const [dailyActivity, setDailyActivity] = useState<DailyActivity[]>([]);
  const [toolUsage, setToolUsage] = useState<ToolUsageStats[]>([]);
  const [totals, setTotals] = useState({ totalChats: 0, totalMessages: 0, totalTokens: 0, totalCost: 0, avgTokensPerChat: 0, uniqueEntities: 0 });

  // ── Entity name resolution ──
  const { data: entitiesList } = useQuery({
    queryKey: ['entities-list'],
    queryFn: async () => {
      const { data } = await supabase.from('entities').select('entity_id, org_id, name');
      return data || [];
    },
  });

  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    entitiesList?.forEach(e => map.set(e.entity_id, e.name));
    return map;
  }, [entitiesList]);

  const orgNameMap = useMemo(() => {
    const map = new Map<string, string>();
    entitiesList?.forEach(e => { if (e.org_id && !map.has(e.org_id)) map.set(e.org_id, e.org_id); });
    return map;
  }, [entitiesList]);

  // ── Fetch conversations ──
  const fetchConversations = useCallback(async () => {
    setConvLoading(true);
    try {
      const { data, error } = await supabase
        .from('unified_conversations')
        .select('*')
        .eq('is_deleted', false)
        .order('updated_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      setConversations((data as unknown as ConversationRecord[]) || []);
    } catch (e) {
      console.error('Failed to fetch conversations:', e);
    } finally {
      setConvLoading(false);
    }
  }, []);

  // ── Fetch analytics ──
  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const dateFilter = timeRange !== 'all'
        ? new Date(Date.now() - (timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90) * 86400000).toISOString()
        : null;

      // Token / LLM usage
      let llmQuery = supabase.from('llm_usage_logs').select('provider, model, input_tokens, output_tokens, total_tokens');
      if (dateFilter) llmQuery = llmQuery.gte('created_at', dateFilter);
      const { data: llmData } = await llmQuery;

      const tokenMap: Record<string, TokenStats> = {};
      (llmData || []).forEach(l => {
        const key = `${l.provider}|${l.model}`;
        if (!tokenMap[key]) tokenMap[key] = { provider: l.provider, model: l.model, total_calls: 0, total_tokens: 0, input_tokens: 0, output_tokens: 0, estimated_cost: 0 };
        tokenMap[key].total_calls++;
        tokenMap[key].total_tokens += l.total_tokens || 0;
        tokenMap[key].input_tokens += l.input_tokens || 0;
        tokenMap[key].output_tokens += l.output_tokens || 0;
        tokenMap[key].estimated_cost += estimateCost(l.model, l.input_tokens || 0, l.output_tokens || 0);
      });
      const tStats = Object.values(tokenMap).sort((a, b) => b.total_calls - a.total_calls);
      setTokenStats(tStats);

      // Daily activity from conversations
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : 30;
      const dailyMap: Record<string, DailyActivity> = {};
      for (let i = 0; i < days; i++) {
        const d = new Date(Date.now() - i * 86400000);
        const key = d.toISOString().split('T')[0];
        dailyMap[key] = { date: key, chats: 0, messages: 0 };
      }
      conversations.forEach(c => {
        const day = c.updated_at?.split('T')[0];
        if (day && dailyMap[day]) {
          dailyMap[day].chats++;
          dailyMap[day].messages += c.message_count || 0;
        }
      });
      setDailyActivity(Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)));

      // Tool usage from feedback_log
      let toolQuery = supabase.from('feedback_log').select('tools_used, response_time_ms');
      if (dateFilter) toolQuery = toolQuery.gte('created_at', dateFilter);
      const { data: toolData } = await toolQuery;

      const toolMap: Record<string, { count: number; totalMs: number }> = {};
      (toolData || []).forEach(t => {
        (t.tools_used || []).forEach((tool: string) => {
          if (!toolMap[tool]) toolMap[tool] = { count: 0, totalMs: 0 };
          toolMap[tool].count++;
          toolMap[tool].totalMs += t.response_time_ms || 0;
        });
      });
      setToolUsage(
        Object.entries(toolMap)
          .map(([name, stats]) => ({ tool_name: name, call_count: stats.count, avg_response_ms: Math.round(stats.totalMs / stats.count) }))
          .sort((a, b) => b.call_count - a.call_count)
      );

      // Totals — derive from conversations (single source)
      const entitySet = new Set(conversations.map(c => c.entity_id));
      const totalChats = conversations.length;
      const totalMessages = conversations.reduce((s, c) => s + (c.message_count || 0), 0);
      const totalTokens = tStats.reduce((s, t) => s + t.total_tokens, 0);
      const totalCost = tStats.reduce((s, t) => s + t.estimated_cost, 0);
      setTotals({
        totalChats, totalMessages, totalTokens, totalCost,
        avgTokensPerChat: totalChats > 0 ? Math.round(totalTokens / totalChats) : 0,
        uniqueEntities: entitySet.size,
      });
    } catch (err) {
      console.error('Analytics fetch error:', err);
      toast({ title: 'Failed to load analytics', variant: 'destructive' });
    } finally {
      setAnalyticsLoading(false);
    }
  }, [timeRange, conversations]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);
  useEffect(() => { if (subTab === 'analytics' && conversations.length > 0) fetchAnalytics(); }, [subTab, fetchAnalytics, conversations.length]);

  // ── Conversation filters ──
  const uniqueEntities = useMemo(() => Array.from(new Set(conversations.map(c => c.entity_id).filter(Boolean))) as string[], [conversations]);
  const uniqueOrgs = useMemo(() => Array.from(new Set(conversations.map(c => c.org_id).filter(Boolean))) as string[], [conversations]);
  const uniqueModes = useMemo(() => Array.from(new Set(conversations.map(c => c.mode).filter(Boolean))) as string[], [conversations]);

  const filtered = conversations.filter(conv => {
    if (conv.is_deleted) return false;
    if (modeFilter !== 'all' && conv.mode !== modeFilter) return false;
    if (entityFilter !== 'all' && conv.entity_id !== entityFilter) return false;
    if (orgFilter !== 'all' && conv.org_id !== orgFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const entityName = entityNameMap.get(conv.entity_id)?.toLowerCase() || '';
      if (
        !conv.summary?.toLowerCase().includes(q) &&
        !conv.auto_generated_name?.toLowerCase().includes(q) &&
        !conv.last_message_preview?.toLowerCase().includes(q) &&
        !conv.chat_display_id?.toLowerCase().includes(q) &&
        !conv.entity_id?.toLowerCase().includes(q) &&
        !conv.org_id?.toLowerCase().includes(q) &&
        !entityName.includes(q)
      ) return false;
    }
    // Debug filters
    if (debugFilter !== 'all') {
      const msgs = Array.isArray(conv.messages) ? (conv.messages as ChatMessage[]) : [];
      const botMsgs = msgs.filter(m => m.role === 'agent' || m.role === 'assistant');
      if (debugFilter === 'failed_tools') {
        const hasFailed = botMsgs.some(m => m.metadata?.toolResults?.some(r => !r.success));
        if (!hasFailed) return false;
      } else if (debugFilter === 'no_intent') {
        const allMissing = botMsgs.length > 0 && botMsgs.every(m => !m.metadata?.intent?.name);
        if (!allMissing) return false;
      } else if (debugFilter === 'slow') {
        const hasSlow = botMsgs.some(m => {
          const t = parseFloat(m.metadata?.executionTime || '0');
          return t > 10;
        });
        if (!hasSlow) return false;
      } else if (debugFilter === 'keyword_fallback') {
        const hasFallback = botMsgs.some(m => (m.metadata?.routingStrategy || '').includes('keyword') || (m.metadata?.routingStrategy || '').includes('fallback'));
        if (!hasFallback) return false;
      }
    }
    return true;
  });

  const grouped = filtered.reduce<Record<string, ConversationRecord[]>>((acc, conv) => {
    const group = getDateGroup(conv.updated_at);
    if (!acc[group]) acc[group] = [];
    acc[group].push(conv);
    return acc;
  }, {});

  const groupOrder = ['Today', 'Yesterday', 'This Week'];
  const sortedGroups = Object.entries(grouped).sort(([a], [b]) => {
    const ai = groupOrder.indexOf(a);
    const bi = groupOrder.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return b.localeCompare(a);
  });

  const isSelected = (conv: ConversationRecord) => selectedConversation?.conversation_id === conv.conversation_id;

  // ── KPI row (shared across both sub-tabs) ──
  const kpiRow = (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-3 px-4 py-3 border-b border-border shrink-0 bg-muted/30">
      <KPICard icon={<MessageSquare size={14} />} label="Chats" value={conversations.length.toLocaleString()} />
      <KPICard icon={<Hash size={14} />} label="Messages" value={conversations.reduce((s, c) => s + (c.message_count || 0), 0).toLocaleString()} />
      <KPICard icon={<Database size={14} />} label="Entities" value={new Set(conversations.map(c => c.entity_id)).size.toString()} />
      <KPICard icon={<Calendar size={14} />} label="Today" value={conversations.filter(c => isToday(new Date(c.updated_at))).length.toString()} />
      <KPICard icon={<Cpu size={14} />} label="Tokens" value={formatNumber(totals.totalTokens)} />
      <KPICard icon={<DollarSign size={14} />} label="Est. Cost" value={`$${totals.totalCost.toFixed(2)}`} />
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header with sub-tabs */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <BarChart3 size={20} className="text-primary" />
            Analytics & Chat History
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Unified view of conversations, usage, and costs</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-muted rounded-lg p-0.5">
            <button
              onClick={() => setSubTab('conversations')}
              className={cn('px-3 py-1.5 text-xs font-medium rounded transition-colors', subTab === 'conversations' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              <MessageSquare size={12} className="inline mr-1" />Conversations
            </button>
            <button
              onClick={() => setSubTab('analytics')}
              className={cn('px-3 py-1.5 text-xs font-medium rounded transition-colors', subTab === 'analytics' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              <BarChart3 size={12} className="inline mr-1" />Analytics & Costs
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={() => { fetchConversations(); if (subTab === 'analytics') fetchAnalytics(); }} disabled={convLoading || analyticsLoading}>
            <RefreshCw size={14} className={cn('mr-1', (convLoading || analyticsLoading) && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Row */}
      {kpiRow}

      {/* Sub-tab content */}
      {subTab === 'conversations' ? (
        <div className="flex flex-1 min-h-0">
          {/* Left: Conversation List */}
          <div className={cn('flex flex-col border-r border-border transition-all duration-200', selectedConversation ? 'w-[420px] min-w-[360px]' : 'w-full')}>
            {/* Filters */}
            <div className="flex items-center gap-2 px-4 py-2 flex-wrap shrink-0">
              <div className="relative flex-1 min-w-[160px]">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search…" className="pl-8 h-8 text-xs" />
              </div>
              <Select value={entityFilter} onValueChange={setEntityFilter}>
                <SelectTrigger className="w-[140px] h-8 text-xs"><Building2 size={12} className="mr-1 shrink-0" /><SelectValue placeholder="Entity" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Entities</SelectItem>
                  {uniqueEntities.map(eid => <SelectItem key={eid} value={eid}>{entityNameMap.get(eid) || eid}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={orgFilter} onValueChange={setOrgFilter}>
                <SelectTrigger className="w-[130px] h-8 text-xs"><Users size={12} className="mr-1 shrink-0" /><SelectValue placeholder="Org" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Orgs</SelectItem>
                  {uniqueOrgs.map(oid => <SelectItem key={oid} value={oid}>{orgNameMap.get(oid) || oid}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={modeFilter} onValueChange={setModeFilter}>
                <SelectTrigger className="w-[120px] h-8 text-xs"><Filter size={12} className="mr-1 shrink-0" /><SelectValue placeholder="Mode" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Modes</SelectItem>
                  {uniqueModes.map(mode => <SelectItem key={mode} value={mode}>{mode}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={debugFilter} onValueChange={setDebugFilter}>
                <SelectTrigger className="w-[150px] h-8 text-xs"><AlertTriangle size={12} className="mr-1 shrink-0" /><SelectValue placeholder="Debug" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Conversations</SelectItem>
                  <SelectItem value="failed_tools">🔴 Failed Tools</SelectItem>
                  <SelectItem value="no_intent">🟡 No Intent Match</SelectItem>
                  <SelectItem value="slow">🟠 Slow (&gt;10s)</SelectItem>
                  <SelectItem value="keyword_fallback">🟤 Keyword Fallback</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="px-4 py-1.5 text-[11px] text-muted-foreground shrink-0 border-b border-border">
              {filtered.length} of {conversations.length} conversations
            </div>

            {convLoading ? (
              <div className="flex items-center justify-center py-16 flex-1">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading…</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 flex-1 text-muted-foreground">
                <MessageSquare size={32} className="mb-2 opacity-30" />
                <p className="text-sm font-medium">No conversations found</p>
              </div>
            ) : (
              <ScrollArea className="flex-1">
                <div className="px-2 py-2 space-y-4">
                  {sortedGroups.map(([group, convs]) => (
                    <div key={group}>
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-2">{group} ({convs.length})</div>
                      <div className="space-y-0.5">
                        {convs.map(conv => (
                          <button key={conv.id} onClick={() => setSelectedConversation(conv)}
                            className={cn('w-full text-left px-3 py-2.5 rounded-md flex items-center gap-2 transition-colors hover:bg-muted/50', isSelected(conv) && 'bg-primary/10 border border-primary/20')}>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-foreground truncate">{conv.auto_generated_name || conv.summary || 'Untitled conversation'}</div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <Badge variant="secondary" className="text-[9px] px-1 py-0 gap-0.5"><Building2 size={8} /><EntityNameCompact entityId={conv.entity_id} orgId={conv.org_id || ''} /></Badge>
                                {conv.org_id && <Badge variant="outline" className="text-[9px] px-1 py-0 gap-0.5"><Users size={8} />{conv.org_id}</Badge>}
                              </div>
                              {conv.last_message_preview && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{conv.last_message_preview}</p>}
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              {conv.mode && <Badge variant="outline" className="text-[9px] px-1 py-0">{conv.mode}</Badge>}
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><MessageSquare size={9} /> {conv.message_count || 0}</span>
                              <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(conv.updated_at), { addSuffix: true })}</span>
                            </div>
                            <ChevronRight size={14} className="text-muted-foreground/50 shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Right: Message Detail Panel */}
          {selectedConversation && (
            <div className="flex-1 min-w-0">
              <MessagePanel conversation={selectedConversation} onClose={() => setSelectedConversation(null)} />
            </div>
          )}
        </div>
      ) : (
        /* ── Analytics & Costs Sub-Tab ── */
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            {/* Time Range */}
            <div className="flex justify-end">
              <div className="flex bg-muted rounded-lg p-0.5">
                {(['7d', '30d', '90d', 'all'] as const).map(range => (
                  <button key={range} onClick={() => setTimeRange(range)}
                    className={cn('px-3 py-1.5 text-xs font-medium rounded transition-colors', timeRange === range ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                    {range === 'all' ? 'All Time' : range.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {analyticsLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading analytics...</span>
              </div>
            ) : (
              <>
                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Daily Activity */}
                  <div className="bg-card rounded-xl border p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                      <TrendingUp size={16} className="text-primary" /> Daily Chat Activity
                    </h3>
                    <div className="flex items-end gap-0.5 h-32">
                      {dailyActivity.slice(-30).map(d => {
                        const maxBar = Math.max(...dailyActivity.map(x => x.chats), 1);
                        return (
                          <div key={d.date} className="flex-1 flex flex-col items-center group relative">
                            <div className="w-full bg-primary/80 rounded-t-sm hover:bg-primary transition-colors cursor-pointer min-h-[2px]"
                              style={{ height: `${Math.max(2, (d.chats / maxBar) * 100)}%` }} />
                            <div className="absolute bottom-full mb-1 hidden group-hover:block bg-popover text-popover-foreground text-[10px] px-2 py-1 rounded whitespace-nowrap z-10 shadow-md border">
                              {d.date}: {d.chats} chats, {d.messages} msgs
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                      <span>{dailyActivity[0]?.date}</span>
                      <span>{dailyActivity[dailyActivity.length - 1]?.date}</span>
                    </div>
                  </div>

                  {/* Token Usage by Model */}
                  <div className="bg-card rounded-xl border p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                      <Cpu size={16} className="text-primary" /> Token Usage by Model
                    </h3>
                    <div className="space-y-3 max-h-40 overflow-y-auto">
                      {tokenStats.map(ts => {
                        const maxTokens = Math.max(...tokenStats.map(t => t.total_tokens), 1);
                        return (
                          <div key={`${ts.provider}|${ts.model}`}>
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="font-medium text-foreground">{ts.model}</span>
                              <span className="text-muted-foreground">{formatNumber(ts.total_tokens)} tokens · ${ts.estimated_cost.toFixed(3)}</span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-2">
                              <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${(ts.total_tokens / maxTokens) * 100}%` }} />
                            </div>
                            <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                              <span>{ts.total_calls} calls</span>
                              <span>In: {formatNumber(ts.input_tokens)}</span>
                              <span>Out: {formatNumber(ts.output_tokens)}</span>
                              <span className="font-medium">{ts.provider}</span>
                            </div>
                          </div>
                        );
                      })}
                      {tokenStats.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No token usage data yet</p>}
                    </div>
                  </div>
                </div>

                {/* Tool Usage */}
                <div className="bg-card rounded-xl border">
                  <div className="px-5 py-4 border-b">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Zap size={16} className="text-primary" /> MCP Tool Usage
                    </h3>
                  </div>
                  <div className="p-5">
                    {toolUsage.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {toolUsage.slice(0, 15).map(t => (
                          <div key={t.tool_name} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-foreground truncate">{t.tool_name}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5"><Clock size={10} className="inline mr-0.5" />{t.avg_response_ms}ms avg</p>
                            </div>
                            <Badge variant="secondary" className="ml-2 text-xs">{t.call_count}×</Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">No tool usage data yet</p>
                    )}
                  </div>
                </div>

                {/* Cost Breakdown Table */}
                <div className="bg-card rounded-xl border">
                  <div className="px-5 py-4 border-b">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <DollarSign size={16} className="text-primary" /> Cost Breakdown by Platform & Model
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 text-left text-xs text-muted-foreground">
                          <th className="px-5 py-3 font-medium">Provider</th>
                          <th className="px-5 py-3 font-medium">Model</th>
                          <th className="px-5 py-3 font-medium text-center">API Calls</th>
                          <th className="px-5 py-3 font-medium text-right">Input Tokens</th>
                          <th className="px-5 py-3 font-medium text-right">Output Tokens</th>
                          <th className="px-5 py-3 font-medium text-right">Total Tokens</th>
                          <th className="px-5 py-3 font-medium text-right">Est. Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {tokenStats.map(ts => (
                          <tr key={`${ts.provider}|${ts.model}`} className="hover:bg-muted/30">
                            <td className="px-5 py-3"><Badge variant="secondary" className="text-xs">{ts.provider}</Badge></td>
                            <td className="px-5 py-3 font-mono text-xs text-foreground">{ts.model}</td>
                            <td className="px-5 py-3 text-center">{ts.total_calls}</td>
                            <td className="px-5 py-3 text-right text-muted-foreground">{formatNumber(ts.input_tokens)}</td>
                            <td className="px-5 py-3 text-right text-muted-foreground">{formatNumber(ts.output_tokens)}</td>
                            <td className="px-5 py-3 text-right font-medium text-foreground">{formatNumber(ts.total_tokens)}</td>
                            <td className="px-5 py-3 text-right"><span className="text-primary font-semibold">${ts.estimated_cost.toFixed(4)}</span></td>
                          </tr>
                        ))}
                        {tokenStats.length > 0 && (
                          <tr className="bg-muted/50 font-medium">
                            <td className="px-5 py-3" colSpan={2}>Total</td>
                            <td className="px-5 py-3 text-center">{tokenStats.reduce((s, t) => s + t.total_calls, 0)}</td>
                            <td className="px-5 py-3 text-right">{formatNumber(tokenStats.reduce((s, t) => s + t.input_tokens, 0))}</td>
                            <td className="px-5 py-3 text-right">{formatNumber(tokenStats.reduce((s, t) => s + t.output_tokens, 0))}</td>
                            <td className="px-5 py-3 text-right">{formatNumber(totals.totalTokens)}</td>
                            <td className="px-5 py-3 text-right text-primary font-bold">${totals.totalCost.toFixed(4)}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────
function KPICard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="text-primary">{icon}</div>
      <div>
        <p className="text-sm font-bold text-foreground leading-tight">{value}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

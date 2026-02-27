import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, MessageSquare, Cpu, DollarSign, Activity, TrendingUp,
  Loader2, RefreshCw, Filter, Database, Zap, Clock, Hash, ChevronDown,
  ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

// ── Types ─────────────────────────────────────────────────────
interface EntityChatStats {
  entity_id: string;
  entity_name: string;
  total_chats: number;
  total_messages: number;
  last_activity: string;
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

// ── Cost estimation per model ─────────────────────────────────
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

// ── Main Component ────────────────────────────────────────────
export default function AnalyticsDashboard() {
  const [loading, setLoading] = useState(true);
  const [entityStats, setEntityStats] = useState<EntityChatStats[]>([]);
  const [tokenStats, setTokenStats] = useState<TokenStats[]>([]);
  const [dailyActivity, setDailyActivity] = useState<DailyActivity[]>([]);
  const [toolUsage, setToolUsage] = useState<ToolUsageStats[]>([]);
  const [totals, setTotals] = useState({
    totalChats: 0,
    totalMessages: 0,
    totalTokens: 0,
    totalCost: 0,
    avgTokensPerChat: 0,
    uniqueEntities: 0
  });
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const dateFilter = timeRange !== 'all'
        ? new Date(Date.now() - (timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90) * 86400000).toISOString()
        : null;

      // 1. Entity-level chat stats from unified_conversations
      let convQuery = supabase
        .from('unified_conversations')
        .select('entity_id, conversation_id, message_count, updated_at')
        .eq('is_deleted', false);
      if (dateFilter) convQuery = convQuery.gte('created_at', dateFilter);
      const { data: convData } = await convQuery;

      // Get entity names
      const { data: entitiesData } = await supabase.from('entities').select('entity_id, name');
      const entityNameMap: Record<string, string> = {};
      (entitiesData || []).forEach(e => { entityNameMap[e.entity_id] = e.name; });

      // Aggregate per entity
      const entityMap: Record<string, EntityChatStats> = {};
      (convData || []).forEach(c => {
        if (!entityMap[c.entity_id]) {
          entityMap[c.entity_id] = {
            entity_id: c.entity_id,
            entity_name: entityNameMap[c.entity_id] || c.entity_id.substring(0, 8) + '...',
            total_chats: 0,
            total_messages: 0,
            last_activity: c.updated_at
          };
        }
        entityMap[c.entity_id].total_chats++;
        entityMap[c.entity_id].total_messages += c.message_count || 0;
        if (c.updated_at > entityMap[c.entity_id].last_activity) {
          entityMap[c.entity_id].last_activity = c.updated_at;
        }
      });
      const eStats = Object.values(entityMap).sort((a, b) => b.total_chats - a.total_chats);
      setEntityStats(eStats);

      // 2. Token / LLM usage stats
      let llmQuery = supabase
        .from('llm_usage_logs')
        .select('provider, model, input_tokens, output_tokens, total_tokens');
      if (dateFilter) llmQuery = llmQuery.gte('created_at', dateFilter);
      const { data: llmData } = await llmQuery;

      const tokenMap: Record<string, TokenStats> = {};
      (llmData || []).forEach(l => {
        const key = `${l.provider}|${l.model}`;
        if (!tokenMap[key]) {
          tokenMap[key] = {
            provider: l.provider, model: l.model,
            total_calls: 0, total_tokens: 0, input_tokens: 0, output_tokens: 0, estimated_cost: 0
          };
        }
        tokenMap[key].total_calls++;
        tokenMap[key].total_tokens += l.total_tokens || 0;
        tokenMap[key].input_tokens += l.input_tokens || 0;
        tokenMap[key].output_tokens += l.output_tokens || 0;
        tokenMap[key].estimated_cost += estimateCost(l.model, l.input_tokens || 0, l.output_tokens || 0);
      });
      const tStats = Object.values(tokenMap).sort((a, b) => b.total_calls - a.total_calls);
      setTokenStats(tStats);

      // 3. Daily activity (last N days)
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : 30;
      const dailyMap: Record<string, DailyActivity> = {};
      for (let i = 0; i < days; i++) {
        const d = new Date(Date.now() - i * 86400000);
        const key = d.toISOString().split('T')[0];
        dailyMap[key] = { date: key, chats: 0, messages: 0 };
      }
      (convData || []).forEach(c => {
        const day = c.updated_at?.split('T')[0];
        if (day && dailyMap[day]) {
          dailyMap[day].chats++;
          dailyMap[day].messages += c.message_count || 0;
        }
      });
      setDailyActivity(Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)));

      // 4. Tool usage from feedback_log
      let toolQuery = supabase
        .from('feedback_log')
        .select('tools_used, response_time_ms');
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
          .map(([name, stats]) => ({
            tool_name: name,
            call_count: stats.count,
            avg_response_ms: Math.round(stats.totalMs / stats.count)
          }))
          .sort((a, b) => b.call_count - a.call_count)
      );

      // 5. Totals
      const totalChats = eStats.reduce((s, e) => s + e.total_chats, 0);
      const totalMessages = eStats.reduce((s, e) => s + e.total_messages, 0);
      const totalTokens = tStats.reduce((s, t) => s + t.total_tokens, 0);
      const totalCost = tStats.reduce((s, t) => s + t.estimated_cost, 0);
      setTotals({
        totalChats,
        totalMessages,
        totalTokens,
        totalCost,
        avgTokensPerChat: totalChats > 0 ? Math.round(totalTokens / totalChats) : 0,
        uniqueEntities: eStats.length
      });

    } catch (err) {
      console.error('Analytics fetch error:', err);
      toast({ title: 'Failed to load analytics', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading analytics...</span>
      </div>
    );
  }

  const maxBarChats = Math.max(...dailyActivity.map(d => d.chats), 1);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 size={22} /> Analytics & Usage Logs
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Chat logs, token usage, and cost tracking across all entities
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-muted rounded-lg p-0.5">
            {(['7d', '30d', '90d', 'all'] as const).map(range => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  timeRange === range
                    ? 'bg-background shadow text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {range === 'all' ? 'All Time' : range.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            onClick={fetchAnalytics}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard icon={<MessageSquare size={18} />} label="Total Chats" value={totals.totalChats.toLocaleString()} color="blue" />
        <KPICard icon={<Hash size={18} />} label="Total Messages" value={totals.totalMessages.toLocaleString()} color="indigo" />
        <KPICard icon={<Database size={18} />} label="Entities" value={totals.uniqueEntities.toString()} color="emerald" />
        <KPICard icon={<Cpu size={18} />} label="Total Tokens" value={formatNumber(totals.totalTokens)} color="purple" />
        <KPICard icon={<DollarSign size={18} />} label="Est. Cost" value={`$${totals.totalCost.toFixed(2)}`} color="amber" />
        <KPICard icon={<Activity size={18} />} label="Avg Tokens/Chat" value={totals.avgTokensPerChat.toLocaleString()} color="cyan" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Activity Mini Bar Chart */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-blue-500" /> Daily Chat Activity
          </h3>
          <div className="flex items-end gap-0.5 h-32">
            {dailyActivity.slice(-30).map((d, i) => (
              <div key={d.date} className="flex-1 flex flex-col items-center group relative">
                <div
                  className="w-full bg-blue-500/80 rounded-t-sm hover:bg-blue-600 transition-colors cursor-pointer min-h-[2px]"
                  style={{ height: `${Math.max(2, (d.chats / maxBarChats) * 100)}%` }}
                />
                <div className="absolute bottom-full mb-1 hidden group-hover:block bg-slate-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                  {d.date}: {d.chats} chats, {d.messages} msgs
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
            <span>{dailyActivity[0]?.date}</span>
            <span>{dailyActivity[dailyActivity.length - 1]?.date}</span>
          </div>
        </div>

        {/* Token Usage by Provider/Model */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Cpu size={16} className="text-purple-500" /> Token Usage by Model
          </h3>
          <div className="space-y-3 max-h-40 overflow-y-auto">
            {tokenStats.map(ts => {
              const maxTokens = Math.max(...tokenStats.map(t => t.total_tokens), 1);
              return (
                <div key={`${ts.provider}|${ts.model}`}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-foreground">{ts.model}</span>
                    <span className="text-muted-foreground">
                      {formatNumber(ts.total_tokens)} tokens · ${ts.estimated_cost.toFixed(3)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-purple-500 to-indigo-500 h-2 rounded-full transition-all"
                      style={{ width: `${(ts.total_tokens / maxTokens) * 100}%` }}
                    />
                  </div>
                  <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                    <span>{ts.total_calls} calls</span>
                    <span>In: {formatNumber(ts.input_tokens)}</span>
                    <span>Out: {formatNumber(ts.output_tokens)}</span>
                    <span className="text-amber-600 font-medium">{ts.provider}</span>
                  </div>
                </div>
              );
            })}
            {tokenStats.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No token usage data yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Entity Chat Stats Table */}
      <div className="bg-white rounded-xl border">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Database size={16} className="text-emerald-500" /> Chat Logs by Entity
          </h3>
          <span className="text-xs text-muted-foreground">{entityStats.length} entities</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-muted-foreground">
                <th className="px-5 py-3 font-medium">Entity</th>
                <th className="px-5 py-3 font-medium text-center">Total Chats</th>
                <th className="px-5 py-3 font-medium text-center">Messages</th>
                <th className="px-5 py-3 font-medium text-center">Avg Msgs/Chat</th>
                <th className="px-5 py-3 font-medium text-right">Last Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {entityStats.map(e => (
                <tr key={e.entity_id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <div>
                      <span className="font-medium text-foreground">{e.entity_name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                      {e.total_chats}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center text-foreground">{e.total_messages}</td>
                  <td className="px-5 py-3 text-center text-muted-foreground">
                    {e.total_chats > 0 ? (e.total_messages / e.total_chats).toFixed(1) : '0'}
                  </td>
                  <td className="px-5 py-3 text-right text-xs text-muted-foreground">
                    {new Date(e.last_activity).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {entityStats.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                    No chat data available for the selected period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tool Usage */}
      <div className="bg-white rounded-xl border">
        <div className="px-5 py-4 border-b">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Zap size={16} className="text-amber-500" /> MCP Tool Usage
          </h3>
        </div>
        <div className="p-5">
          {toolUsage.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {toolUsage.slice(0, 15).map(t => (
                <div key={t.tool_name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">{t.tool_name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      <Clock size={10} className="inline mr-0.5" />
                      {t.avg_response_ms}ms avg
                    </p>
                  </div>
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium ml-2">
                    {t.call_count}×
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No tool usage data yet</p>
          )}
        </div>
      </div>

      {/* Cost Breakdown Table */}
      <div className="bg-white rounded-xl border">
        <div className="px-5 py-4 border-b">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <DollarSign size={16} className="text-green-500" /> Cost Breakdown by Platform & Model
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-muted-foreground">
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
                <tr key={`${ts.provider}|${ts.model}`} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                      {ts.provider}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-foreground">{ts.model}</td>
                  <td className="px-5 py-3 text-center">{ts.total_calls}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{formatNumber(ts.input_tokens)}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{formatNumber(ts.output_tokens)}</td>
                  <td className="px-5 py-3 text-right font-medium text-foreground">{formatNumber(ts.total_tokens)}</td>
                  <td className="px-5 py-3 text-right">
                    <span className="text-green-600 font-semibold">${ts.estimated_cost.toFixed(4)}</span>
                  </td>
                </tr>
              ))}
              {tokenStats.length > 0 && (
                <tr className="bg-gray-50 font-medium">
                  <td className="px-5 py-3" colSpan={2}>Total</td>
                  <td className="px-5 py-3 text-center">{tokenStats.reduce((s, t) => s + t.total_calls, 0)}</td>
                  <td className="px-5 py-3 text-right">{formatNumber(tokenStats.reduce((s, t) => s + t.input_tokens, 0))}</td>
                  <td className="px-5 py-3 text-right">{formatNumber(tokenStats.reduce((s, t) => s + t.output_tokens, 0))}</td>
                  <td className="px-5 py-3 text-right">{formatNumber(totals.totalTokens)}</td>
                  <td className="px-5 py-3 text-right text-green-600 font-bold">${totals.totalCost.toFixed(4)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────
function KPICard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    purple: 'bg-purple-50 text-purple-600',
    amber: 'bg-amber-50 text-amber-600',
    cyan: 'bg-cyan-50 text-cyan-600',
  };
  return (
    <div className="bg-white rounded-xl border p-4">
      <div className={`inline-flex p-2 rounded-lg mb-2 ${colorMap[color] || colorMap.blue}`}>
        {icon}
      </div>
      <p className="text-xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

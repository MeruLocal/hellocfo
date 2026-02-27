import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Search,
  MessageSquare,
  Clock,
  ChevronDown,
  ChevronRight,
  User,
  Bot,
  Loader2,
  Filter,
  Calendar,
  Hash,
  RefreshCw,
  Building2,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format, isToday, isYesterday, isThisWeek, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { EntityNameCompact } from '@/components/whatsapp/EntityName';

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
    intent?: { name: string; confidence?: number } | null;
    toolsUsed?: string[];
    executionTime?: string;
    llmModel?: string;
    [key: string]: unknown;
  };
}

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  if (isThisWeek(date)) return 'This Week';
  return format(date, 'MMM yyyy');
}

function getRouteBadgeVariant(route?: string): 'default' | 'secondary' | 'outline' {
  if (!route) return 'outline';
  if (route === 'fast') return 'default';
  if (route === 'llm' || route === 'llm_tools') return 'secondary';
  return 'outline';
}

export function GlobalChatHistory() {
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [orgFilter, setOrgFilter] = useState<string>('all');
  const [expandedConversationId, setExpandedConversationId] = useState<string | null>(null);
  const [expandedMessages, setExpandedMessages] = useState<ChatMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const fetchConversations = useCallback(async () => {
    setIsLoading(true);
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
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const toggleConversation = useCallback(async (conv: ConversationRecord) => {
    if (expandedConversationId === conv.conversation_id) {
      setExpandedConversationId(null);
      setExpandedMessages([]);
      return;
    }

    setExpandedConversationId(conv.conversation_id);
    setIsLoadingMessages(true);

    try {
      const msgs = Array.isArray(conv.messages) ? conv.messages as ChatMessage[] : [];
      setExpandedMessages(msgs);
    } catch (e) {
      console.error('Failed to load messages:', e);
      setExpandedMessages([]);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [expandedConversationId]);

  // Unique entities and orgs for filters
  const uniqueEntities = useMemo(() =>
    Array.from(new Set(conversations.map((c) => c.entity_id).filter(Boolean))) as string[],
    [conversations]
  );
  const uniqueOrgs = useMemo(() =>
    Array.from(new Set(conversations.map((c) => c.org_id).filter(Boolean))) as string[],
    [conversations]
  );
  const uniqueModes = useMemo(() =>
    Array.from(new Set(conversations.map((c) => c.mode).filter(Boolean))) as string[],
    [conversations]
  );

  // Filtering
  const filtered = conversations.filter((conv) => {
    if (conv.is_deleted) return false;
    if (modeFilter !== 'all' && conv.mode !== modeFilter) return false;
    if (entityFilter !== 'all' && conv.entity_id !== entityFilter) return false;
    if (orgFilter !== 'all' && conv.org_id !== orgFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesSummary = conv.summary?.toLowerCase().includes(q);
      const matchesName = conv.auto_generated_name?.toLowerCase().includes(q);
      const matchesPreview = conv.last_message_preview?.toLowerCase().includes(q);
      const matchesId = conv.chat_display_id?.toLowerCase().includes(q);
      if (!matchesSummary && !matchesName && !matchesPreview && !matchesId) return false;
    }
    return true;
  });

  // Group by date
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <MessageSquare size={22} className="text-primary" />
            Global Chat History
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            All conversations across the chatbot — {filtered.length} conversations
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchConversations} disabled={isLoading}>
          <RefreshCw size={14} className={cn("mr-1", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="pl-9"
          />
        </div>
        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-[180px]">
            <Building2 size={14} className="mr-1 shrink-0" />
            <SelectValue placeholder="All Entities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Entities</SelectItem>
            {uniqueEntities.map((eid) => (
              <SelectItem key={eid} value={eid}>
                {eid}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={orgFilter} onValueChange={setOrgFilter}>
          <SelectTrigger className="w-[180px]">
            <Users size={14} className="mr-1 shrink-0" />
            <SelectValue placeholder="All Orgs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orgs</SelectItem>
            {uniqueOrgs.map((oid) => (
              <SelectItem key={oid} value={oid}>
                {oid}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={modeFilter} onValueChange={setModeFilter}>
          <SelectTrigger className="w-[160px]">
            <Filter size={14} className="mr-1 shrink-0" />
            <SelectValue placeholder="All Modes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modes</SelectItem>
            {uniqueModes.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {mode}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-6 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <Hash size={14} />
          {conversations.length} total
        </span>
        <span className="flex items-center gap-1">
          <Calendar size={14} />
          {conversations.filter((c) => isToday(new Date(c.updated_at))).length} today
        </span>
        <span className="flex items-center gap-1">
          <MessageSquare size={14} />
          {conversations.reduce((sum, c) => sum + (c.message_count || 0), 0)} total messages
        </span>
      </div>

      {/* Conversation List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading conversations...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <MessageSquare size={40} className="mb-3 opacity-30" />
          <p className="font-medium">No conversations found</p>
          <p className="text-sm">Try adjusting your search or filters</p>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-320px)]">
          <div className="space-y-6">
            {sortedGroups.map(([group, convs]) => (
              <div key={group}>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                  {group} ({convs.length})
                </div>
                <div className="space-y-1">
                  {convs.map((conv) => {
                    const isExpanded = expandedConversationId === conv.conversation_id;
                    return (
                      <div key={conv.id} className="border border-border rounded-lg overflow-hidden">
                        {/* Conversation Row */}
                        <button
                          onClick={() => toggleConversation(conv)}
                          className={cn(
                            "w-full text-left px-4 py-3 flex items-center gap-3 transition-colors hover:bg-muted/50",
                            isExpanded && "bg-muted/50"
                          )}
                        >
                          <div className="text-muted-foreground">
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground truncate">
                                {conv.auto_generated_name || conv.summary || 'Untitled conversation'}
                              </span>
                              {conv.chat_display_id && (
                                <span className="text-xs text-muted-foreground font-mono">
                                  {conv.chat_display_id}
                                </span>
                              )}
                            </div>
                            {/* Entity & Org tags */}
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                                <Building2 size={9} />
                                <EntityNameCompact entityId={conv.entity_id} orgId={conv.org_id || ''} />
                              </Badge>
                              {conv.org_id && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
                                  <Users size={9} />
                                  {conv.org_id}
                                </Badge>
                              )}
                            </div>
                            {conv.last_message_preview && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {conv.last_message_preview}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {conv.mode && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {conv.mode}
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <MessageSquare size={10} />
                              {conv.message_count || 0}
                            </span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock size={10} />
                              {formatDistanceToNow(new Date(conv.updated_at), { addSuffix: true })}
                            </span>
                          </div>
                        </button>

                        {/* Expanded Messages */}
                        {isExpanded && (
                          <div className="border-t border-border bg-background px-4 py-3">
                            {isLoadingMessages ? (
                              <div className="flex items-center justify-center py-4">
                                <Loader2 size={16} className="animate-spin text-muted-foreground" />
                              </div>
                            ) : expandedMessages.length === 0 ? (
                              <p className="text-sm text-muted-foreground text-center py-4">
                                No messages in this conversation
                              </p>
                            ) : (
                              <div className="space-y-3 max-h-96 overflow-y-auto">
                                {expandedMessages.map((msg, idx) => {
                                  const isUserMsg = msg.role === 'user';
                                  return (
                                    <div
                                      key={msg.id || idx}
                                      className={cn(
                                        "flex gap-2",
                                        isUserMsg && "flex-row-reverse"
                                      )}
                                    >
                                      <div
                                        className={cn(
                                          "w-6 h-6 rounded-full flex items-center justify-center shrink-0",
                                          isUserMsg
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted text-muted-foreground"
                                        )}
                                      >
                                        {isUserMsg ? <User size={12} /> : <Bot size={12} />}
                                      </div>
                                      <div
                                        className={cn(
                                          "rounded-lg px-3 py-2 max-w-[75%] text-sm",
                                          isUserMsg
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted text-foreground"
                                        )}
                                      >
                                        <div className="whitespace-pre-wrap break-words">
                                          {msg.content}
                                        </div>
                                        {/* Metadata row */}
                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                          {msg.timestamp && (
                                            <span className={cn(
                                              "text-[10px]",
                                              isUserMsg ? "text-primary-foreground/60" : "text-muted-foreground"
                                            )}>
                                              {format(new Date(msg.timestamp), 'h:mm a')}
                                            </span>
                                          )}
                                          {!isUserMsg && msg.metadata?.route && (
                                            <Badge
                                              variant={getRouteBadgeVariant(msg.metadata.route)}
                                              className="text-[9px] px-1 py-0 h-4"
                                            >
                                              {msg.metadata.route}
                                            </Badge>
                                          )}
                                          {!isUserMsg && msg.metadata?.intent?.name && (
                                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                                              {msg.metadata.intent.name}
                                            </Badge>
                                          )}
                                          {!isUserMsg && msg.metadata?.toolsUsed && msg.metadata.toolsUsed.length > 0 && (
                                            <span className={cn(
                                              "text-[10px]",
                                              isUserMsg ? "text-primary-foreground/60" : "text-muted-foreground"
                                            )}>
                                              🔧 {msg.metadata.toolsUsed.length} tools
                                            </span>
                                          )}
                                          {!isUserMsg && msg.metadata?.executionTime && (
                                            <span className={cn(
                                              "text-[10px]",
                                              isUserMsg ? "text-primary-foreground/60" : "text-muted-foreground"
                                            )}>
                                              ⏱ {msg.metadata.executionTime}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Conversation metadata footer */}
                            <div className="flex items-center gap-3 mt-3 pt-2 border-t border-border text-[10px] text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Building2 size={10} />
                                <EntityNameCompact entityId={conv.entity_id} orgId={conv.org_id || ''} />
                              </span>
                              {conv.org_id && <span>Org: {conv.org_id}</span>}
                              <span>User: {conv.user_id.slice(0, 8)}…</span>
                              <span>Created: {format(new Date(conv.created_at), 'MMM d, h:mm a')}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  MessageSquare,
  Clock,
  User,
  Bot,
  Loader2,
  Filter,
  Calendar,
  Hash,
  RefreshCw,
  Building2,
  Users,
  X,
  ChevronRight,
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
import { PipelineHealthBar } from '@/components/chat-history/PipelineHealthBar';

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

// ─── Right Panel: Message Detail View ───
function MessagePanel({
  conversation,
  onClose,
}: {
  conversation: ConversationRecord;
  onClose: () => void;
}) {
  const messages = useMemo(
    () => (Array.isArray(conversation.messages) ? (conversation.messages as ChatMessage[]) : []),
    [conversation.messages]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Panel Header */}
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
                <Users size={9} />
                {conversation.org_id}
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

      {/* Panel Stats */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border text-[11px] text-muted-foreground shrink-0">
        <span className="flex items-center gap-1">
          <MessageSquare size={11} /> {conversation.message_count || 0} messages
        </span>
        <span className="flex items-center gap-1">
          <Clock size={11} /> {formatDistanceToNow(new Date(conversation.updated_at), { addSuffix: true })}
        </span>
        {conversation.mode && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{conversation.mode}</Badge>
        )}
        <span>Created {format(new Date(conversation.created_at), 'MMM d, h:mm a')}</span>
      </div>

      {/* Pipeline Health */}
      <PipelineHealthBar messages={messages} />

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No messages in this conversation</p>
          ) : (
            messages.map((msg, idx) => {
              const isUserMsg = msg.role === 'user';
              return (
                <div
                  key={msg.id || idx}
                  className={cn('flex gap-2', isUserMsg && 'flex-row-reverse')}
                >
                  <div
                    className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-1',
                      isUserMsg ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {isUserMsg ? <User size={12} /> : <Bot size={12} />}
                  </div>
                  <div
                    className={cn(
                      'rounded-lg px-3 py-2 max-w-[85%] text-sm',
                      isUserMsg ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                    )}
                  >
                    <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {msg.timestamp && (
                        <span className={cn('text-[10px]', isUserMsg ? 'text-primary-foreground/60' : 'text-muted-foreground')}>
                          {format(new Date(msg.timestamp), 'h:mm a')}
                        </span>
                      )}
                      {!isUserMsg && msg.metadata?.route && (
                        <Badge variant={getRouteBadgeVariant(msg.metadata.route)} className="text-[9px] px-1 py-0 h-4">
                          {msg.metadata.route}
                        </Badge>
                      )}
                      {!isUserMsg && msg.metadata?.intent?.name && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                          {msg.metadata.intent.name}
                        </Badge>
                      )}
                      {!isUserMsg && msg.metadata?.toolsUsed && msg.metadata.toolsUsed.length > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          🔧 {msg.metadata.toolsUsed.length} tools
                        </span>
                      )}
                      {!isUserMsg && msg.metadata?.executionTime && (
                        <span className="text-[10px] text-muted-foreground">
                          ⏱ {msg.metadata.executionTime}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="flex items-center gap-3 px-4 py-2 border-t border-border text-[10px] text-muted-foreground shrink-0">
        <span className="flex items-center gap-1">
          <Building2 size={10} />
          <EntityNameCompact entityId={conversation.entity_id} orgId={conversation.org_id || ''} />
        </span>
        {conversation.org_id && <span>Org: {conversation.org_id}</span>}
        <span>User: {conversation.user_id.slice(0, 8)}…</span>
      </div>
    </div>
  );
}

// ─── Main Component ───
export function GlobalChatHistory() {
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [orgFilter, setOrgFilter] = useState<string>('all');
  const [selectedConversation, setSelectedConversation] = useState<ConversationRecord | null>(null);

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

  // Fetch entities for name resolution
  const { data: entitiesList } = useQuery({
    queryKey: ['entities-list'],
    queryFn: async () => {
      const { data } = await supabase.from('entities').select('entity_id, org_id, name');
      return data || [];
    },
  });

  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    entitiesList?.forEach((e) => map.set(e.entity_id, e.name));
    return map;
  }, [entitiesList]);

  const orgNameMap = useMemo(() => {
    const map = new Map<string, string>();
    entitiesList?.forEach((e) => {
      if (e.org_id && !map.has(e.org_id)) map.set(e.org_id, e.org_id);
    });
    return map;
  }, [entitiesList]);

  const uniqueEntities = useMemo(
    () => Array.from(new Set(conversations.map((c) => c.entity_id).filter(Boolean))) as string[],
    [conversations]
  );
  const uniqueOrgs = useMemo(
    () => Array.from(new Set(conversations.map((c) => c.org_id).filter(Boolean))) as string[],
    [conversations]
  );
  const uniqueModes = useMemo(
    () => Array.from(new Set(conversations.map((c) => c.mode).filter(Boolean))) as string[],
    [conversations]
  );

  const filtered = conversations.filter((conv) => {
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
      )
        return false;
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

  const isSelected = (conv: ConversationRecord) =>
    selectedConversation?.conversation_id === conv.conversation_id;

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Left: Conversation List */}
      <div
        className={cn(
          'flex flex-col border-r border-border transition-all duration-200',
          selectedConversation ? 'w-[420px] min-w-[360px]' : 'w-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <MessageSquare size={20} className="text-primary" />
              Global Chat History
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {filtered.length} conversations
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchConversations} disabled={isLoading}>
            <RefreshCw size={14} className={cn('mr-1', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 px-4 py-2 flex-wrap shrink-0">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search…"
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <Building2 size={12} className="mr-1 shrink-0" />
              <SelectValue placeholder="Entity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entities</SelectItem>
              {uniqueEntities.map((eid) => (
                <SelectItem key={eid} value={eid}>{entityNameMap.get(eid) || eid}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={orgFilter} onValueChange={setOrgFilter}>
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <Users size={12} className="mr-1 shrink-0" />
              <SelectValue placeholder="Org" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Orgs</SelectItem>
              {uniqueOrgs.map((oid) => (
                <SelectItem key={oid} value={oid}>{orgNameMap.get(oid) || oid}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={modeFilter} onValueChange={setModeFilter}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <Filter size={12} className="mr-1 shrink-0" />
              <SelectValue placeholder="Mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Modes</SelectItem>
              {uniqueModes.map((mode) => (
                <SelectItem key={mode} value={mode}>{mode}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 px-4 py-1.5 text-[11px] text-muted-foreground shrink-0 border-b border-border">
          <span className="flex items-center gap-1"><Hash size={11} />{conversations.length} total</span>
          <span className="flex items-center gap-1"><Calendar size={11} />{conversations.filter((c) => isToday(new Date(c.updated_at))).length} today</span>
          <span className="flex items-center gap-1"><MessageSquare size={11} />{conversations.reduce((s, c) => s + (c.message_count || 0), 0)} msgs</span>
        </div>

        {/* List */}
        {isLoading ? (
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
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-2">
                    {group} ({convs.length})
                  </div>
                  <div className="space-y-0.5">
                    {convs.map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => setSelectedConversation(conv)}
                        className={cn(
                          'w-full text-left px-3 py-2.5 rounded-md flex items-center gap-2 transition-colors',
                          'hover:bg-muted/50',
                          isSelected(conv) && 'bg-primary/10 border border-primary/20'
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">
                            {conv.auto_generated_name || conv.summary || 'Untitled conversation'}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Badge variant="secondary" className="text-[9px] px-1 py-0 gap-0.5">
                              <Building2 size={8} />
                              <EntityNameCompact entityId={conv.entity_id} orgId={conv.org_id || ''} />
                            </Badge>
                            {conv.org_id && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 gap-0.5">
                                <Users size={8} />
                                {conv.org_id}
                              </Badge>
                            )}
                          </div>
                          {conv.last_message_preview && (
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                              {conv.last_message_preview}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {conv.mode && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0">{conv.mode}</Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <MessageSquare size={9} /> {conv.message_count || 0}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(conv.updated_at), { addSuffix: true })}
                          </span>
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
      {selectedConversation ? (
        <div className="flex-1 min-w-0">
          <MessagePanel
            conversation={selectedConversation}
            onClose={() => setSelectedConversation(null)}
          />
        </div>
      ) : null}
    </div>
  );
}

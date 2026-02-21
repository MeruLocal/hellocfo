import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Search, Plus, MessageSquare, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, isToday, isYesterday } from 'date-fns';

interface ConversationSummary {
  conversation_id: string;
  summary: string | null;
  message_count: number | null;
  created_at: string;
  updated_at: string;
}

interface ConversationSidebarProps {
  userId: string;
  entityId: string;
  activeConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onNewChat: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  refreshKey?: number;
}

function groupByDate(conversations: ConversationSummary[]) {
  const groups: { label: string; items: ConversationSummary[] }[] = [];
  const today: ConversationSummary[] = [];
  const yesterday: ConversationSummary[] = [];
  const older: ConversationSummary[] = [];

  for (const c of conversations) {
    const date = new Date(c.updated_at);
    if (isToday(date)) today.push(c);
    else if (isYesterday(date)) yesterday.push(c);
    else older.push(c);
  }

  if (today.length) groups.push({ label: 'Today', items: today });
  if (yesterday.length) groups.push({ label: 'Yesterday', items: yesterday });
  if (older.length) groups.push({ label: 'Older', items: older });

  return groups;
}

export function ConversationSidebar({
  userId,
  entityId,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  isCollapsed,
  onToggleCollapse,
  refreshKey = 0,
}: ConversationSidebarProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const fetchConversations = async () => {
    if (!userId || !entityId) return;
    setIsLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const pageSize = 100;
      const maxPages = 20;
      const all: ConversationSummary[] = [];

      for (let page = 0; page < maxPages; page++) {
        const offset = page * pageSize;
        const res = await fetch(
          `${supabaseUrl}/functions/v1/get-conversations?userId=${encodeURIComponent(userId)}&entityId=${encodeURIComponent(entityId)}&limit=${pageSize}&offset=${offset}`,
          {
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
          }
        );
        if (!res.ok) break;
        const data = await res.json();
        const pageItems: ConversationSummary[] = Array.isArray(data) ? data : [];
        all.push(...pageItems);
        if (pageItems.length < pageSize) break;
      }

      const deduped = Array.from(
        new Map(all.map((item) => [item.conversation_id, item])).values()
      ).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

      setConversations(deduped);
    } catch (e) {
      console.error('Failed to fetch conversations:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, [userId, entityId, refreshKey]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchConversations();
    }, 30000);
    return () => clearInterval(interval);
  }, [userId, entityId]);

  const filtered = searchQuery
    ? conversations.filter((c) =>
        c.summary?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations;

  const groups = groupByDate(filtered);

  if (isCollapsed) {
    return (
      <div className="w-10 border-r border-border flex flex-col items-center py-2 bg-muted/30">
        <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="mb-2">
          <ChevronRight size={16} />
        </Button>
        <Button variant="ghost" size="icon" onClick={onNewChat}>
          <Plus size={16} />
        </Button>
      </div>
    );
  }

  return (
    <div className="w-64 border-r border-border flex flex-col bg-muted/30">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <span className="text-sm font-medium">Chat History</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onNewChat} className="h-7 w-7">
            <Plus size={14} />
          </Button>
          <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="h-7 w-7">
            <ChevronLeft size={14} />
          </Button>
        </div>
      </div>

      <div className="p-2">
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          </div>
        ) : groups.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            No conversations yet
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mb-2">
              <div className="px-3 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {group.label}
              </div>
              {group.items.map((conv) => (
                <button
                  key={conv.conversation_id}
                  onClick={() => onSelectConversation(conv.conversation_id)}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors ${
                    activeConversationId === conv.conversation_id
                      ? 'bg-muted font-medium'
                      : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare size={12} className="text-muted-foreground shrink-0" />
                    <span className="truncate">
                      {conv.summary || 'New conversation'}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 ml-5">
                    {conv.message_count || 0} msgs • {format(new Date(conv.updated_at), 'h:mm a')}
                  </div>
                </button>
              ))}
            </div>
          ))
        )}
      </ScrollArea>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, subDays, format, eachDayOfInterval } from 'date-fns';

export interface MessageTypeStat {
  type: string;
  count: number;
  percentage: number;
}

export interface DailyTrend {
  date: string;
  total: number;
  inbound: number;
  outbound: number;
  success: number;
  failed: number;
}

export interface ProcessingOutcome {
  status: string;
  count: number;
  percentage: number;
}

export interface EntityBreakdown {
  entityId: string;
  entityName: string;
  messages: number;
  successRate: number;
}

export interface WhatsAppAnalyticsSummary {
  totalMessages: number;
  todayMessages: number;
  weekMessages: number;
  monthMessages: number;
  successRate: number;
  uniqueUsers: number;
  inboundCount: number;
  outboundCount: number;
  voiceDeclinedCount: number;
  imageCount: number;
  documentCount: number;
  textCount: number;
}

export interface WhatsAppAnalytics {
  summary: WhatsAppAnalyticsSummary;
  messageTypes: MessageTypeStat[];
  dailyTrends: DailyTrend[];
  processingOutcomes: ProcessingOutcome[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useWhatsAppAnalytics(days: number = 30): WhatsAppAnalytics {
  const [summary, setSummary] = useState<WhatsAppAnalyticsSummary>({
    totalMessages: 0,
    todayMessages: 0,
    weekMessages: 0,
    monthMessages: 0,
    successRate: 0,
    uniqueUsers: 0,
    inboundCount: 0,
    outboundCount: 0,
    voiceDeclinedCount: 0,
    imageCount: 0,
    documentCount: 0,
    textCount: 0,
  });
  const [messageTypes, setMessageTypes] = useState<MessageTypeStat[]>([]);
  const [dailyTrends, setDailyTrends] = useState<DailyTrend[]>([]);
  const [processingOutcomes, setProcessingOutcomes] = useState<ProcessingOutcome[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const now = new Date();
      const startDate = subDays(now, days);
      const todayStart = startOfDay(now);
      const weekStart = subDays(now, 7);

      // Fetch all messages in date range
      const { data: messages, error: messagesError } = await (supabase as any)
        .from('whatsapp_messages')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (messagesError) throw messagesError;

      if (!messages || messages.length === 0) {
        setSummary({
          totalMessages: 0,
          todayMessages: 0,
          weekMessages: 0,
          monthMessages: 0,
          successRate: 0,
          uniqueUsers: 0,
          inboundCount: 0,
          outboundCount: 0,
          voiceDeclinedCount: 0,
          imageCount: 0,
          documentCount: 0,
          textCount: 0,
        });
        setMessageTypes([]);
        setDailyTrends([]);
        setProcessingOutcomes([]);
        setIsLoading(false);
        return;
      }

      // Calculate summary stats
      const totalMessages = messages.length;
      const todayMessages = messages.filter(m => new Date(m.created_at) >= todayStart).length;
      const weekMessages = messages.filter(m => new Date(m.created_at) >= weekStart).length;
      const monthMessages = totalMessages;

      const inboundMessages = messages.filter(m => m.direction === 'inbound');
      const outboundMessages = messages.filter(m => m.direction === 'outbound');

      const successfulMessages = messages.filter(m => 
        m.processing_status === 'responded' || 
        m.processing_status === 'processed' ||
        m.processing_status === 'success'
      );
      const successRate = inboundMessages.length > 0 
        ? (successfulMessages.length / inboundMessages.length) * 100 
        : 0;

      const uniqueUsers = new Set(messages.map(m => m.phone_e164)).size;

      // Count message types
      const voiceDeclinedCount = messages.filter(m => 
        m.media_content_type?.startsWith('audio/') || 
        m.message_type === 'voice_declined'
      ).length;
      
      const imageCount = messages.filter(m => 
        m.media_content_type?.startsWith('image/')
      ).length;
      
      const documentCount = messages.filter(m => 
        m.media_content_type?.includes('pdf') || 
        m.media_content_type?.includes('document') ||
        m.message_type === 'document'
      ).length;
      
      const textCount = messages.filter(m => 
        !m.media_content_type && m.message_type !== 'voice_declined'
      ).length;

      setSummary({
        totalMessages,
        todayMessages,
        weekMessages,
        monthMessages,
        successRate,
        uniqueUsers,
        inboundCount: inboundMessages.length,
        outboundCount: outboundMessages.length,
        voiceDeclinedCount,
        imageCount,
        documentCount,
        textCount,
      });

      // Calculate message type distribution
      const typeStats: MessageTypeStat[] = [
        { type: 'Text', count: textCount, percentage: (textCount / totalMessages) * 100 },
        { type: 'Image', count: imageCount, percentage: (imageCount / totalMessages) * 100 },
        { type: 'Document', count: documentCount, percentage: (documentCount / totalMessages) * 100 },
        { type: 'Voice (declined)', count: voiceDeclinedCount, percentage: (voiceDeclinedCount / totalMessages) * 100 },
      ].filter(t => t.count > 0);
      setMessageTypes(typeStats);

      // Calculate daily trends
      const dateRange = eachDayOfInterval({ start: startDate, end: now });
      const trends: DailyTrend[] = dateRange.map(date => {
        const dayStart = startOfDay(date);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        const dayMessages = messages.filter(m => {
          const msgDate = new Date(m.created_at);
          return msgDate >= dayStart && msgDate < dayEnd;
        });

        const dayInbound = dayMessages.filter(m => m.direction === 'inbound').length;
        const dayOutbound = dayMessages.filter(m => m.direction === 'outbound').length;
        const daySuccess = dayMessages.filter(m => 
          m.processing_status === 'responded' || 
          m.processing_status === 'processed'
        ).length;
        const dayFailed = dayMessages.filter(m => 
          m.processing_status === 'failed' || 
          m.processing_status === 'error'
        ).length;

        return {
          date: format(date, 'MMM dd'),
          total: dayMessages.length,
          inbound: dayInbound,
          outbound: dayOutbound,
          success: daySuccess,
          failed: dayFailed,
        };
      });
      setDailyTrends(trends);

      // Calculate processing outcomes
      const statusCounts: Record<string, number> = {};
      messages.forEach(m => {
        const status = m.processing_status || 'unknown';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });

      const outcomes: ProcessingOutcome[] = Object.entries(statusCounts).map(([status, count]) => ({
        status: status.charAt(0).toUpperCase() + status.slice(1),
        count,
        percentage: (count / totalMessages) * 100,
      }));
      setProcessingOutcomes(outcomes);

    } catch (err) {
      console.error('Error fetching WhatsApp analytics:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch analytics');
    } finally {
      setIsLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return {
    summary,
    messageTypes,
    dailyTrends,
    processingOutcomes,
    isLoading,
    error,
    refetch: fetchAnalytics,
  };
}

import { useState, useEffect } from 'react';

interface IntentAnalytics {
  name: string;
  triggerCount: number;
  avgConfidence: number;
  avgFeedbackScore: number | null;
  successRate: number | null;
  recentConversations: { conversationId: string; userMessage: string; createdAt: string }[];
}

interface ToolAnalytics {
  name: string;
  callCount: number;
  successRate: number;
  avgResponseTime: number | null;
  recentConversations: { conversationId: string; userMessage: string; createdAt: string }[];
}

interface AnalyticsData {
  intents: IntentAnalytics[];
  tools: ToolAnalytics[];
}

export function useToolAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/get-tool-analytics`, {
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch (e) {
      console.error('Failed to fetch analytics:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const getIntentAnalytics = (intentName: string): IntentAnalytics | null => {
    return data?.intents.find((i) => i.name === intentName) || null;
  };

  const getToolAnalytics = (toolName: string): ToolAnalytics | null => {
    return data?.tools.find((t) => t.name === toolName) || null;
  };

  return { data, isLoading, getIntentAnalytics, getToolAnalytics, refetch: fetchAnalytics };
}

export type { IntentAnalytics, ToolAnalytics };

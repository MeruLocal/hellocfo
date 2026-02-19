import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Fetch all feedback logs (last 1000)
    const { data: logs, error } = await supabase
      .from("feedback_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) throw error;

    // Per-intent stats
    const intentStats: Record<string, {
      name: string;
      triggerCount: number;
      totalConfidence: number;
      totalFeedbackScore: number;
      feedbackCount: number;
      recentConversations: { conversationId: string; userMessage: string; createdAt: string }[];
    }> = {};

    // Per-tool stats
    const toolStats: Record<string, {
      callCount: number;
      successCount: number;
      totalResponseTime: number;
      responseTimeCount: number;
      recentConversations: { conversationId: string; userMessage: string; createdAt: string }[];
    }> = {};

    for (const log of logs || []) {
      // Intent aggregation
      if (log.intent_matched) {
        if (!intentStats[log.intent_matched]) {
          intentStats[log.intent_matched] = {
            name: log.intent_matched,
            triggerCount: 0,
            totalConfidence: 0,
            totalFeedbackScore: 0,
            feedbackCount: 0,
            recentConversations: [],
          };
        }
        const s = intentStats[log.intent_matched];
        s.triggerCount++;
        if (log.intent_confidence) s.totalConfidence += log.intent_confidence;
        if (log.feedback_score != null) {
          s.totalFeedbackScore += log.feedback_score;
          s.feedbackCount++;
        }
        if (s.recentConversations.length < 10) {
          s.recentConversations.push({
            conversationId: log.conversation_id,
            userMessage: log.user_message,
            createdAt: log.created_at,
          });
        }
      }

      // Tool aggregation
      const toolsUsed = log.tools_used || [];
      const toolsLoaded = log.tools_loaded || [];
      const allTools = [...new Set([...toolsUsed, ...toolsLoaded])];

      for (const tool of allTools) {
        if (!toolStats[tool]) {
          toolStats[tool] = {
            callCount: 0,
            successCount: 0,
            totalResponseTime: 0,
            responseTimeCount: 0,
            recentConversations: [],
          };
        }
        const ts = toolStats[tool];
        if (toolsUsed.includes(tool)) {
          ts.callCount++;
          ts.successCount++; // If it's in tools_used, it succeeded
        }
        if (log.response_time_ms && toolsUsed.includes(tool)) {
          ts.totalResponseTime += log.response_time_ms;
          ts.responseTimeCount++;
        }
        if (ts.recentConversations.length < 10) {
          ts.recentConversations.push({
            conversationId: log.conversation_id,
            userMessage: log.user_message,
            createdAt: log.created_at,
          });
        }
      }
    }

    // Format output
    const intents = Object.values(intentStats).map((s) => ({
      name: s.name,
      triggerCount: s.triggerCount,
      avgConfidence: s.triggerCount > 0 ? s.totalConfidence / s.triggerCount : 0,
      avgFeedbackScore: s.feedbackCount > 0 ? s.totalFeedbackScore / s.feedbackCount : null,
      successRate: s.feedbackCount > 0 ? (s.totalFeedbackScore / s.feedbackCount) * 100 : null,
      recentConversations: s.recentConversations,
    }));

    const tools = Object.entries(toolStats).map(([name, s]) => ({
      name,
      callCount: s.callCount,
      successRate: s.callCount > 0 ? (s.successCount / s.callCount) * 100 : 0,
      avgResponseTime: s.responseTimeCount > 0 ? Math.round(s.totalResponseTime / s.responseTimeCount) : null,
      recentConversations: s.recentConversations,
    }));

    return new Response(JSON.stringify({ intents, tools }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

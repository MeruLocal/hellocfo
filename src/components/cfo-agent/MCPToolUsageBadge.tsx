import React from 'react';
import { Zap, CheckCircle, Clock } from 'lucide-react';

interface ToolAnalytics {
  name: string;
  callCount: number;
  successRate: number;
  avgResponseTime: number | null;
  recentConversations: { conversationId: string; userMessage: string; createdAt: string }[];
}

interface MCPToolUsageBadgeProps {
  toolName: string;
  analytics: ToolAnalytics | null;
}

export function MCPToolUsageBadge({ toolName, analytics }: MCPToolUsageBadgeProps) {
  if (!analytics || analytics.callCount === 0) return null;

  return (
    <div className="flex items-center gap-2 mt-1">
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
        <Zap size={10} />
        {analytics.callCount} calls
      </span>
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
        <CheckCircle size={10} />
        {analytics.successRate.toFixed(0)}%
      </span>
      {analytics.avgResponseTime != null && (
        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
          <Clock size={10} />
          {analytics.avgResponseTime}ms
        </span>
      )}
    </div>
  );
}

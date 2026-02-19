import React, { useState, useEffect } from 'react';
import { BarChart3, MessageSquare, TrendingUp, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface IntentAnalytics {
  name: string;
  triggerCount: number;
  avgConfidence: number;
  avgFeedbackScore: number | null;
  successRate: number | null;
  recentConversations: { conversationId: string; userMessage: string; createdAt: string }[];
}

interface IntentUsageTabProps {
  intentName: string;
  analytics: IntentAnalytics | null;
  isLoading: boolean;
}

export function IntentUsageTab({ intentName, analytics, isLoading }: IntentUsageTabProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-12 text-gray-500">
        <BarChart3 size={32} className="mx-auto mb-2 text-gray-300" />
        <p className="text-sm">No usage data yet for this intent</p>
        <p className="text-xs text-gray-400 mt-1">Data will appear once conversations trigger this intent</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-blue-50 rounded-lg">
          <div className="text-2xl font-bold text-blue-700">{analytics.triggerCount}</div>
          <div className="text-xs text-blue-600">Total Triggers</div>
        </div>
        <div className="p-4 bg-green-50 rounded-lg">
          <div className="text-2xl font-bold text-green-700">
            {(analytics.avgConfidence * 100).toFixed(0)}%
          </div>
          <div className="text-xs text-green-600">Avg Confidence</div>
        </div>
        <div className="p-4 bg-purple-50 rounded-lg">
          <div className="text-2xl font-bold text-purple-700">
            {analytics.successRate != null ? `${analytics.successRate.toFixed(0)}%` : '—'}
          </div>
          <div className="text-xs text-purple-600">Success Rate</div>
        </div>
      </div>

      {/* Recent Conversations */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
          <MessageSquare size={14} />
          Recent Conversations
        </h4>
        {analytics.recentConversations.length === 0 ? (
          <p className="text-sm text-gray-400">No recent conversations</p>
        ) : (
          <div className="space-y-2">
            {analytics.recentConversations.map((conv, i) => (
              <div key={i} className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-800 truncate">{conv.userMessage}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {format(new Date(conv.createdAt), 'MMM d, yyyy h:mm a')}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

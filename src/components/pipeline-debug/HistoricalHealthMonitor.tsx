import React from 'react';
import { BarChart3, Clock, AlertTriangle } from 'lucide-react';

export function HistoricalHealthMonitor() {
  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-6">
      <h2 className="text-sm font-semibold text-zinc-200 tracking-wide uppercase mb-4">Historical Health Monitor</h2>
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: BarChart3, label: 'Routing Distribution', desc: 'Fast vs LLM vs Cached path usage over time' },
          { icon: AlertTriangle, label: 'Failure Heatmap', desc: 'Step-level failure rates by hour' },
          { icon: Clock, label: 'Response Time Histogram', desc: 'P50/P90/P99 latency breakdown' },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label} className="border border-dashed border-zinc-700 rounded-lg p-4 flex flex-col items-center justify-center text-center min-h-[120px]">
            <Icon className="h-6 w-6 text-zinc-600 mb-2" />
            <span className="text-xs font-medium text-zinc-400">{label}</span>
            <span className="text-[10px] text-zinc-600 mt-1">{desc}</span>
            <span className="text-[10px] text-zinc-700 mt-2 italic">Phase 4</span>
          </div>
        ))}
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StepJsonViewerProps {
  label: string;
  data: unknown;
  defaultOpen?: boolean;
}

export function StepJsonViewer({ label, data, defaultOpen = false }: StepJsonViewerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  if (data === undefined || data === null) return null;

  const jsonStr = JSON.stringify(data, null, 2);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(jsonStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="border rounded-md overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-1.5 text-xs font-mono text-muted-foreground hover:bg-muted/30 transition-colors"
      >
        <span className="flex items-center gap-1">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {label}
        </span>
        <button onClick={handleCopy} className="p-1 hover:text-foreground transition-colors">
          {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        </button>
      </button>
      {open && (
        <pre className="px-3 py-2 text-xs font-mono text-foreground bg-muted/20 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre border-t">
          {jsonStr}
        </pre>
      )}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, HelpCircle, AlertTriangle, Clock, Ban } from 'lucide-react';
import type { MCQStatus } from './types';

export interface MCQOption {
  label: string;
  value: string;
  description?: string;
}

export type MCQType = 
  | 'entity_resolution'
  | 'parameter_resolution'
  | 'write_confirmation'
  | 'disambiguation';

interface MCQCardProps {
  mcqId?: string;
  mcqType: MCQType;
  question: string;
  options: MCQOption[];
  onSelect: (option: MCQOption) => void;
  disabled?: boolean;
  selectedValue?: string | null;
  createdAt?: string;
  status?: MCQStatus;
}

const MCQ_EXPIRY_MS = 2 * 60 * 1000; // 2 minutes

const MCQ_ICONS: Record<MCQType, React.ReactNode> = {
  entity_resolution: <HelpCircle size={16} className="text-blue-500" />,
  parameter_resolution: <HelpCircle size={16} className="text-amber-500" />,
  write_confirmation: <AlertTriangle size={16} className="text-orange-500" />,
  disambiguation: <HelpCircle size={16} className="text-purple-500" />,
};

const MCQ_LABELS: Record<MCQType, string> = {
  entity_resolution: 'Select Match',
  parameter_resolution: 'Choose Option',
  write_confirmation: 'Confirm Action',
  disambiguation: 'Clarify',
};

function useExpiryTimer(createdAt?: string) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    if (!createdAt) return;
    const created = new Date(createdAt).getTime();
    if (isNaN(created)) return;

    const update = () => {
      const remaining = MCQ_EXPIRY_MS - (Date.now() - created);
      setRemainingMs(Math.max(0, remaining));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [createdAt]);

  return remainingMs;
}

function formatTimer(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function MCQCard({ mcqType, question, options, onSelect, disabled, selectedValue, createdAt, status }: MCQCardProps) {
  const remainingMs = useExpiryTimer(createdAt);
  
  const isExpired = status === 'expired' || (remainingMs !== null && remainingMs <= 0 && !selectedValue && status !== 'resolved');
  const isOverridden = status === 'overridden';
  const isCancelled = status === 'cancelled';
  const isInactive = isExpired || isOverridden || isCancelled || (selectedValue !== null && selectedValue !== undefined);
  
  const overlayLabel = isExpired ? 'Expired' : isOverridden ? 'Overridden' : isCancelled ? 'Cancelled' : null;

  return (
    <div className={cn(
      "rounded-xl border border-border bg-card p-4 space-y-3 max-w-md transition-opacity",
      isInactive && "opacity-60"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          {MCQ_ICONS[mcqType]}
          <span>{MCQ_LABELS[mcqType]}</span>
        </div>
        
        {/* Timer or Status Badge */}
        {overlayLabel ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            <Ban size={10} />
            {overlayLabel}
          </span>
        ) : remainingMs !== null && !selectedValue ? (
          <span className={cn(
            "flex items-center gap-1 text-xs px-2 py-0.5 rounded-full",
            remainingMs < 30000 ? "text-destructive bg-destructive/10" : "text-muted-foreground bg-muted"
          )}>
            <Clock size={10} />
            {formatTimer(remainingMs)}
          </span>
        ) : null}
      </div>

      {/* Question */}
      <p className="text-sm font-medium text-foreground">{question}</p>

      {/* Options */}
      <div className="space-y-2">
        {options.map((option) => {
          const isSelected = selectedValue === option.value;
          return (
            <Button
              key={option.value}
              variant={isSelected ? "default" : "outline"}
              size="sm"
              className={cn(
                "w-full justify-start text-left h-auto py-2 px-3",
                isSelected && "ring-2 ring-primary/50"
              )}
              onClick={() => onSelect(option)}
              disabled={disabled || isInactive}
            >
              <div className="flex items-start gap-2 w-full">
                <div className="mt-0.5">
                  {isSelected ? (
                    <CheckCircle2 size={14} className="text-primary-foreground" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-muted-foreground/40" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{option.label}</div>
                  {option.description && (
                    <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {option.description}
                    </div>
                  )}
                </div>
              </div>
            </Button>
          );
        })}
      </div>

      {/* Cancel for write confirmations */}
      {mcqType === 'write_confirmation' && !isInactive && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelect({ label: 'Cancel', value: 'cancel' })}
            disabled={disabled}
            className="text-xs text-muted-foreground"
          >
            <XCircle size={12} className="mr-1" />
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

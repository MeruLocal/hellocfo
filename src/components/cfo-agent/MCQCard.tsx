import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, HelpCircle, AlertTriangle } from 'lucide-react';

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
}

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

export function MCQCard({ mcqType, question, options, onSelect, disabled, selectedValue }: MCQCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3 max-w-md">
      {/* Header */}
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        {MCQ_ICONS[mcqType]}
        <span>{MCQ_LABELS[mcqType]}</span>
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
              disabled={disabled || (selectedValue !== null && selectedValue !== undefined)}
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
      {mcqType === 'write_confirmation' && !selectedValue && (
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

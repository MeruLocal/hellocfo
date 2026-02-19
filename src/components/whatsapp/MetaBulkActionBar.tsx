import React from 'react';
import { Button } from '@/components/ui/button';
import { X, Trash2, Send, CheckSquare } from 'lucide-react';

interface MetaBulkActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  onBulkSubmit: () => void;
  isDeleting?: boolean;
  isSubmitting?: boolean;
}

export function MetaBulkActionBar({
  selectedCount,
  onClearSelection,
  onBulkDelete,
  onBulkSubmit,
  isDeleting,
  isSubmitting,
}: MetaBulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="sticky top-0 z-10 bg-primary text-primary-foreground rounded-lg p-3 flex items-center justify-between shadow-lg animate-in slide-in-from-top-2">
      <div className="flex items-center gap-3">
        <CheckSquare className="h-5 w-5" />
        <span className="font-medium">
          {selectedCount} template{selectedCount !== 1 ? 's' : ''} selected
        </span>
      </div>
      
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onBulkSubmit}
          disabled={isSubmitting}
          className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
        >
          <Send className="h-4 w-4 mr-2" />
          {isSubmitting ? 'Submitting...' : 'Submit to Meta'}
        </Button>
        
        <Button
          variant="secondary"
          size="sm"
          onClick={onBulkDelete}
          disabled={isDeleting}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          {isDeleting ? 'Deleting...' : 'Delete'}
        </Button>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={onClearSelection}
          className="text-primary-foreground hover:bg-primary-foreground/20"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

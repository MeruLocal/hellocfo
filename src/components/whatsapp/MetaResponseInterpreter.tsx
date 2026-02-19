import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ClipboardPaste,
  Wand2,
} from 'lucide-react';

interface MetaResponseInterpreterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Interpretation {
  templateId?: string;
  status: string;
  rejectionReason?: string;
  category?: string;
  name?: string;
  errorCode?: number;
  errorType?: string;
  isSuccess: boolean;
}

export function MetaResponseInterpreter({ open, onOpenChange }: MetaResponseInterpreterProps) {
  const [response, setResponse] = useState('');
  const [interpretation, setInterpretation] = useState<Interpretation | null>(null);

  const interpretMutation = useMutation({
    mutationFn: async (responseJson: string) => {
      const { data, error } = await supabase.functions.invoke('meta-template-api', {
        body: { action: 'interpret-response', response: responseJson },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Interpretation failed');
      return data.interpretation;
    },
    onSuccess: (data) => {
      setInterpretation(data);
    },
    onError: (error) => {
      toast({ title: 'Failed to interpret', description: String(error), variant: 'destructive' });
    },
  });

  const handleInterpret = () => {
    if (!response.trim()) {
      toast({ title: 'Please paste a response', variant: 'destructive' });
      return;
    }
    interpretMutation.mutate(response);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setResponse(text);
      toast({ title: 'Pasted from clipboard' });
    } catch {
      toast({ title: 'Failed to paste', variant: 'destructive' });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'REJECTED':
      case 'ERROR':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'PENDING':
        return <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />;
      default:
        return <AlertCircle className="h-5 w-5 text-amber-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'REJECTED':
      case 'ERROR':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      case 'PENDING':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      default:
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardPaste className="h-5 w-5" />
            Interpret Meta API Response
          </DialogTitle>
          <DialogDescription>
            Paste a Meta API response to understand the template status
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Meta API Response</Label>
              <Button variant="outline" size="sm" onClick={handlePaste}>
                <ClipboardPaste className="mr-2 h-4 w-4" />
                Paste
              </Button>
            </div>
            <Textarea
              placeholder='{"id": "123456", "status": "APPROVED", ...}'
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              className="min-h-[150px] font-mono text-sm"
            />
          </div>

          <Button onClick={handleInterpret} disabled={interpretMutation.isPending}>
            {interpretMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-4 w-4" />
            )}
            Interpret Response
          </Button>

          {interpretation && (
            <div className="p-4 border rounded-lg space-y-3">
              <div className="flex items-center gap-3">
                {getStatusIcon(interpretation.status)}
                <div>
                  <p className="font-medium">
                    {interpretation.isSuccess ? 'Success' : 'Error/Issue Detected'}
                  </p>
                  <Badge className={getStatusColor(interpretation.status)}>
                    {interpretation.status}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                {interpretation.templateId && (
                  <div>
                    <label className="text-xs text-muted-foreground">Template ID</label>
                    <p className="font-mono">{interpretation.templateId}</p>
                  </div>
                )}
                {interpretation.name && (
                  <div>
                    <label className="text-xs text-muted-foreground">Name</label>
                    <p>{interpretation.name}</p>
                  </div>
                )}
                {interpretation.category && (
                  <div>
                    <label className="text-xs text-muted-foreground">Category</label>
                    <p>{interpretation.category}</p>
                  </div>
                )}
                {interpretation.errorCode && (
                  <div>
                    <label className="text-xs text-muted-foreground">Error Code</label>
                    <p className="text-red-600">{interpretation.errorCode}</p>
                  </div>
                )}
              </div>

              {interpretation.rejectionReason && (
                <div className="p-3 bg-destructive/10 rounded-lg">
                  <label className="text-xs text-destructive font-medium">Rejection Reason</label>
                  <p className="text-sm text-destructive mt-1">{interpretation.rejectionReason}</p>
                </div>
              )}

              {interpretation.rejectionReason && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm">
                    <strong>Next Steps:</strong> Review the rejection reason, fix the template, 
                    and resubmit with a new version (e.g., <code>template_name_v2</code>).
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

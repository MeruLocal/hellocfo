import React, { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import {
  FileText, Upload, Download, Trash2, Loader2, Clock, User,
  FileType, HardDrive, RefreshCw, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/markdown',
  'text/plain',
];

const ACCEPTED_EXTENSIONS = '.pdf,.doc,.docx,.md,.txt';

function formatFileSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

function getFileIcon(fileType: string) {
  if (fileType.includes('pdf')) return '📄';
  if (fileType.includes('word') || fileType.includes('doc')) return '📝';
  if (fileType.includes('markdown') || fileType.includes('md')) return '📋';
  return '📎';
}

interface MasterPlanRecord {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  uploaded_by: string | null;
  description: string | null;
  version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function MasterPlanView() {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState('');

  const { data: plans, isLoading } = useQuery({
    queryKey: ['master-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('master_plan')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as MasterPlanRecord[];
    },
  });

  const activePlan = plans?.find(p => p.is_active);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum file size is 20MB.', variant: 'destructive' });
      return;
    }

    // Validate type by extension as fallback
    const ext = file.name.split('.').pop()?.toLowerCase();
    const validExts = ['pdf', 'doc', 'docx', 'md', 'txt'];
    if (!validExts.includes(ext || '')) {
      toast({ title: 'Unsupported file type', description: 'Please upload a .pdf, .doc, .docx, or .md file.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      // Determine next version
      const currentVersion = plans?.length ? Math.max(...plans.map(p => p.version)) : 0;
      const nextVersion = currentVersion + 1;

      // Upload to storage
      const storagePath = `v${nextVersion}_${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('master-plan')
        .upload(storagePath, file, { upsert: false });

      if (uploadError) throw uploadError;

      // Deactivate previous active plans
      if (activePlan) {
        await supabase
          .from('master_plan')
          .update({ is_active: false } as any)
          .eq('is_active', true);
      }

      // Insert metadata
      const { error: insertError } = await supabase
        .from('master_plan')
        .insert({
          file_name: file.name,
          file_type: file.type || `application/${ext}`,
          file_size: file.size,
          storage_path: storagePath,
          description: description.trim() || null,
          version: nextVersion,
          is_active: true,
        } as any);

      if (insertError) throw insertError;

      toast({ title: 'Master Plan uploaded', description: `v${nextVersion} — ${file.name}` });
      setDescription('');
      queryClient.invalidateQueries({ queryKey: ['master-plans'] });
    } catch (err: any) {
      console.error('Upload failed:', err);
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      // Reset file input
      e.target.value = '';
    }
  }, [plans, activePlan, description, queryClient]);

  const handleDownload = useCallback(async (plan: MasterPlanRecord) => {
    try {
      const { data } = supabase.storage.from('master-plan').getPublicUrl(plan.storage_path);
      if (data?.publicUrl) {
        const a = document.createElement('a');
        a.href = data.publicUrl;
        a.download = plan.file_name;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err: any) {
      toast({ title: 'Download failed', description: err.message, variant: 'destructive' });
    }
  }, []);

  const handleSetActive = useCallback(async (plan: MasterPlanRecord) => {
    try {
      // Deactivate all
      await supabase.from('master_plan').update({ is_active: false } as any).eq('is_active', true);
      // Activate selected
      await supabase.from('master_plan').update({ is_active: true } as any).eq('id', plan.id);
      toast({ title: 'Active plan updated', description: `v${plan.version} is now the active plan.` });
      queryClient.invalidateQueries({ queryKey: ['master-plans'] });
    } catch (err: any) {
      toast({ title: 'Failed to update', description: err.message, variant: 'destructive' });
    }
  }, [queryClient]);

  const handleDelete = useCallback(async (plan: MasterPlanRecord) => {
    try {
      await supabase.storage.from('master-plan').remove([plan.storage_path]);
      await supabase.from('master_plan').delete().eq('id', plan.id);
      toast({ title: 'Plan deleted', description: plan.file_name });
      queryClient.invalidateQueries({ queryKey: ['master-plans'] });
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    }
  }, [queryClient]);

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <FileText size={22} className="text-primary" />
          Master Plan
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Upload and manage the project's master plan document. Supports PDF, Word (.doc/.docx), and Markdown (.md) files.
        </p>
      </div>

      {/* Active Plan Highlight */}
      {activePlan && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <span className="text-3xl">{getFileIcon(activePlan.file_type)}</span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-foreground">{activePlan.file_name}</h3>
                  <Badge variant="default" className="text-[10px]">v{activePlan.version} · Active</Badge>
                </div>
                {activePlan.description && (
                  <p className="text-sm text-muted-foreground mt-1">{activePlan.description}</p>
                )}
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><HardDrive size={11} /> {formatFileSize(activePlan.file_size)}</span>
                  <span className="flex items-center gap-1"><Clock size={11} /> {formatDistanceToNow(new Date(activePlan.created_at), { addSuffix: true })}</span>
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => handleDownload(activePlan)}>
              <Download size={14} className="mr-1" /> Download
            </Button>
          </div>
        </div>
      )}

      {/* Upload Section */}
      <div className="bg-card border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Upload size={16} className="text-primary" />
          Upload New Version
        </h3>
        <div className="space-y-3">
          <Input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Optional description (e.g. 'Q1 2026 roadmap update')"
            className="text-sm"
            maxLength={200}
          />
          <div className="flex items-center gap-3">
            <label className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors',
              'hover:border-primary hover:bg-primary/5 text-muted-foreground hover:text-foreground',
              uploading && 'pointer-events-none opacity-50'
            )}>
              {uploading ? (
                <><Loader2 size={18} className="animate-spin" /> Uploading…</>
              ) : (
                <><Upload size={18} /> Click to upload .pdf, .doc, .docx, or .md</>
              )}
              <input
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                onChange={handleUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <AlertCircle size={10} /> Max 20MB. Uploading a new file will set it as the active plan. Previous versions are preserved.
          </p>
        </div>
      </div>

      {/* Version History */}
      <div className="bg-card border rounded-xl">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Clock size={16} className="text-primary" /> Version History
          </h3>
          <span className="text-xs text-muted-foreground">{plans?.length || 0} versions</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : !plans?.length ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FileText size={32} className="mb-2 opacity-30" />
            <p className="text-sm">No plan uploaded yet</p>
          </div>
        ) : (
          <div className="divide-y">
            {plans.map(plan => (
              <div key={plan.id} className={cn('flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors', plan.is_active && 'bg-primary/5')}>
                <span className="text-xl">{getFileIcon(plan.file_type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{plan.file_name}</span>
                    <Badge variant={plan.is_active ? 'default' : 'outline'} className="text-[10px] shrink-0">
                      v{plan.version}{plan.is_active ? ' · Active' : ''}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                    <span>{formatFileSize(plan.file_size)}</span>
                    <span>{format(new Date(plan.created_at), 'MMM d, yyyy h:mm a')}</span>
                    {plan.description && <span className="truncate max-w-[200px]">{plan.description}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!plan.is_active && (
                    <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => handleSetActive(plan)}>
                      Set Active
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownload(plan)}>
                    <Download size={14} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(plan)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

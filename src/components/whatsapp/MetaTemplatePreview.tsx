import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Copy, CheckCircle2, XCircle, Clock, FileText } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface MetaTemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  buttons?: Array<{
    type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
    text: string;
    url?: string;
    phone_number?: string;
  }>;
}

interface MetaWhatsAppTemplate {
  id: string;
  name: string;
  language: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED';
  rejection_reason: string | null;
  meta_template_id: string | null;
  components: MetaTemplateComponent[];
  variables_mapping: Record<string, string> | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  is_active: boolean;
  quality_score: string | null;
}

interface MetaTemplatePreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: MetaWhatsAppTemplate;
}

const statusIcons: Record<string, React.ReactNode> = {
  DRAFT: <FileText className="h-4 w-4" />,
  PENDING: <Clock className="h-4 w-4" />,
  APPROVED: <CheckCircle2 className="h-4 w-4 text-green-600" />,
  REJECTED: <XCircle className="h-4 w-4 text-red-600" />,
};

// Sample values for preview
const sampleValues: Record<string, string> = {
  '1': 'John Doe',
  '2': 'ORD-12345',
  '3': '₹5,000',
  '4': '15 Feb 2026',
  '5': 'Tech Solutions Pvt Ltd',
};

export function MetaTemplatePreview({ open, onOpenChange, template }: MetaTemplatePreviewProps) {
  const copyJson = () => {
    const json = JSON.stringify({
      name: template.name,
      language: template.language,
      category: template.category,
      components: template.components,
    }, null, 2);
    navigator.clipboard.writeText(json);
    toast({ title: 'JSON copied to clipboard' });
  };

  const renderPreviewText = (text: string): string => {
    let preview = text;
    // Replace {{1}}, {{2}}, etc. with sample values
    Object.entries(sampleValues).forEach(([num, value]) => {
      preview = preview.replace(new RegExp(`\\{\\{${num}\\}\\}`, 'g'), value);
    });
    return preview;
  };

  const header = template.components.find(c => c.type === 'HEADER');
  const body = template.components.find(c => c.type === 'BODY');
  const footer = template.components.find(c => c.type === 'FOOTER');
  const buttons = template.components.find(c => c.type === 'BUTTONS');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {statusIcons[template.status]}
            Template Preview
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6">
          {/* Template Info */}
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground">Name</label>
              <p className="font-mono text-sm">{template.name}</p>
            </div>
            <div className="flex gap-4">
              <div>
                <label className="text-xs text-muted-foreground">Language</label>
                <p className="text-sm">{template.language}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Category</label>
                <Badge variant="outline">{template.category}</Badge>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Status</label>
                <Badge variant="outline">{template.status}</Badge>
              </div>
            </div>
            {template.meta_template_id && (
              <div>
                <label className="text-xs text-muted-foreground">Meta ID</label>
                <p className="font-mono text-xs">{template.meta_template_id}</p>
              </div>
            )}
            {template.rejection_reason && (
              <div className="p-3 bg-destructive/10 rounded-lg">
                <label className="text-xs text-destructive">Rejection Reason</label>
                <p className="text-sm text-destructive">{template.rejection_reason}</p>
              </div>
            )}
            {template.quality_score && (
              <div>
                <label className="text-xs text-muted-foreground">Quality Score</label>
                <p className="text-sm">{template.quality_score}</p>
              </div>
            )}
            <Separator />
            <Button variant="outline" size="sm" onClick={copyJson}>
              <Copy className="mr-2 h-4 w-4" />
              Copy JSON Payload
            </Button>
          </div>

          {/* WhatsApp Preview */}
          <div className="bg-[#e5ddd5] dark:bg-zinc-800 rounded-lg p-4">
            <div className="bg-white dark:bg-zinc-700 rounded-lg shadow-sm max-w-[280px] ml-auto">
              {/* Header */}
              {header?.text && (
                <div className="px-3 py-2 font-medium text-sm border-b">
                  {renderPreviewText(header.text)}
                </div>
              )}
              
              {/* Body */}
              {body?.text && (
                <div className="px-3 py-2 text-sm whitespace-pre-wrap">
                  {renderPreviewText(body.text)}
                </div>
              )}
              
              {/* Footer */}
              {footer?.text && (
                <div className="px-3 py-2 text-xs text-muted-foreground border-t">
                  {footer.text}
                </div>
              )}
              
              {/* Buttons */}
              {buttons?.buttons && buttons.buttons.length > 0 && (
                <div className="border-t">
                  {buttons.buttons.map((btn, i) => (
                    <div 
                      key={i} 
                      className="px-3 py-2 text-center text-sm text-blue-600 border-b last:border-b-0 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20"
                    >
                      {btn.text}
                    </div>
                  ))}
                </div>
              )}
              
              {/* Timestamp */}
              <div className="px-3 py-1 text-right">
                <span className="text-xs text-muted-foreground">12:34 PM</span>
              </div>
            </div>
          </div>
        </div>

        {/* Raw Components */}
        <div className="mt-4">
          <label className="text-xs text-muted-foreground mb-2 block">Components (JSON)</label>
          <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto max-h-40">
            {JSON.stringify(template.components, null, 2)}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  AlertCircle,
  Trash2,
  Copy,
  Eye,
} from 'lucide-react';

export interface MetaTemplateComponent {
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

export interface MetaWhatsAppTemplate {
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

const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  DRAFT: { 
    icon: <FileText size={14} />, 
    color: 'bg-muted text-muted-foreground border-muted-foreground/20', 
    label: 'Draft' 
  },
  PENDING: { 
    icon: <Clock size={14} className="animate-pulse" />, 
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-300', 
    label: 'Pending' 
  },
  APPROVED: { 
    icon: <CheckCircle2 size={14} />, 
    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-300', 
    label: 'Approved' 
  },
  REJECTED: { 
    icon: <XCircle size={14} />, 
    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-300', 
    label: 'Rejected' 
  },
  PAUSED: { 
    icon: <AlertCircle size={14} />, 
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-300', 
    label: 'Paused' 
  },
  DISABLED: { 
    icon: <XCircle size={14} />, 
    color: 'bg-muted text-muted-foreground border-muted-foreground/20', 
    label: 'Disabled' 
  },
};

const categoryConfig: Record<string, { color: string; label: string }> = {
  UTILITY: { color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', label: 'Utility' },
  MARKETING: { color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', label: 'Marketing' },
  AUTHENTICATION: { color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', label: 'Auth' },
};

interface MetaTemplateCardProps {
  template: MetaWhatsAppTemplate;
  isSelected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onPreview: (template: MetaWhatsAppTemplate) => void;
  onCopy: (template: MetaWhatsAppTemplate) => void;
  onDelete: (template: MetaWhatsAppTemplate) => void;
}

export function MetaTemplateCard({
  template,
  isSelected,
  onSelect,
  onPreview,
  onCopy,
  onDelete,
}: MetaTemplateCardProps) {
  const statusInfo = statusConfig[template.status] || statusConfig.DRAFT;
  const categoryInfo = categoryConfig[template.category] || categoryConfig.UTILITY;

  const getBodyText = (components: MetaTemplateComponent[]): string => {
    const body = components.find(c => c.type === 'BODY');
    return body?.text || '';
  };

  return (
    <Card className={`transition-all hover:shadow-md ${isSelected ? 'ring-2 ring-primary bg-primary/5' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <div className="pt-1">
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onSelect(template.id, checked === true)}
              aria-label={`Select ${template.name}`}
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded truncate max-w-[200px]">
                {template.name}
              </code>
              <Badge variant="outline" className={`${statusInfo.color} gap-1`}>
                {statusInfo.icon}
                {statusInfo.label}
              </Badge>
              <Badge variant="outline" className={categoryInfo.color}>
                {categoryInfo.label}
              </Badge>
              <span className="text-xs text-muted-foreground">{template.language}</span>
            </div>
            
            <p className="text-sm text-muted-foreground line-clamp-2">
              {getBodyText(template.components)}
            </p>
            
            {template.rejection_reason && (
              <div className="mt-2 p-2 bg-destructive/10 rounded-md">
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 flex-shrink-0" />
                  <span className="line-clamp-2">{template.rejection_reason}</span>
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onPreview(template)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Preview</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onCopy(template)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy JSON</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onDelete(template)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

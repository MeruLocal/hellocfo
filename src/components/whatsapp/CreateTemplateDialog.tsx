import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import {
  Loader2,
  Plus,
  X,
  MessageSquare,
  FileText,
  AlertTriangle,
  Clock,
  Users,
} from 'lucide-react';

interface CreateTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TemplateButton {
  id: string;
  title: string;
}

const categories = [
  { value: 'registration', label: 'Registration', icon: Users },
  { value: 'entity_selection', label: 'Entity Selection', icon: FileText },
  { value: 'accounting', label: 'Accounting', icon: MessageSquare },
  { value: 'error', label: 'Error Handling', icon: AlertTriangle },
  { value: 'reminder', label: 'Reminders', icon: Clock },
];

const whatsappCategories = [
  { value: 'UTILITY', label: 'Utility', description: 'Transactional messages (confirmations, updates)' },
  { value: 'MARKETING', label: 'Marketing', description: 'Promotional content (requires opt-in)' },
  { value: 'AUTHENTICATION', label: 'Authentication', description: 'OTPs and login codes' },
];

export function CreateTemplateDialog({ open, onOpenChange }: CreateTemplateDialogProps) {
  const queryClient = useQueryClient();
  
  // Form state
  const [name, setName] = useState('');
  const [templateKey, setTemplateKey] = useState('');
  const [category, setCategory] = useState('accounting');
  const [description, setDescription] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [isTemplate, setIsTemplate] = useState(true);
  const [whatsappCategory, setWhatsappCategory] = useState('UTILITY');
  const [buttons, setButtons] = useState<TemplateButton[]>([]);
  const [createInTwilio, setCreateInTwilio] = useState(false);
  const [submitForApproval, setSubmitForApproval] = useState(false);
  
  // Extract variables from message body
  const extractedVariables = React.useMemo(() => {
    const matches = messageBody.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map(m => m.replace(/[{}]/g, '')))];
  }, [messageBody]);
  
  // Auto-generate template key from name with txn_ prefix
  React.useEffect(() => {
    if (name && !templateKey) {
      const generated = 'txn_' + name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
      setTemplateKey(generated);
    }
  }, [name, templateKey]);
  
  // Reset form when dialog closes
  React.useEffect(() => {
    if (!open) {
      setName('');
      setTemplateKey('');
      setCategory('accounting');
      setDescription('');
      setMessageBody('');
      setIsTemplate(true);
      setWhatsappCategory('UTILITY');
      setButtons([]);
      setCreateInTwilio(false);
      setSubmitForApproval(false);
    }
  }, [open]);
  
  const addButton = () => {
    if (buttons.length < 3) {
      setButtons([...buttons, { id: `btn_${Date.now()}`, title: '' }]);
    }
  };
  
  const removeButton = (index: number) => {
    setButtons(buttons.filter((_, i) => i !== index));
  };
  
  const updateButton = (index: number, field: 'id' | 'title', value: string) => {
    const updated = [...buttons];
    updated[index] = { ...updated[index], [field]: value };
    setButtons(updated);
  };
  
  // Create template mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      // 1. Create in database
      const insertData = {
        name,
        template_key: templateKey,
        category,
        description: description || null,
        message_body: messageBody,
        variables: extractedVariables as unknown as Json,
        buttons: buttons.filter(b => b.title.trim()) as unknown as Json,
        is_template: isTemplate,
        is_active: true,
        whatsapp_category: whatsappCategory,
        country_codes: [] as string[],
        sort_order: 100,
      };
      
      const { data: template, error } = await supabase
        .from('whatsapp_templates')
        .insert(insertData)
        .select()
        .single();
      
      if (error) throw error;
      
      // 2. Optionally create in Twilio
      if (createInTwilio && isTemplate) {
        const { data: createResult, error: createError } = await supabase.functions.invoke(
          'twilio-content-api',
          {
            body: {
              action: 'create',
              templateId: template.id,
            },
          }
        );
        
        if (createError || !createResult?.success) {
          console.error('Failed to create in Twilio:', createError || createResult?.error);
          toast({
            title: 'Template created locally',
            description: `Failed to create in Twilio: ${createResult?.error || 'Unknown error'}`,
            variant: 'destructive',
          });
          return template;
        }
        
        // 3. Optionally submit for approval
        if (submitForApproval) {
          const { data: approvalResult, error: approvalError } = await supabase.functions.invoke(
            'twilio-content-api',
            {
              body: {
                action: 'submit-approval',
                templateId: template.id,
                whatsappCategory,
              },
            }
          );
          
          if (approvalError || !approvalResult?.success) {
            console.error('Failed to submit for approval:', approvalError || approvalResult?.error);
            toast({
              title: 'Created in Twilio',
              description: `Failed to submit for approval: ${approvalResult?.error || 'Unknown error'}`,
              variant: 'destructive',
            });
          }
        }
      }
      
      return template;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      toast({
        title: 'Template created successfully',
        description: createInTwilio && submitForApproval
          ? 'Template created and submitted for WhatsApp approval'
          : createInTwilio
          ? 'Template created in Twilio as draft'
          : 'Template saved to database',
      });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: 'Failed to create template',
        description: String(error),
        variant: 'destructive',
      });
    },
  });
  
  const isValid = name.trim() && templateKey.trim() && messageBody.trim();
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Template</DialogTitle>
          <DialogDescription>
            Create a new WhatsApp message template for automated responses
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">Basic Information</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Template Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Registration Prompt"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="templateKey">Template Key *</Label>
                <Input
                  id="templateKey"
                  value={templateKey}
                  onChange={(e) => setTemplateKey(e.target.value)}
                  placeholder="wa_registration_prompt"
                  className="font-mono text-sm"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        <div className="flex items-center gap-2">
                          <cat.icon size={14} />
                          {cat.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2 flex items-end">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="isTemplate"
                    checked={isTemplate}
                    onCheckedChange={(checked) => setIsTemplate(checked as boolean)}
                  />
                  <Label htmlFor="isTemplate" className="cursor-pointer">
                    WhatsApp Template (requires approval)
                  </Label>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Sent when a new user tries to register"
              />
            </div>
          </div>
          
          {/* Message Content */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">Message Content</h3>
            
            <div className="space-y-2">
              <Label htmlFor="messageBody">Message Body *</Label>
              <Textarea
                id="messageBody"
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                placeholder="👋 Hi! Your bill for {{vendor}} - {{amount}} has been recorded."
                className="min-h-[120px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Use {'{{variable}}'} syntax for dynamic content
              </p>
            </div>
            
            {extractedVariables.length > 0 && (
              <div className="space-y-2">
                <Label>Detected Variables</Label>
                <div className="flex flex-wrap gap-2">
                  {extractedVariables.map((v) => (
                    <Badge key={v} variant="outline">
                      {`{{${v}}}`}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Interactive Buttons */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm text-muted-foreground">
                Interactive Buttons (Optional)
              </h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addButton}
                disabled={buttons.length >= 3}
              >
                <Plus size={14} className="mr-1" />
                Add Button
              </Button>
            </div>
            
            {buttons.length > 0 && (
              <div className="space-y-2">
                {buttons.map((button, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={button.title}
                      onChange={(e) => updateButton(index, 'title', e.target.value)}
                      placeholder="Button Title (e.g., Confirm)"
                      className="flex-1"
                    />
                    <Input
                      value={button.id}
                      onChange={(e) => updateButton(index, 'id', e.target.value)}
                      placeholder="Button ID"
                      className="w-32 font-mono text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeButton(index)}
                    >
                      <X size={16} />
                    </Button>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Maximum 3 buttons. Button IDs are used for backend routing.
                </p>
              </div>
            )}
          </div>
          
          {/* Twilio Configuration */}
          {isTemplate && (
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <h3 className="font-medium text-sm">Twilio Configuration</h3>
              
              <div className="space-y-2">
                <Label>WhatsApp Category</Label>
                <Select value={whatsappCategory} onValueChange={setWhatsappCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {whatsappCategories.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        <div>
                          <div className="font-medium">{cat.label}</div>
                          <div className="text-xs text-muted-foreground">{cat.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="createInTwilio"
                    checked={createInTwilio}
                    onCheckedChange={(checked) => {
                      setCreateInTwilio(checked as boolean);
                      if (!checked) setSubmitForApproval(false);
                    }}
                  />
                  <Label htmlFor="createInTwilio" className="cursor-pointer">
                    Create in Twilio immediately
                  </Label>
                </div>
                
                {createInTwilio && (
                  <div className="flex items-center gap-2 ml-6">
                    <Checkbox
                      id="submitForApproval"
                      checked={submitForApproval}
                      onCheckedChange={(checked) => setSubmitForApproval(checked as boolean)}
                    />
                    <Label htmlFor="submitForApproval" className="cursor-pointer">
                      Submit for WhatsApp approval
                    </Label>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!isValid || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Template'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

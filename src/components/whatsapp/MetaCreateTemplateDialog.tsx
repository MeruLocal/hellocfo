import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';
import {
  Loader2,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Send,
  Save,
  Eye,
  Shield,
  AlertTriangle,
  Sparkles,
  XCircle,
  Info,
  Undo2,
  Wand2,
  Code,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  validateTemplateContent, 
  analyzeTemplateWithAI,
  checkRateLimit, 
  recordRateLimitAction,
  logTemplateAudit,
  type ValidationResult,
  type AIAnalysisResult
} from '@/hooks/useMetaCompliance';

// ============= Types =============

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

interface MetaTemplate {
  name: string;
  language: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  components: MetaTemplateComponent[];
}

interface ValidationError {
  rule: string;
  message: string;
}

interface MetaCreateTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTemplate?: MetaTemplate;
  onSuccess: () => void;
}

// ============= Component =============

export function MetaCreateTemplateDialog({ 
  open, 
  onOpenChange, 
  initialTemplate,
  onSuccess 
}: MetaCreateTemplateDialogProps) {
  const [mode, setMode] = useState<'builder' | 'json'>('builder');
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [complianceResult, setComplianceResult] = useState<ValidationResult | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
  const [isCheckingCompliance, setIsCheckingCompliance] = useState(false);
  const [isAnalyzingWithAI, setIsAnalyzingWithAI] = useState(false);
  
  // Form state
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('en_US');
  const [category, setCategory] = useState<'UTILITY' | 'MARKETING' | 'AUTHENTICATION'>('UTILITY');
  
  // Components
  const [headerType, setHeaderType] = useState<'NONE' | 'TEXT'>('NONE');
  const [headerText, setHeaderText] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [footerText, setFooterText] = useState('');
  const [buttons, setButtons] = useState<Array<{
    type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
    text: string;
    url?: string;
    phone_number?: string;
  }>>([]);
  
  // JSON mode
  const [jsonInput, setJsonInput] = useState('');
  
  // AI redraft state
  const [originalBodyText, setOriginalBodyText] = useState<string | null>(null);
  const [isRedrafting, setIsRedrafting] = useState(false);

  // Initialize from AI-generated template
  useEffect(() => {
    if (initialTemplate && open) {
      setName(initialTemplate.name || '');
      setLanguage(initialTemplate.language || 'en_US');
      setCategory(initialTemplate.category || 'UTILITY');
      
      const header = initialTemplate.components.find(c => c.type === 'HEADER');
      if (header?.text) {
        setHeaderType('TEXT');
        setHeaderText(header.text);
      } else {
        setHeaderType('NONE');
        setHeaderText('');
      }
      
      const body = initialTemplate.components.find(c => c.type === 'BODY');
      setBodyText(body?.text || '');
      
      const footer = initialTemplate.components.find(c => c.type === 'FOOTER');
      setFooterText(footer?.text || '');
      
      const buttonsComp = initialTemplate.components.find(c => c.type === 'BUTTONS');
      setButtons(buttonsComp?.buttons || []);
      
      setJsonInput(JSON.stringify(initialTemplate, null, 2));
    }
  }, [initialTemplate, open]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setName('');
      setLanguage('en_US');
      setCategory('UTILITY');
      setHeaderType('NONE');
      setHeaderText('');
      setBodyText('');
      setFooterText('');
      setButtons([]);
      setJsonInput('');
      setValidationErrors([]);
      setComplianceResult(null);
      setAiAnalysis(null);
    }
  }, [open]);

  // Run compliance check when body text changes
  useEffect(() => {
    const checkCompliance = async () => {
      if (!bodyText || bodyText.length < 5) {
        setComplianceResult(null);
        return;
      }
      
      setIsCheckingCompliance(true);
      try {
        const fullContent = [headerText, bodyText, footerText].filter(Boolean).join(' ');
        const result = await validateTemplateContent(fullContent, category);
        setComplianceResult(result);
      } catch (err) {
        console.error('Compliance check error:', err);
      } finally {
        setIsCheckingCompliance(false);
      }
    };

    const debounce = setTimeout(checkCompliance, 500);
    return () => clearTimeout(debounce);
  }, [bodyText, headerText, footerText, category]);

  // Build template from form
  const buildTemplate = (): MetaTemplate => {
    const components: MetaTemplateComponent[] = [];
    
    if (headerType === 'TEXT' && headerText) {
      components.push({ type: 'HEADER', format: 'TEXT', text: headerText });
    }
    
    components.push({ type: 'BODY', text: bodyText });
    
    if (footerText) {
      components.push({ type: 'FOOTER', text: footerText });
    }
    
    if (buttons.length > 0) {
      components.push({ type: 'BUTTONS', buttons });
    }
    
    return { name, language, category, components };
  };

  // Validate mutation
  const validateMutation = useMutation({
    mutationFn: async (template: MetaTemplate) => {
      const { data, error } = await supabase.functions.invoke('meta-template-api', {
        body: { action: 'validate', template },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setValidationErrors(data.errors || []);
      if (data.errors?.length === 0) {
        toast({ title: 'Validation passed', description: 'Template is Meta-compliant' });
      }
    },
  });

  // Save draft mutation
  const saveDraftMutation = useMutation({
    mutationFn: async (template: MetaTemplate) => {
      const { data, error } = await supabase.functions.invoke('meta-template-api', {
        body: { action: 'save-draft', template },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Save failed');
      return data;
    },
    onSuccess: () => {
      toast({ title: 'Draft saved' });
      onSuccess();
    },
    onError: (error) => {
      toast({ title: 'Save failed', description: String(error), variant: 'destructive' });
    },
  });

  // Submit to Meta mutation
  const submitMutation = useMutation({
    mutationFn: async (template: MetaTemplate) => {
      const { data, error } = await supabase.functions.invoke('meta-template-api', {
        body: { action: 'create', template },
      });
      if (error) throw error;
      if (!data?.success) {
        if (data?.validationErrors) {
          setValidationErrors(data.validationErrors);
        }
        throw new Error(data?.error?.message || 'Submit failed');
      }
      return data;
    },
    onSuccess: (data) => {
      toast({ 
        title: 'Submitted to Meta', 
        description: `Template "${data.template?.name}" is now pending approval` 
      });
      onSuccess();
    },
    onError: (error) => {
      toast({ title: 'Submit failed', description: String(error), variant: 'destructive' });
    },
  });

  const handleValidate = () => {
    const template = mode === 'json' ? JSON.parse(jsonInput) : buildTemplate();
    validateMutation.mutate(template);
  };

  const handleSaveDraft = () => {
    const template = mode === 'json' ? JSON.parse(jsonInput) : buildTemplate();
    saveDraftMutation.mutate(template);
  };

  const handleSubmit = async () => {
    try {
      // Check rate limits first
      const rateLimit = await checkRateLimit('template_submission');
      if (!rateLimit.allowed) {
        toast({ 
          title: 'Rate limit exceeded', 
          description: rateLimit.reason, 
          variant: 'destructive' 
        });
        return;
      }

      // Check compliance
      const template = mode === 'json' ? JSON.parse(jsonInput) : buildTemplate();
      const bodyContent = template.components.find((c: MetaTemplateComponent) => c.type === 'BODY')?.text || '';
      const complianceCheck = await validateTemplateContent(bodyContent, template.category);
      
      if (!complianceCheck.isValid) {
        toast({ 
          title: 'Content blocked', 
          description: complianceCheck.errors[0] || 'Template contains prohibited content',
          variant: 'destructive' 
        });
        setComplianceResult(complianceCheck);
        return;
      }

      if (complianceCheck.score < 50) {
        toast({ 
          title: 'Low quality score', 
          description: 'Template may be rejected. Consider addressing warnings.',
          variant: 'destructive' 
        });
        return;
      }

      // Run AI analysis before submission
      setIsAnalyzingWithAI(true);
      const fullContent = [headerText, bodyContent, footerText].filter(Boolean).join(' ');
      const aiResult = await analyzeTemplateWithAI(fullContent, template.category, template.name);
      setIsAnalyzingWithAI(false);
      
      if (aiResult) {
        setAiAnalysis(aiResult);
        
        // Block harmful content
        if (aiResult.isHarmful) {
          toast({ 
            title: 'Harmful content detected', 
            description: 'This template contains content that violates Meta policies.',
            variant: 'destructive' 
          });
          return;
        }
        
        // Block unprofessional content
        if (!aiResult.isProfessional) {
          toast({ 
            title: 'Unprofessional content', 
            description: 'This template needs to be more professional for business use.',
            variant: 'destructive' 
          });
          return;
        }
        
        // Block low AI score
        if (aiResult.overallScore < 60) {
          toast({ 
            title: 'Quality too low', 
            description: `AI Score: ${aiResult.overallScore}/100. Please address the issues before submitting.`,
            variant: 'destructive' 
          });
          return;
        }
      }

      // Record rate limit action
      await recordRateLimitAction('template_submission');

      // Log audit
      await logTemplateAudit(template.name, 'submitted', complianceCheck);

      // Submit
      submitMutation.mutate(template);
    } catch (err) {
      setIsAnalyzingWithAI(false);
      toast({ title: 'Validation error', description: String(err), variant: 'destructive' });
    }
  };

  const addButton = (type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER') => {
    if (buttons.length >= 3) {
      toast({ title: 'Maximum buttons reached', variant: 'destructive' });
      return;
    }
    setButtons([...buttons, { type, text: '' }]);
  };

  const updateButton = (index: number, updates: Partial<typeof buttons[0]>) => {
    const newButtons = [...buttons];
    newButtons[index] = { ...newButtons[index], ...updates };
    setButtons(newButtons);
  };

  const removeButton = (index: number) => {
    setButtons(buttons.filter((_, i) => i !== index));
  };

  const isLoading = validateMutation.isPending || saveDraftMutation.isPending || submitMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Meta Template</DialogTitle>
          <DialogDescription>
            Build a Meta-compliant WhatsApp message template
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as 'builder' | 'json')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="builder">
              <Eye className="mr-2 h-4 w-4" />
              Builder
            </TabsTrigger>
            <TabsTrigger value="json">
              <Code className="mr-2 h-4 w-4" />
              JSON
            </TabsTrigger>
          </TabsList>

          <TabsContent value="builder" className="space-y-4 mt-4">
            {/* Basic Info */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Template Name</Label>
                <Input
                  id="name"
                  placeholder="order_confirmation_v1"
                  value={name}
                  onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                />
                <p className="text-xs text-muted-foreground">Lowercase, underscores only</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="!bg-popover z-[999]">
                    <SelectItem value="en_US">English (US)</SelectItem>
                    <SelectItem value="en_GB">English (UK)</SelectItem>
                    <SelectItem value="hi">Hindi</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="pt_BR">Portuguese (BR)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="!bg-popover z-[999]">
                    <SelectItem value="UTILITY">Utility</SelectItem>
                    <SelectItem value="MARKETING">Marketing</SelectItem>
                    <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Header */}
            <div className="space-y-2">
              <Label>Header (Optional)</Label>
              <div className="flex gap-2">
                <Select value={headerType} onValueChange={(v) => setHeaderType(v as typeof headerType)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="!bg-popover z-[999]">
                    <SelectItem value="NONE">None</SelectItem>
                    <SelectItem value="TEXT">Text</SelectItem>
                  </SelectContent>
                </Select>
                {headerType === 'TEXT' && (
                  <Input
                    placeholder="Header text (max 60 chars)"
                    value={headerText}
                    onChange={(e) => setHeaderText(e.target.value)}
                    maxLength={60}
                    className="flex-1"
                  />
                )}
              </div>
            </div>

            {/* Body */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="body">Body (Required)</Label>
                <div className="flex items-center gap-1">
                  {originalBodyText !== null && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              setBodyText(originalBodyText);
                              setOriginalBodyText(null);
                              toast({ title: 'Reverted to original content' });
                            }}
                          >
                            <Undo2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Revert to original</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-primary hover:text-primary/80"
                          disabled={!bodyText || bodyText.length < 10 || isRedrafting}
                          onClick={async () => {
                            if (!bodyText || bodyText.length < 10) {
                              toast({ 
                                title: 'Content too short', 
                                description: 'Enter at least 10 characters to redraft',
                                variant: 'destructive' 
                              });
                              return;
                            }
                            
                            setIsRedrafting(true);
                            // Save original if not already saved
                            if (originalBodyText === null) {
                              setOriginalBodyText(bodyText);
                            }
                            
                            try {
                              const { data, error } = await supabase.functions.invoke('analyze-template-content', {
                                body: { 
                                  content: bodyText,
                                  category,
                                  action: 'redraft'
                                }
                              });
                              
                              if (error) throw error;
                              
                              if (data?.redraftedContent) {
                                setBodyText(data.redraftedContent);
                                toast({ 
                                  title: 'Content redrafted', 
                                  description: 'AI has improved your template. Click undo to revert.' 
                                });
                              } else {
                                toast({ 
                                  title: 'Redraft failed', 
                                  description: 'Could not generate improved content',
                                  variant: 'destructive' 
                                });
                              }
                            } catch (err) {
                              console.error('Redraft error:', err);
                              toast({ 
                                title: 'Redraft failed', 
                                description: String(err),
                                variant: 'destructive' 
                              });
                            } finally {
                              setIsRedrafting(false);
                            }
                          }}
                        >
                          {isRedrafting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Wand2 className="h-4 w-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Redraft with AI</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
              <Textarea
                id="body"
                placeholder="Hi {{1}} , your order {{2}} has been confirmed for {{3}} ."
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                className="min-h-[120px]"
                maxLength={1024}
              />
              <p className="text-xs text-muted-foreground">
                Use {"{{1}}"}, {"{{2}}"}, etc. for variables. Max 1024 chars. ({bodyText.length}/1024)
              </p>
              
              {/* Compliance Score Indicator */}
              {complianceResult && (
                <div className="mt-3 p-3 rounded-lg border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Compliance Score
                    </span>
                    <Badge variant={
                      complianceResult.score >= 80 ? 'default' :
                      complianceResult.score >= 50 ? 'secondary' : 'destructive'
                    }>
                      {complianceResult.score}/100
                    </Badge>
                  </div>
                  <Progress value={complianceResult.score} className="h-2" />
                  
                  {complianceResult.errors.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {complianceResult.errors.map((err, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-destructive">
                          <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          {err}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {complianceResult.warnings.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {complianceResult.warnings.map((warn, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          {warn}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              {isCheckingCompliance && (
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Checking compliance...
                </div>
              )}

              {/* AI Analysis Results */}
              {aiAnalysis && (
                <div className="mt-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      AI Content Analysis
                    </span>
                    <div className="flex items-center gap-2">
                      {aiAnalysis.isProfessional ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
                          Professional
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          Unprofessional
                        </Badge>
                      )}
                      {aiAnalysis.isHarmful && (
                        <Badge variant="destructive">
                          Harmful
                        </Badge>
                      )}
                      <Badge variant={
                        aiAnalysis.overallScore >= 80 ? 'default' :
                        aiAnalysis.overallScore >= 60 ? 'secondary' : 'destructive'
                      }>
                        {aiAnalysis.overallScore}/100
                      </Badge>
                    </div>
                  </div>
                  
                  {aiAnalysis.issues.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {aiAnalysis.issues.map((issue, i) => (
                        <div key={i} className={`flex items-start gap-2 text-xs ${
                          issue.severity === 'error' ? 'text-destructive' :
                          issue.severity === 'warning' ? 'text-amber-600 dark:text-amber-400' :
                          'text-muted-foreground'
                        }`}>
                          {issue.severity === 'error' ? (
                            <XCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          ) : issue.severity === 'warning' ? (
                            <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          ) : (
                            <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          )}
                          <span><strong>{issue.type}:</strong> {issue.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {aiAnalysis.suggestions.length > 0 && (
                    <div className="mt-2 pt-2 border-t">
                      <p className="text-xs font-medium mb-1">Suggestions:</p>
                      <ul className="text-xs text-muted-foreground space-y-0.5">
                        {aiAnalysis.suggestions.map((suggestion, i) => (
                          <li key={i} className="flex items-start gap-1">
                            <span className="text-primary">•</span>
                            {suggestion}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              
              {isAnalyzingWithAI && (
                <div className="mt-2 flex items-center gap-2 text-xs text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  AI analyzing content for professionalism and harmful content...
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="space-y-2">
              <Label htmlFor="footer">Footer (Optional)</Label>
              <Input
                id="footer"
                placeholder="Reply STOP to unsubscribe"
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                maxLength={60}
              />
              <p className="text-xs text-muted-foreground">No variables allowed. Max 60 chars.</p>
            </div>

            {/* Buttons */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Buttons (Optional)</Label>
                <div className="flex gap-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => addButton('QUICK_REPLY')}
                    disabled={buttons.length >= 3}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Quick Reply
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => addButton('URL')}
                    disabled={buttons.filter(b => b.type !== 'QUICK_REPLY').length >= 2}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    URL
                  </Button>
                </div>
              </div>
              
              {buttons.map((button, index) => (
                <div key={index} className="flex gap-2 items-start p-3 border rounded-lg">
                  <Badge variant="outline">{button.type}</Badge>
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="Button text (max 20 chars)"
                      value={button.text}
                      onChange={(e) => updateButton(index, { text: e.target.value })}
                      maxLength={20}
                    />
                    {button.type === 'URL' && (
                      <Input
                        placeholder="https://example.com/path"
                        value={button.url || ''}
                        onChange={(e) => updateButton(index, { url: e.target.value })}
                      />
                    )}
                    {button.type === 'PHONE_NUMBER' && (
                      <Input
                        placeholder="+1234567890"
                        value={button.phone_number || ''}
                        onChange={(e) => updateButton(index, { phone_number: e.target.value })}
                      />
                    )}
                  </div>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="icon"
                    onClick={() => removeButton(index)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="json" className="mt-4">
            <div className="space-y-2">
              <Label>Template JSON</Label>
              <Textarea
                placeholder='{"name": "...", "language": "en_US", "category": "UTILITY", "components": [...]}'
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                className="min-h-[300px] font-mono text-sm"
              />
            </div>
          </TabsContent>
        </Tabs>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg space-y-1">
            <p className="text-sm font-medium text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Validation Errors
            </p>
            {validationErrors.map((error, i) => (
              <p key={i} className="text-sm text-destructive pl-6">
                • {error.message}
              </p>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleValidate} disabled={isLoading}>
            {validateMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Validate
          </Button>
          <Button variant="secondary" onClick={handleSaveDraft} disabled={isLoading}>
            {saveDraftMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Draft
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {submitMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Submit to Meta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

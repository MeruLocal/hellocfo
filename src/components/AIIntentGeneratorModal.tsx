import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Wand2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { Module, Intent, LLMConfig, BusinessContext } from '@/hooks/useCFOData';
import type { MCPTool } from '@/hooks/useMCPTools';

interface AIIntentGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  modules: Module[];
  existingIntents: Intent[];
  llmConfig: LLMConfig | null;
  businessContext: BusinessContext | null;
  mcpTools: MCPTool[];
  onIntentsGenerated: () => void;
}

export function AIIntentGeneratorModal({
  isOpen,
  onClose,
  modules,
  existingIntents,
  llmConfig,
  businessContext,
  mcpTools,
  onIntentsGenerated,
}: AIIntentGeneratorModalProps) {
  const [selectedModuleId, setSelectedModuleId] = useState<string>('');
  const [selectedSubModuleId, setSelectedSubModuleId] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ step: '', count: 0 });

  const selectedModule = useMemo(
    () => modules.find((m) => m.id === selectedModuleId),
    [modules, selectedModuleId]
  );

  const subModules = useMemo(
    () => selectedModule?.subModules || [],
    [selectedModule]
  );

  const selectedSubModule = useMemo(
    () => subModules.find((s) => s.id === selectedSubModuleId),
    [subModules, selectedSubModuleId]
  );

  // Get existing intent names for the selected module/submodule to avoid duplicates
  const existingIntentNames = useMemo(() => {
    return existingIntents
      .filter(
        (i) =>
          i.moduleId === selectedModuleId && i.subModuleId === selectedSubModuleId
      )
      .map((i) => i.name);
  }, [existingIntents, selectedModuleId, selectedSubModuleId]);

  // Also get all intent names for global duplicate check
  const allExistingIntentNames = useMemo(() => {
    return existingIntents.map((i) => i.name);
  }, [existingIntents]);

  const handleModuleChange = (moduleId: string) => {
    setSelectedModuleId(moduleId);
    setSelectedSubModuleId('');
  };

  const handleGenerate = async () => {
    if (!selectedModuleId || !selectedSubModuleId) {
      toast({
        title: 'Selection Required',
        description: 'Please select both a module and sub-module.',
        variant: 'destructive',
      });
      return;
    }

    if (!llmConfig?.apiKey) {
      toast({
        title: 'LLM Configuration Required',
        description: 'Please configure your API key in LLM Settings first.',
        variant: 'destructive',
      });
      return;
    }

    if (llmConfig.provider === 'azure-anthropic' && !llmConfig.endpoint) {
      toast({
        title: 'LLM Configuration Required',
        description: 'Please configure your API endpoint for Azure Anthropic.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    setProgress({ step: 'Generating 15 unique intents with AI...', count: 0 });

    try {
      const { data, error } = await supabase.functions.invoke('generate-batch-intents', {
        body: {
          moduleId: selectedModuleId,
          moduleName: selectedModule?.name || selectedModuleId,
          subModuleId: selectedSubModuleId,
          subModuleName: selectedSubModule?.name || selectedSubModuleId,
          intentCount: 15,
          existingIntentNames: allExistingIntentNames,
          mcpTools: mcpTools.map((tool) => ({
            name: tool.id,
            description: tool.description,
            inputSchema: {
              properties: tool.parameters.reduce((acc, p) => {
                acc[p.name] = { type: p.type };
                return acc;
              }, {} as Record<string, { type: string }>),
              required: tool.parameters.filter((p) => p.required).map((p) => p.name),
            },
          })),
          businessContext: businessContext
            ? {
                industry: businessContext.industry,
                country: businessContext.country,
                currency: businessContext.currency,
                entitySize: businessContext.entitySize,
              }
            : undefined,
          llmConfig: {
            provider: llmConfig.provider,
            endpoint: llmConfig.endpoint,
            model: llmConfig.model,
            apiKey: llmConfig.apiKey,
            temperature: llmConfig.temperature,
            maxTokens: llmConfig.maxTokens,
          },
        },
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Failed to generate intents');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (!data?.intents || !Array.isArray(data.intents)) {
        throw new Error('Invalid response from AI');
      }

      setProgress({ step: 'Saving intents to database...', count: data.intents.length });

      // Save all intents to the database
      let savedCount = 0;
      for (const intent of data.intents) {
        try {
          const { error: insertError } = await supabase.from('intents').insert({
            name: intent.name,
            description: intent.description,
            module_id: intent.moduleId,
            sub_module_id: intent.subModuleId,
            training_phrases: intent.trainingPhrases,
            entities: intent.entities,
            resolution_flow: intent.resolutionFlow,
            is_active: true,
            generated_by: 'ai',
            ai_confidence: intent.aiConfidence || 0.9,
            last_generated_at: new Date().toISOString(),
          });

          if (insertError) {
            console.error('Failed to save intent:', intent.name, insertError);
          } else {
            savedCount++;
            setProgress({ step: `Saved ${savedCount} of ${data.intents.length} intents...`, count: savedCount });
          }
        } catch (err) {
          console.error('Error saving intent:', intent.name, err);
        }
      }

      toast({
        title: 'Intents Generated Successfully',
        description: `Created ${savedCount} new intents for ${selectedModule?.name} / ${selectedSubModule?.name}`,
      });

      onIntentsGenerated();
      onClose();
    } catch (error) {
      console.error('Generation error:', error);
      toast({
        title: 'Generation Failed',
        description: error instanceof Error ? error.message : 'Failed to generate intents',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
      setProgress({ step: '', count: 0 });
    }
  };

  const handleClose = () => {
    if (!isGenerating) {
      setSelectedModuleId('');
      setSelectedSubModuleId('');
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-purple-600" />
            Generate Intents with AI
          </DialogTitle>
          <DialogDescription>
            Select a module and sub-module to automatically generate 15 unique intents with full configurations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Module Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Module</label>
            <Select
              value={selectedModuleId}
              onValueChange={handleModuleChange}
              disabled={isGenerating}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a module" />
              </SelectTrigger>
              <SelectContent>
                {modules.map((module) => (
                  <SelectItem key={module.id} value={module.id}>
                    <span className="flex items-center gap-2">
                      <span>{module.icon}</span>
                      <span>{module.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sub-Module Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Sub-Module</label>
            <Select
              value={selectedSubModuleId}
              onValueChange={setSelectedSubModuleId}
              disabled={isGenerating || !selectedModuleId || subModules.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={
                  !selectedModuleId 
                    ? "Select a module first" 
                    : subModules.length === 0 
                      ? "No sub-modules available" 
                      : "Select a sub-module"
                } />
              </SelectTrigger>
              <SelectContent>
                {subModules.map((subModule) => (
                  <SelectItem key={subModule.id} value={subModule.id}>
                    {subModule.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Existing Intents Warning */}
          {existingIntentNames.length > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-amber-700">
                <p className="font-medium">
                  {existingIntentNames.length} intent{existingIntentNames.length > 1 ? 's' : ''} already exist
                </p>
                <p className="text-amber-600">
                  AI will generate unique intents that don't duplicate existing ones.
                </p>
              </div>
            </div>
          )}

          {/* Generation Info */}
          <div className="flex items-start gap-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <CheckCircle2 className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-purple-700">
              <p className="font-medium">What will be generated:</p>
              <ul className="list-disc list-inside text-purple-600 mt-1 space-y-0.5">
                <li>15 unique intent names with descriptions</li>
                <li>8-10 training phrases per intent</li>
                <li>Entity extraction configurations</li>
                <li>Data pipeline with MCP tools</li>
                <li>Enrichment functions</li>
                <li>Response templates</li>
              </ul>
            </div>
          </div>

          {/* Progress */}
          {isGenerating && progress.step && (
            <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <span className="text-sm text-blue-700">{progress.step}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isGenerating}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !selectedModuleId || !selectedSubModuleId}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-4 w-4" />
                Generate 15 Intents
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

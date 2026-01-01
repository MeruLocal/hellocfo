import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

// Types matching the database schema
export interface SubModule {
  id: string;
  name: string;
}

export interface Module {
  id: string;
  name: string;
  icon: string;
  color: string;
  subModules: SubModule[];
}

export interface CountryConfig {
  code: string;
  name: string;
  flag: string;
  currency: string;
  currencySymbol: string;
  sizeThresholds: {
    micro: { max: number };
    small: { min: number; max: number };
    medium: { min: number; max: number };
    large: { min: number };
  };
  displayThresholds: {
    micro: string;
    small: string;
    medium: string;
    large: string;
  };
}

export interface EntityType {
  id: string;
  name: string;
  description: string;
}

export interface EnrichmentType {
  id: string;
  name: string;
  icon: string;
  description: string;
  configFields: string[];
}

export interface LLMProvider {
  id: string;
  name: string;
  icon: string;
  models: string[];
}

export interface ResponseType {
  id: string;
  name: string;
  description: string;
}

export interface Entity {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: string;
  prompt?: string;
  enumValues?: string[];
}

export interface PipelineParameter {
  name: string;
  value: string;
  source: 'static' | 'entity' | 'context' | 'previous_node';
}

export interface PipelineNode {
  nodeId: string;
  nodeType: 'api_call' | 'computation' | 'conditional';
  sequence: number;
  mcpTool?: string;
  parameters: PipelineParameter[];
  formula?: string;
  condition?: string;
  outputVariable: string;
  description: string;
}

export interface Enrichment {
  id: string;
  type: string;
  config: Record<string, any>;
  description: string;
}

export interface ResponseConfig {
  type: string;
  template: string;
  followUpQuestions: string[];
}

export interface ResolutionFlow {
  dataPipeline: PipelineNode[];
  enrichments: Enrichment[];
  responseConfig: ResponseConfig;
}

export interface Intent {
  id: string;
  name: string;
  moduleId: string;
  subModuleId?: string;
  description?: string;
  isActive: boolean;
  trainingPhrases: string[];
  entities: Entity[];
  resolutionFlow?: ResolutionFlow;
  generatedBy: 'ai' | 'manual' | 'pending';
  aiConfidence?: number;
  createdAt: string;
  updatedAt: string;
  lastGeneratedAt?: string;
}

export interface BusinessContext {
  id?: string;
  country: string;
  industry: string;
  subIndustry?: string;
  entitySize: string;
  annualRevenue?: number;
  employeeCount?: number;
  fiscalYearEnd: string;
  currency: string;
  complianceFrameworks: string[];
}

export interface LLMConfig {
  id?: string;
  provider: string;
  model: string;
  apiKey: string;
  endpoint: string;
  temperature: number;
  maxTokens: number;
  systemPromptOverride: string;
}

// Hook for fetching modules
export function useModules() {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchModules = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('modules')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (error) throw error;

      const mapped: Module[] = (data || []).map(m => ({
        id: m.id,
        name: m.name,
        icon: m.icon,
        color: m.color,
        subModules: (m.sub_modules as unknown as SubModule[]) || []
      }));

      setModules(mapped);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch modules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  return { modules, loading, error, refetch: fetchModules };
}

// Hook for fetching country configs
export function useCountryConfigs() {
  const [countryConfigs, setCountryConfigs] = useState<CountryConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data, error } = await supabase
        .from('country_configs')
        .select('*')
        .eq('is_active', true);

      if (!error && data) {
        setCountryConfigs(data.map(c => ({
          code: c.code,
          name: c.name,
          flag: c.flag,
          currency: c.currency,
          currencySymbol: c.currency_symbol,
          sizeThresholds: c.size_thresholds as CountryConfig['sizeThresholds'],
          displayThresholds: c.display_thresholds as CountryConfig['displayThresholds']
        })));
      }
      setLoading(false);
    }
    fetch();
  }, []);

  return { countryConfigs, loading };
}

// Hook for fetching entity types
export function useEntityTypes() {
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data, error } = await supabase
        .from('entity_types')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (!error && data) {
        setEntityTypes(data.map(e => ({
          id: e.id,
          name: e.name,
          description: e.description || ''
        })));
      }
      setLoading(false);
    }
    fetch();
  }, []);

  return { entityTypes, loading };
}

// Hook for fetching enrichment types
export function useEnrichmentTypes() {
  const [enrichmentTypes, setEnrichmentTypes] = useState<EnrichmentType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data, error } = await supabase
        .from('enrichment_types')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (!error && data) {
        setEnrichmentTypes(data.map(e => ({
          id: e.id,
          name: e.name,
          icon: e.icon,
          description: e.description || '',
          configFields: (e.config_fields as string[]) || []
        })));
      }
      setLoading(false);
    }
    fetch();
  }, []);

  return { enrichmentTypes, loading };
}

// Hook for fetching LLM providers
export function useLLMProviders() {
  const [llmProviders, setLLMProviders] = useState<LLMProvider[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data, error } = await supabase
        .from('llm_providers')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (!error && data) {
        setLLMProviders(data.map(p => ({
          id: p.id,
          name: p.name,
          icon: p.icon,
          models: (p.models as string[]) || []
        })));
      }
      setLoading(false);
    }
    fetch();
  }, []);

  return { llmProviders, loading };
}

// Hook for fetching response types
export function useResponseTypes() {
  const [responseTypes, setResponseTypes] = useState<ResponseType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data, error } = await supabase
        .from('response_types')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (!error && data) {
        setResponseTypes(data.map(r => ({
          id: r.id,
          name: r.name,
          description: r.description || ''
        })));
      }
      setLoading(false);
    }
    fetch();
  }, []);

  return { responseTypes, loading };
}

// Hook for managing intents (CRUD)
export function useIntents() {
  const [intents, setIntents] = useState<Intent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIntents = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('intents')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mapped: Intent[] = (data || []).map(i => ({
        id: i.id,
        name: i.name,
        moduleId: i.module_id,
        subModuleId: i.sub_module_id,
        description: i.description || undefined,
        isActive: i.is_active,
        trainingPhrases: (i.training_phrases as unknown as string[]) || [],
        entities: (i.entities as unknown as Entity[]) || [],
        resolutionFlow: i.resolution_flow as unknown as ResolutionFlow | undefined,
        generatedBy: i.generated_by as Intent['generatedBy'],
        aiConfidence: i.ai_confidence ? Number(i.ai_confidence) : undefined,
        createdAt: i.created_at,
        updatedAt: i.updated_at,
        lastGeneratedAt: i.last_generated_at || undefined
      }));

      setIntents(mapped);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch intents');
    } finally {
      setLoading(false);
    }
  }, []);

  const createIntent = useCallback(async (intent: Omit<Intent, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const { data, error } = await supabase
        .from('intents')
        .insert([{
          name: intent.name,
          module_id: intent.moduleId,
          sub_module_id: intent.subModuleId || '',
          description: intent.description,
          is_active: intent.isActive,
          training_phrases: intent.trainingPhrases as unknown as any,
          entities: intent.entities as unknown as any,
          resolution_flow: intent.resolutionFlow as unknown as any,
          generated_by: intent.generatedBy,
          ai_confidence: intent.aiConfidence,
          last_generated_at: intent.lastGeneratedAt
        }])
        .select()
        .single();

      if (error) throw error;

      await fetchIntents();
      toast({ title: 'Intent created successfully' });
      return data;
    } catch (err) {
      toast({ title: 'Failed to create intent', variant: 'destructive' });
      throw err;
    }
  }, [fetchIntents]);

  const updateIntent = useCallback(async (id: string, updates: Partial<Intent>) => {
    try {
      const dbUpdates: Record<string, any> = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.moduleId !== undefined) dbUpdates.module_id = updates.moduleId;
      if (updates.subModuleId !== undefined) dbUpdates.sub_module_id = updates.subModuleId;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
      if (updates.trainingPhrases !== undefined) dbUpdates.training_phrases = updates.trainingPhrases;
      if (updates.entities !== undefined) dbUpdates.entities = updates.entities;
      if (updates.resolutionFlow !== undefined) dbUpdates.resolution_flow = updates.resolutionFlow;
      if (updates.generatedBy !== undefined) dbUpdates.generated_by = updates.generatedBy;
      if (updates.aiConfidence !== undefined) dbUpdates.ai_confidence = updates.aiConfidence;
      if (updates.lastGeneratedAt !== undefined) dbUpdates.last_generated_at = updates.lastGeneratedAt;

      const { error } = await supabase
        .from('intents')
        .update(dbUpdates)
        .eq('id', id);

      if (error) throw error;

      await fetchIntents();
      return true;
    } catch (err) {
      toast({ title: 'Failed to update intent', variant: 'destructive' });
      throw err;
    }
  }, [fetchIntents]);

  const deleteIntent = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('intents')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchIntents();
      toast({ title: 'Intent deleted' });
      return true;
    } catch (err) {
      toast({ title: 'Failed to delete intent', variant: 'destructive' });
      throw err;
    }
  }, [fetchIntents]);

  useEffect(() => {
    fetchIntents();
  }, [fetchIntents]);

  return { intents, loading, error, fetchIntents, createIntent, updateIntent, deleteIntent };
}

// Hook for business context
export function useBusinessContext() {
  const [businessContext, setBusinessContext] = useState<BusinessContext | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchContext = useCallback(async () => {
    const { data, error } = await supabase
      .from('business_contexts')
      .select('*')
      .eq('is_default', true)
      .maybeSingle();

    if (!error && data) {
      setBusinessContext({
        id: data.id,
        country: data.country,
        industry: data.industry,
        subIndustry: data.sub_industry || undefined,
        entitySize: data.entity_size,
        annualRevenue: data.annual_revenue ? Number(data.annual_revenue) : undefined,
        employeeCount: data.employee_count || undefined,
        fiscalYearEnd: data.fiscal_year_end,
        currency: data.currency,
        complianceFrameworks: (data.compliance_frameworks as string[]) || []
      });
    }
    setLoading(false);
  }, []);

  const updateContext = useCallback(async (updates: Partial<BusinessContext>) => {
    if (!businessContext?.id) return;

    const dbUpdates: Record<string, any> = {};
    if (updates.country !== undefined) dbUpdates.country = updates.country;
    if (updates.industry !== undefined) dbUpdates.industry = updates.industry;
    if (updates.subIndustry !== undefined) dbUpdates.sub_industry = updates.subIndustry;
    if (updates.entitySize !== undefined) dbUpdates.entity_size = updates.entitySize;
    if (updates.annualRevenue !== undefined) dbUpdates.annual_revenue = updates.annualRevenue;
    if (updates.employeeCount !== undefined) dbUpdates.employee_count = updates.employeeCount;
    if (updates.fiscalYearEnd !== undefined) dbUpdates.fiscal_year_end = updates.fiscalYearEnd;
    if (updates.currency !== undefined) dbUpdates.currency = updates.currency;
    if (updates.complianceFrameworks !== undefined) dbUpdates.compliance_frameworks = updates.complianceFrameworks;

    const { error } = await supabase
      .from('business_contexts')
      .update(dbUpdates)
      .eq('id', businessContext.id);

    if (!error) {
      setBusinessContext(prev => prev ? { ...prev, ...updates } : prev);
    }
  }, [businessContext?.id]);

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  return { businessContext, loading, updateContext, refetch: fetchContext };
}

// Hook for LLM config
export function useLLMConfig() {
  const [llmConfig, setLLMConfig] = useState<LLMConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    const { data, error } = await supabase
      .from('llm_configs')
      .select('*')
      .eq('is_default', true)
      .maybeSingle();

    if (!error && data) {
      setLLMConfig({
        id: data.id,
        provider: data.provider,
        model: data.model,
        apiKey: data.api_key || '',
        endpoint: data.endpoint || '',
        temperature: Number(data.temperature),
        maxTokens: data.max_tokens,
        systemPromptOverride: data.system_prompt_override || ''
      });
    }
    setLoading(false);
  }, []);

  const updateConfig = useCallback(async (updates: Partial<LLMConfig>) => {
    if (!llmConfig?.id) return;

    const dbUpdates: Record<string, any> = {};
    if (updates.provider !== undefined) dbUpdates.provider = updates.provider;
    if (updates.model !== undefined) dbUpdates.model = updates.model;
    if (updates.apiKey !== undefined) dbUpdates.api_key = updates.apiKey;
    if (updates.endpoint !== undefined) dbUpdates.endpoint = updates.endpoint;
    if (updates.temperature !== undefined) dbUpdates.temperature = updates.temperature;
    if (updates.maxTokens !== undefined) dbUpdates.max_tokens = updates.maxTokens;
    if (updates.systemPromptOverride !== undefined) dbUpdates.system_prompt_override = updates.systemPromptOverride;

    const { error } = await supabase
      .from('llm_configs')
      .update(dbUpdates)
      .eq('id', llmConfig.id);

    if (!error) {
      setLLMConfig(prev => prev ? { ...prev, ...updates } : prev);
    }
  }, [llmConfig?.id]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return { llmConfig, loading, updateConfig, refetch: fetchConfig };
}

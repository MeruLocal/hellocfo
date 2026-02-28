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
  isActive?: boolean;
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
  isActive?: boolean;
  sortOrder?: number;
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

export interface AISuggestion {
  summary: string;
  personaRelevance: Record<string, number>;
  gaps: { toolName: string; description: string; fallbackSuggestion?: string }[];
  suggestedAt: string;
  steps?: any[];
}

export interface ResolutionFlow {
  dataPipeline: PipelineNode[];
  enrichments: Enrichment[];
  responseConfig: ResponseConfig;
  aiSuggestion?: AISuggestion;
}

export interface Intent {
  id: string;
  name: string;
  moduleId: string;
  subModuleId: string;
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
  totalTokensUsed?: number;
  generationCount?: number;
  lastGenerationTokens?: number;
}

export interface BusinessContext {
  id?: string;
  name?: string;
  country: string;
  industry: string;
  subIndustry?: string;
  entitySize: string;
  annualRevenue?: number;
  employeeCount?: number;
  fiscalYearEnd: string;
  currency: string;
  complianceFrameworks: string[];
  isDefault?: boolean;
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
  totalTokensUsed?: number;
  totalRequests?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
}

export interface LLMUsageLog {
  id: string;
  llmConfigId?: string;
  intentId?: string;
  provider: string;
  model: string;
  section: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs?: number;
  status: string;
  errorMessage?: string;
  createdAt: string;
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

// Hook for fetching and managing country configs (CRUD)
export function useCountryConfigs() {
  const [countryConfigs, setCountryConfigs] = useState<CountryConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCountryConfigs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('country_configs')
      .select('*')
      .order('name');

    if (!error && data) {
      setCountryConfigs(data.map(c => ({
        code: c.code,
        name: c.name,
        flag: c.flag,
        currency: c.currency,
        currencySymbol: c.currency_symbol,
        sizeThresholds: c.size_thresholds as CountryConfig['sizeThresholds'],
        displayThresholds: c.display_thresholds as CountryConfig['displayThresholds'],
        isActive: c.is_active
      })));
    }
    setLoading(false);
  }, []);

  const createCountryConfig = useCallback(async (config: CountryConfig) => {
    try {
      const { error } = await supabase
        .from('country_configs')
        .insert([{
          code: config.code,
          name: config.name,
          flag: config.flag,
          currency: config.currency,
          currency_symbol: config.currencySymbol,
          size_thresholds: config.sizeThresholds,
          display_thresholds: config.displayThresholds,
          is_active: config.isActive ?? true
        }]);

      if (error) throw error;
      await fetchCountryConfigs();
      toast({ title: 'Country config created successfully' });
      return true;
    } catch (err) {
      toast({ title: 'Failed to create country config', variant: 'destructive' });
      throw err;
    }
  }, [fetchCountryConfigs]);

  const updateCountryConfig = useCallback(async (code: string, updates: Partial<CountryConfig>) => {
    try {
      const dbUpdates: Record<string, any> = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.flag !== undefined) dbUpdates.flag = updates.flag;
      if (updates.currency !== undefined) dbUpdates.currency = updates.currency;
      if (updates.currencySymbol !== undefined) dbUpdates.currency_symbol = updates.currencySymbol;
      if (updates.sizeThresholds !== undefined) dbUpdates.size_thresholds = updates.sizeThresholds;
      if (updates.displayThresholds !== undefined) dbUpdates.display_thresholds = updates.displayThresholds;
      if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

      const { error } = await supabase
        .from('country_configs')
        .update(dbUpdates)
        .eq('code', code);

      if (error) throw error;
      await fetchCountryConfigs();
      toast({ title: 'Country config updated' });
      return true;
    } catch (err) {
      toast({ title: 'Failed to update country config', variant: 'destructive' });
      throw err;
    }
  }, [fetchCountryConfigs]);

  const deleteCountryConfig = useCallback(async (code: string) => {
    try {
      const { error } = await supabase
        .from('country_configs')
        .delete()
        .eq('code', code);

      if (error) throw error;
      await fetchCountryConfigs();
      toast({ title: 'Country config deleted' });
      return true;
    } catch (err) {
      toast({ title: 'Failed to delete country config', variant: 'destructive' });
      throw err;
    }
  }, [fetchCountryConfigs]);

  useEffect(() => {
    fetchCountryConfigs();
  }, [fetchCountryConfigs]);

  return { 
    countryConfigs, 
    loading, 
    refetch: fetchCountryConfigs,
    createCountryConfig,
    updateCountryConfig,
    deleteCountryConfig
  };
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

// Hook for fetching and managing enrichment types (CRUD)
export function useEnrichmentTypes() {
  const [enrichmentTypes, setEnrichmentTypes] = useState<EnrichmentType[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEnrichmentTypes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('enrichment_types')
      .select('*')
      .order('sort_order');

    if (!error && data) {
      setEnrichmentTypes(data.map(e => ({
        id: e.id,
        name: e.name,
        icon: e.icon,
        description: e.description || '',
        configFields: (e.config_fields as string[]) || [],
        isActive: e.is_active,
        sortOrder: e.sort_order
      })));
    }
    setLoading(false);
  }, []);

  const createEnrichmentType = useCallback(async (enrichment: Omit<EnrichmentType, 'sortOrder'> & { sortOrder?: number }) => {
    try {
      const maxSort = enrichmentTypes.length > 0 ? Math.max(...enrichmentTypes.map(e => e.sortOrder || 0)) : 0;
      const { error } = await supabase
        .from('enrichment_types')
        .insert([{
          id: enrichment.id,
          name: enrichment.name,
          icon: enrichment.icon,
          description: enrichment.description,
          config_fields: enrichment.configFields,
          is_active: enrichment.isActive ?? true,
          sort_order: enrichment.sortOrder ?? maxSort + 1
        }]);

      if (error) throw error;
      await fetchEnrichmentTypes();
      toast({ title: 'Enrichment type created successfully' });
      return true;
    } catch (err) {
      toast({ title: 'Failed to create enrichment type', variant: 'destructive' });
      throw err;
    }
  }, [fetchEnrichmentTypes, enrichmentTypes]);

  const updateEnrichmentType = useCallback(async (id: string, updates: Partial<EnrichmentType>) => {
    try {
      const dbUpdates: Record<string, any> = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.icon !== undefined) dbUpdates.icon = updates.icon;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.configFields !== undefined) dbUpdates.config_fields = updates.configFields;
      if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
      if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder;

      const { error } = await supabase
        .from('enrichment_types')
        .update(dbUpdates)
        .eq('id', id);

      if (error) throw error;
      await fetchEnrichmentTypes();
      toast({ title: 'Enrichment type updated' });
      return true;
    } catch (err) {
      toast({ title: 'Failed to update enrichment type', variant: 'destructive' });
      throw err;
    }
  }, [fetchEnrichmentTypes]);

  const deleteEnrichmentType = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('enrichment_types')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchEnrichmentTypes();
      toast({ title: 'Enrichment type deleted' });
      return true;
    } catch (err) {
      toast({ title: 'Failed to delete enrichment type', variant: 'destructive' });
      throw err;
    }
  }, [fetchEnrichmentTypes]);

  useEffect(() => {
    fetchEnrichmentTypes();
  }, [fetchEnrichmentTypes]);

  return { 
    enrichmentTypes, 
    loading, 
    refetch: fetchEnrichmentTypes,
    createEnrichmentType,
    updateEnrichmentType,
    deleteEnrichmentType
  };
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
        lastGeneratedAt: i.last_generated_at || undefined,
        totalTokensUsed: i.total_tokens_used || 0,
        generationCount: i.generation_count || 0,
        lastGenerationTokens: i.last_generation_tokens || 0
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
          sub_module_id: intent.subModuleId,
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

// Hook for business context (CRUD)
export function useBusinessContext() {
  const [businessContext, setBusinessContext] = useState<BusinessContext | null>(null);
  const [allContexts, setAllContexts] = useState<BusinessContext[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchContext = useCallback(async () => {
    setLoading(true);
    // Fetch default context
    const { data: defaultData, error: defaultError } = await supabase
      .from('business_contexts')
      .select('*')
      .eq('is_default', true)
      .maybeSingle();

    if (!defaultError && defaultData) {
      setBusinessContext({
        id: defaultData.id,
        country: defaultData.country,
        industry: defaultData.industry,
        subIndustry: defaultData.sub_industry || undefined,
        entitySize: defaultData.entity_size,
        annualRevenue: defaultData.annual_revenue ? Number(defaultData.annual_revenue) : undefined,
        employeeCount: defaultData.employee_count || undefined,
        fiscalYearEnd: defaultData.fiscal_year_end,
        currency: defaultData.currency,
        complianceFrameworks: (defaultData.compliance_frameworks as string[]) || [],
        isDefault: defaultData.is_default,
        name: defaultData.name || undefined
      });
    }

    // Fetch all contexts
    const { data: allData, error: allError } = await supabase
      .from('business_contexts')
      .select('*')
      .order('created_at', { ascending: false });

    if (!allError && allData) {
      setAllContexts(allData.map(d => ({
        id: d.id,
        country: d.country,
        industry: d.industry,
        subIndustry: d.sub_industry || undefined,
        entitySize: d.entity_size,
        annualRevenue: d.annual_revenue ? Number(d.annual_revenue) : undefined,
        employeeCount: d.employee_count || undefined,
        fiscalYearEnd: d.fiscal_year_end,
        currency: d.currency,
        complianceFrameworks: (d.compliance_frameworks as string[]) || [],
        isDefault: d.is_default,
        name: d.name || undefined
      })));
    }
    setLoading(false);
  }, []);

  const createContext = useCallback(async (context: Omit<BusinessContext, 'id'>) => {
    try {
      const { error } = await supabase
        .from('business_contexts')
        .insert([{
          country: context.country,
          industry: context.industry,
          sub_industry: context.subIndustry,
          entity_size: context.entitySize,
          annual_revenue: context.annualRevenue,
          employee_count: context.employeeCount,
          fiscal_year_end: context.fiscalYearEnd,
          currency: context.currency,
          compliance_frameworks: context.complianceFrameworks,
          is_default: context.isDefault ?? false,
          name: context.name
        }]);

      if (error) throw error;
      await fetchContext();
      toast({ title: 'Business context created successfully' });
      return true;
    } catch (err) {
      toast({ title: 'Failed to create business context', variant: 'destructive' });
      throw err;
    }
  }, [fetchContext]);

  const updateContext = useCallback(async (updates: Partial<BusinessContext>, id?: string) => {
    const targetId = id || businessContext?.id;
    if (!targetId) return;

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
    if (updates.isDefault !== undefined) dbUpdates.is_default = updates.isDefault;
    if (updates.name !== undefined) dbUpdates.name = updates.name;

    const { error } = await supabase
      .from('business_contexts')
      .update(dbUpdates)
      .eq('id', targetId);

    if (!error) {
      if (!id || id === businessContext?.id) {
        setBusinessContext(prev => prev ? { ...prev, ...updates } : prev);
      }
      await fetchContext();
      toast({ title: 'Business context updated' });
    }
  }, [businessContext?.id, fetchContext]);

  const deleteContext = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('business_contexts')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchContext();
      toast({ title: 'Business context deleted' });
      return true;
    } catch (err) {
      toast({ title: 'Failed to delete business context', variant: 'destructive' });
      throw err;
    }
  }, [fetchContext]);

  const setAsDefault = useCallback(async (id: string) => {
    try {
      // First, unset all defaults
      await supabase
        .from('business_contexts')
        .update({ is_default: false })
        .neq('id', 'placeholder');

      // Then set the new default
      const { error } = await supabase
        .from('business_contexts')
        .update({ is_default: true })
        .eq('id', id);

      if (error) throw error;
      await fetchContext();
      toast({ title: 'Default context updated' });
      return true;
    } catch (err) {
      toast({ title: 'Failed to set default context', variant: 'destructive' });
      throw err;
    }
  }, [fetchContext]);

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  return { 
    businessContext, 
    allContexts,
    loading, 
    updateContext, 
    createContext,
    deleteContext,
    setAsDefault,
    refetch: fetchContext 
  };
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
        systemPromptOverride: data.system_prompt_override || '',
        totalTokensUsed: data.total_tokens_used || 0,
        totalRequests: data.total_requests || 0,
        totalInputTokens: data.total_input_tokens || 0,
        totalOutputTokens: data.total_output_tokens || 0
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

// Model pricing per 1M tokens (in USD)
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic Claude models
  'claude-opus-4-5': { input: 15.00, output: 75.00 },
  'claude-sonnet-4-5': { input: 3.00, output: 15.00 },
  'claude-3-opus': { input: 15.00, output: 75.00 },
  'claude-3-sonnet': { input: 3.00, output: 15.00 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  // OpenAI models
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-4': { input: 30.00, output: 60.00 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  // Default fallback
  'default': { input: 5.00, output: 15.00 }
};

export interface ModelUsage {
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestCount: number;
  estimatedCostUsd: number;
}

// Calculate cost in USD
export const calculateCost = (model: string, inputTokens: number, outputTokens: number): number => {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['default'];
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
};

// Hook for LLM usage logs with model breakdown
export function useLLMUsageLogs(intentId?: string, limit: number = 100) {
  const [logs, setLogs] = useState<LLMUsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalUsage, setTotalUsage] = useState({ inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0, totalCostUsd: 0 });
  const [usageByModel, setUsageByModel] = useState<ModelUsage[]>([]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('llm_usage_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (intentId) {
      query = query.eq('intent_id', intentId);
    }

    const { data, error } = await query;

    if (!error && data) {
      const mappedLogs: LLMUsageLog[] = data.map((log: any) => ({
        id: log.id,
        llmConfigId: log.llm_config_id,
        intentId: log.intent_id,
        provider: log.provider,
        model: log.model,
        section: log.section,
        inputTokens: log.input_tokens,
        outputTokens: log.output_tokens,
        totalTokens: log.total_tokens,
        latencyMs: log.latency_ms,
        status: log.status,
        errorMessage: log.error_message,
        createdAt: log.created_at
      }));
      setLogs(mappedLogs);

      // Calculate total usage with cost
      let totalCostUsd = 0;
      const totals = mappedLogs.reduce((acc, log) => {
        const cost = calculateCost(log.model, log.inputTokens, log.outputTokens);
        totalCostUsd += cost;
        return {
          inputTokens: acc.inputTokens + log.inputTokens,
          outputTokens: acc.outputTokens + log.outputTokens,
          totalTokens: acc.totalTokens + log.totalTokens,
          requestCount: acc.requestCount + 1
        };
      }, { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 });
      setTotalUsage({ ...totals, totalCostUsd });

      // Group by model
      const modelMap = new Map<string, ModelUsage>();
      mappedLogs.forEach(log => {
        const key = `${log.provider}:${log.model}`;
        const existing = modelMap.get(key);
        const cost = calculateCost(log.model, log.inputTokens, log.outputTokens);
        if (existing) {
          existing.inputTokens += log.inputTokens;
          existing.outputTokens += log.outputTokens;
          existing.totalTokens += log.totalTokens;
          existing.requestCount += 1;
          existing.estimatedCostUsd += cost;
        } else {
          modelMap.set(key, {
            model: log.model,
            provider: log.provider,
            inputTokens: log.inputTokens,
            outputTokens: log.outputTokens,
            totalTokens: log.totalTokens,
            requestCount: 1,
            estimatedCostUsd: cost
          });
        }
      });
      setUsageByModel(Array.from(modelMap.values()).sort((a, b) => b.totalTokens - a.totalTokens));
    }
    setLoading(false);
  }, [intentId, limit]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return { logs, loading, totalUsage, usageByModel, refetch: fetchLogs };
}

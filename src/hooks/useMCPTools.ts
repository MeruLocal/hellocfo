import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface MCPTool {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  method: string;
  parameters: {
    name: string;
    type: string;
    required: boolean;
    enumValues?: string[];
  }[];
  responseFields: string[];
}

export interface MCPCredentials {
  authToken: string;
  entityId: string;
  orgId: string;
}

async function loadToolsFromDB(): Promise<MCPTool[]> {
  const { data, error } = await supabase
    .from('mcp_tools_master')
    .select('*')
    .eq('is_active', true)
    .order('tool_name');

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.tool_name,
    name: row.tool_name,
    description: row.description || '',
    endpoint: row.endpoint || '',
    method: row.method || 'POST',
    parameters: row.input_schema && typeof row.input_schema === 'object' && 'properties' in (row.input_schema as any)
      ? Object.entries((row.input_schema as any).properties || {}).map(([name, schema]: [string, any]) => ({
          name,
          type: schema.type || 'string',
          required: ((row.input_schema as any).required || []).includes(name),
          enumValues: schema.enum,
        }))
      : [],
    responseFields: [],
  }));
}

async function saveToolsToDB(tools: any[]): Promise<void> {
  // Mark all existing tools inactive first
  await supabase.from('mcp_tools_master').update({ is_active: false }).neq('tool_name', '');

  // Upsert fresh tools
  const rows = tools.map((tool: any) => ({
    tool_name: tool.name || tool.id,
    display_name: tool.name || tool.id,
    description: tool.description || '',
    endpoint: tool.endpoint || '',
    method: tool.method || 'POST',
    input_schema: tool.inputSchema || null,
    category: 'mcp',
    is_active: true,
  }));

  if (rows.length === 0) return;

  const { error } = await supabase
    .from('mcp_tools_master')
    .upsert(rows, { onConflict: 'tool_name' });

  if (error) console.error('Failed to save MCP tools to DB:', error.message);
}

export function useMCPTools() {
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Load cached tools from DB on mount
  useEffect(() => {
    if (initialized) return;
    setInitialized(true);
    setLoading(true);
    loadToolsFromDB().then((cached) => {
      if (cached.length > 0) {
        setTools(cached);
      }
    }).finally(() => setLoading(false));
  }, [initialized]);

  const fetchTools = useCallback(async (credentials?: MCPCredentials) => {
    setLoading(true);
    setError(null);

    try {
      const headers: Record<string, string> = {};
      const body: Record<string, string> = {};

      if (credentials) {
        let token = credentials.authToken.trim();
        while (token.toLowerCase().startsWith("bearer ")) {
          token = token.substring(7).trim();
        }
        headers['H-Authorization'] = `Bearer ${token}`;
        body['entityId'] = credentials.entityId;
        body['orgId'] = credentials.orgId;
      }

      const { data, error: invokeError } = await supabase.functions.invoke('fetch-mcp-tools', {
        headers,
        body,
      });

      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);

      if (data?.tools && Array.isArray(data.tools)) {
        // Save raw tools to DB
        await saveToolsToDB(data.tools);

        const mappedTools: MCPTool[] = data.tools.map((tool: any) => ({
          id: tool.name || tool.id,
          name: tool.name || tool.id,
          description: tool.description || '',
          endpoint: tool.endpoint || '',
          method: tool.method || 'POST',
          parameters: tool.inputSchema?.properties
            ? Object.entries(tool.inputSchema.properties).map(([name, schema]: [string, any]) => ({
                name,
                type: schema.type || 'string',
                required: tool.inputSchema?.required?.includes(name) || false,
                enumValues: schema.enum
              }))
            : [],
          responseFields: tool.responseFields || []
        }));

        setTools(mappedTools);
        toast({ title: `Loaded & saved ${mappedTools.length} MCP tools` });
      } else {
        setTools([]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch MCP tools';
      setError(message);
      toast({ title: 'Failed to fetch MCP tools', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  return { tools, loading, error, fetchTools };
}

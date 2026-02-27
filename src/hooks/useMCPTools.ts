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

interface SyncResult {
  added: string[];
  updated: string[];
  unchanged: number;
}

async function syncToolsToDB(tools: any[]): Promise<SyncResult> {
  const result: SyncResult = { added: [], updated: [], unchanged: 0 };
  if (tools.length === 0) return result;

  // 1. Fetch all existing tools from DB
  const { data: existing, error: fetchErr } = await supabase
    .from('mcp_tools_master')
    .select('tool_name, description, input_schema');

  if (fetchErr) {
    console.error('Failed to fetch existing tools for diff:', fetchErr.message);
    return result;
  }

  // 2. Build lookup map
  const existingMap = new Map<string, { description: string | null; input_schema: any }>();
  for (const row of existing || []) {
    existingMap.set(row.tool_name, {
      description: row.description,
      input_schema: row.input_schema,
    });
  }

  // 3. Categorize fetched tools
  const toUpsert: any[] = [];
  for (const tool of tools) {
    const name = tool.name || tool.id;
    const desc = tool.description || '';
    const schema = tool.inputSchema || null;
    const row = {
      tool_name: name,
      display_name: name,
      description: desc,
      endpoint: tool.endpoint || '',
      method: tool.method || 'POST',
      input_schema: schema,
      category: 'mcp',
      is_active: true,
    };

    const ex = existingMap.get(name);
    if (!ex) {
      result.added.push(name);
      toUpsert.push(row);
    } else {
      const descChanged = (ex.description || '') !== desc;
      const schemaChanged = JSON.stringify(ex.input_schema || null) !== JSON.stringify(schema);
      if (descChanged || schemaChanged) {
        result.updated.push(name);
        toUpsert.push(row);
      } else {
        result.unchanged++;
      }
    }
  }

  // 4. Upsert only new + updated
  if (toUpsert.length > 0) {
    const { error } = await supabase
      .from('mcp_tools_master')
      .upsert(toUpsert, { onConflict: 'tool_name' });
    if (error) console.error('Failed to sync MCP tools to DB:', error.message);
  }

  return result;
}

export function useMCPTools() {
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

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

    // Load last synced timestamp
    supabase
      .from('mcp_tools_master')
      .select('updated_at')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setLastSyncedAt(data[0].updated_at);
      });
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
        // Smart diff sync to DB
        const syncResult = await syncToolsToDB(data.tools);
        setLastSyncedAt(new Date().toISOString());

        // Reload full list from DB to get consistent state
        const refreshed = await loadToolsFromDB();
        if (refreshed.length > 0) setTools(refreshed);

        // Show diff-aware toast
        const total = syncResult.added.length + syncResult.updated.length + syncResult.unchanged;
        if (syncResult.added.length === 0 && syncResult.updated.length === 0) {
          toast({ title: `All ${total} tools are up to date ✓` });
        } else if (syncResult.unchanged === 0) {
          toast({ title: `Synced ${total} MCP tools to database` });
        } else {
          const parts: string[] = [];
          if (syncResult.added.length > 0) parts.push(`${syncResult.added.length} new`);
          if (syncResult.updated.length > 0) parts.push(`${syncResult.updated.length} updated`);
          toast({ title: `Sync complete: ${parts.join(', ')}`, description: `${syncResult.unchanged} unchanged` });
        }
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

  return { tools, loading, error, fetchTools, lastSyncedAt };
}

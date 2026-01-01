import { useState, useCallback } from 'react';
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

export function useMCPTools() {
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTools = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('fetch-mcp-tools');

      if (invokeError) throw invokeError;

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.tools && Array.isArray(data.tools)) {
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
        toast({ title: `Loaded ${mappedTools.length} MCP tools` });
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

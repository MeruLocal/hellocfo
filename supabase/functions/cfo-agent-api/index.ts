import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SSEEvent {
  type: string;
  data: unknown;
  timestamp: string;
}

interface Intent {
  id: string;
  name: string;
  description: string;
  module_id: string;
  training_phrases: string[];
  entities: Record<string, unknown>[];
  resolution_flow: {
    dataPipeline?: { tool: string; description: string; purpose?: string }[];
    enrichments?: { type: string; description: string }[];
    responseConfig?: { template: string; format: string };
  };
  is_active: boolean;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Truncate large results to prevent token overflow
function truncateResult(result: unknown, maxLength = 8000): string {
  const str = typeof result === 'string' ? result : JSON.stringify(result);
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + `... [truncated, ${str.length - maxLength} chars omitted]`;
}

// MCP Client for HelloBooks integration
class MCPClient {
  private baseUrl: string;
  private authToken: string;
  private sessionId: string | null = null;

  constructor(baseUrl: string, authToken: string) {
    this.baseUrl = baseUrl;
    this.authToken = authToken;
  }

  async connect(): Promise<void> {
    console.log('[MCP] Connecting to:', this.baseUrl);
    const response = await fetch(`${this.baseUrl}/sse`, {
      headers: { 'Authorization': `Bearer ${this.authToken}` }
    });

    if (!response.ok) {
      throw new Error(`MCP connection failed: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    // Read until we get the endpoint event
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: endpoint')) {
          const dataLine = lines[lines.indexOf(line) + 1];
          if (dataLine?.startsWith('data: ')) {
            const endpoint = dataLine.slice(6).trim();
            const urlParams = new URL(endpoint, this.baseUrl);
            this.sessionId = urlParams.searchParams.get('sessionId');
            console.log('[MCP] Connected with sessionId:', this.sessionId);
            reader.cancel();
            return;
          }
        }
      }
    }
  }

  async listTools(): Promise<{ name: string; description: string; inputSchema: unknown }[]> {
    if (!this.sessionId) throw new Error('Not connected');

    const response = await fetch(`${this.baseUrl}/message?sessionId=${this.sessionId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      })
    });

    const result = await response.json();
    return result.result?.tools || [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.sessionId) throw new Error('Not connected');

    console.log(`[MCP] Calling tool: ${name}`, args);

    const response = await fetch(`${this.baseUrl}/message?sessionId=${this.sessionId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name, arguments: args }
      })
    });

    const result = await response.json();
    console.log(`[MCP] Tool ${name} result received`);

    if (result.error) {
      throw new Error(result.error.message || 'Tool call failed');
    }

    return result.result?.content?.[0]?.text || result.result;
  }

  close(): void {
    this.sessionId = null;
  }
}

// Call Lovable AI Gateway
async function callLovableAI(
  apiKey: string,
  systemPrompt: string,
  messages: ChatMessage[],
  tools?: unknown[]
): Promise<{ content: string; toolCalls?: { name: string; arguments: Record<string, unknown> }[] }> {
  const body: Record<string, unknown> = {
    model: 'google/gemini-2.5-flash',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages
    ],
    max_tokens: 4096
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[LovableAI] Error:', response.status, error);
    throw new Error(`AI request failed: ${response.status}`);
  }

  const result = await response.json();
  const choice = result.choices?.[0];
  const message = choice?.message;

  if (message?.tool_calls && message.tool_calls.length > 0) {
    return {
      content: message.content || '',
      toolCalls: message.tool_calls.map((tc: { function: { name: string; arguments: string } }) => ({
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments || '{}')
      }))
    };
  }

  return { content: message?.content || '' };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Validate Authorization header
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized', code: 'MISSING_AUTH' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const token = authHeader.replace('Bearer ', '').trim();
  console.log(`[Auth] Token received, length: ${token.length}, prefix: ${token.substring(0, 20)}...`);

  // Initialize Supabase client
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Verify user token
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    console.error('[Auth] Invalid token:', authError?.message);
    return new Response(JSON.stringify({ error: 'Invalid token', code: 'INVALID_TOKEN' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  console.log('[Auth] User authenticated:', user.id);

  // Parse request body
  let body: { query: string; conversationId?: string; conversationHistory?: ChatMessage[]; stream?: boolean };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const { query, conversationId, conversationHistory = [], stream = true } = body;

  if (!query || typeof query !== 'string') {
    return new Response(JSON.stringify({ error: 'Query is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Get Lovable AI key
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!lovableApiKey) {
    return new Response(JSON.stringify({ error: 'AI service not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Get MCP credentials
  const mcpUrl = Deno.env.get('HELLOBOOKS_MCP_URL');
  const mcpToken = Deno.env.get('HELLOBOOKS_MCP_TOKEN');

  const startTime = Date.now();

  // Setup SSE stream
  const encoder = new TextEncoder();
  let streamController: ReadableStreamDefaultController<Uint8Array>;

  const responseStream = new ReadableStream({
    start(controller) {
      streamController = controller;
    },
    cancel() {
      console.log('[SSE] Client disconnected');
    }
  });

  const sendEvent = (type: string, data: unknown) => {
    const event: SSEEvent = { type, data, timestamp: new Date().toISOString() };
    const message = `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
    try {
      streamController.enqueue(encoder.encode(message));
    } catch (e) {
      console.error('[SSE] Failed to send event:', e);
    }
  };

  const closeStream = () => {
    try {
      streamController.close();
    } catch (e) {
      console.error('[SSE] Failed to close stream:', e);
    }
  };

  // Process in background
  (async () => {
    let mcpClient: MCPClient | null = null;

    try {
      // Send connected event
      sendEvent('connected', {
        sessionId: conversationId || crypto.randomUUID(),
        userId: user.id,
        message: 'Connected to CFO Agent API'
      });

      // Fetch active intents from database
      sendEvent('understanding_started', { message: 'Analyzing your query...' });

      const { data: intents, error: intentsError } = await supabase
        .from('intents')
        .select('*')
        .eq('is_active', true);

      if (intentsError) {
        throw new Error(`Failed to fetch intents: ${intentsError.message}`);
      }

      console.log(`[Intents] Loaded ${intents?.length || 0} active intents`);

      // Connect to MCP if configured
      let mcpTools: { name: string; description: string; inputSchema: unknown }[] = [];
      if (mcpUrl && mcpToken) {
        try {
          mcpClient = new MCPClient(mcpUrl, mcpToken);
          await mcpClient.connect();
          mcpTools = await mcpClient.listTools();
          console.log(`[MCP] Loaded ${mcpTools.length} tools`);
        } catch (e) {
          console.error('[MCP] Connection failed:', e);
          sendEvent('error', { message: 'MCP connection failed, continuing without external data', recoverable: true });
        }
      }

      // Build intent matching prompt
      sendEvent('intent_detecting', { message: 'Matching against available intents...' });

      const intentList = (intents as Intent[]).map(i => ({
        id: i.id,
        name: i.name,
        description: i.description,
        trainingPhrases: i.training_phrases?.slice(0, 5) || [],
        entities: i.entities?.map((e: Record<string, unknown>) => e.name) || []
      }));

      const matchIntentTool = {
        type: 'function',
        function: {
          name: 'match_intent',
          description: 'Match the user query to the best matching intent',
          parameters: {
            type: 'object',
            properties: {
              intentId: { type: 'string', description: 'The ID of the matched intent' },
              intentName: { type: 'string', description: 'Name of the matched intent' },
              confidence: { type: 'number', description: 'Confidence score 0-1' },
              reasoning: { type: 'string', description: 'Why this intent was matched' },
              extractedEntities: {
                type: 'object',
                description: 'Entities extracted from the query',
                additionalProperties: true
              }
            },
            required: ['intentId', 'intentName', 'confidence', 'reasoning']
          }
        }
      };

      const intentMatchPrompt = `You are a CFO Agent that helps analyze financial queries.
Your task is to match the user's query to the most appropriate intent.

Available intents:
${JSON.stringify(intentList, null, 2)}

Analyze the query and use the match_intent tool to return:
1. The best matching intent (by ID and name)
2. Your confidence level (0-1)
3. Your reasoning for the match
4. Any entities you can extract from the query (like numbers, dates, names)

If no intent matches well (confidence < 0.3), still return the closest match but with low confidence.`;

      const matchResult = await callLovableAI(
        lovableApiKey,
        intentMatchPrompt,
        [{ role: 'user', content: query }],
        [matchIntentTool]
      );

      let matchedIntent: Intent | null = null;
      let extractedEntities: Record<string, unknown> = {};
      let matchReasoning = '';
      let confidence = 0;

      if (matchResult.toolCalls?.[0]?.name === 'match_intent') {
        const args = matchResult.toolCalls[0].arguments;
        const intentId = args.intentId as string;
        matchedIntent = (intents as Intent[]).find(i => i.id === intentId) || null;
        extractedEntities = (args.extractedEntities as Record<string, unknown>) || {};
        matchReasoning = args.reasoning as string;
        confidence = args.confidence as number;
      }

      // Send intent detected event
      sendEvent('intent_detected', {
        intent: matchedIntent ? {
          id: matchedIntent.id,
          name: matchedIntent.name,
          description: matchedIntent.description,
          confidence
        } : null,
        reasoning: matchReasoning
      });

      // Send entities extracted event
      sendEvent('entities_extracted', { entities: extractedEntities });

      // Get resolution flow from matched intent
      const resolutionFlow = matchedIntent?.resolution_flow || {};
      const dataPipeline = resolutionFlow.dataPipeline || [];
      const enrichments = resolutionFlow.enrichments || [];
      const responseConfig = resolutionFlow.responseConfig;

      // Send pipeline planned event
      sendEvent('pipeline_planned', {
        steps: dataPipeline.map(step => ({
          tool: step.tool,
          description: step.description,
          purpose: step.purpose || 'Fetch data'
        }))
      });

      // Send enrichments planned event
      sendEvent('enrichments_planned', {
        enrichments: enrichments.map(e => ({
          type: e.type,
          description: e.description
        }))
      });

      // Execute MCP tools if available
      const toolResults: { tool: string; success: boolean; data?: unknown; error?: string }[] = [];

      if (mcpClient && dataPipeline.length > 0) {
        for (const step of dataPipeline) {
          sendEvent('executing_tool', { tool: step.tool, status: 'running' });

          try {
            // Find matching MCP tool
            const mcpTool = mcpTools.find(t => 
              t.name === step.tool || 
              t.name.toLowerCase().includes(step.tool.toLowerCase())
            );

            if (mcpTool) {
              const result = await mcpClient.callTool(mcpTool.name, extractedEntities);
              const truncatedResult = truncateResult(result);
              
              toolResults.push({
                tool: step.tool,
                success: true,
                data: truncatedResult
              });

              sendEvent('tool_result', {
                tool: step.tool,
                success: true,
                recordCount: Array.isArray(result) ? result.length : 1
              });
            } else {
              toolResults.push({
                tool: step.tool,
                success: false,
                error: 'Tool not found in MCP'
              });

              sendEvent('tool_result', {
                tool: step.tool,
                success: false,
                error: 'Tool not available'
              });
            }
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : 'Unknown error';
            toolResults.push({
              tool: step.tool,
              success: false,
              error: errorMsg
            });

            sendEvent('tool_result', {
              tool: step.tool,
              success: false,
              error: errorMsg
            });
          }
        }
      }

      // Generate final response
      sendEvent('response_generating', { message: 'Generating response...' });

      const responsePrompt = `You are a CFO Agent providing financial insights.

User Query: "${query}"

Matched Intent: ${matchedIntent?.name || 'None'} (${(confidence * 100).toFixed(0)}% confidence)
Reasoning: ${matchReasoning}

Extracted Entities: ${JSON.stringify(extractedEntities)}

Data Retrieved:
${toolResults.map(r => `- ${r.tool}: ${r.success ? r.data : `Error: ${r.error}`}`).join('\n')}

${responseConfig?.template ? `Response Template: ${responseConfig.template}` : ''}

Generate a helpful, professional response that:
1. Addresses the user's query directly
2. Uses the retrieved data if available
3. Provides actionable insights
4. Is formatted clearly with headers/bullets if appropriate

If no data was retrieved, provide a helpful response explaining what you would need to answer the query.`;

      const finalMessages: ChatMessage[] = [
        ...conversationHistory,
        { role: 'user', content: query }
      ];

      const response = await callLovableAI(lovableApiKey, responsePrompt, finalMessages);

      // Stream response in chunks
      const responseText = response.content;
      const chunkSize = 50;
      for (let i = 0; i < responseText.length; i += chunkSize) {
        const chunk = responseText.slice(i, i + chunkSize);
        sendEvent('response_chunk', { text: chunk });
        await new Promise(r => setTimeout(r, 20)); // Small delay for streaming effect
      }

      // Send complete event
      const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
      sendEvent('complete', {
        success: true,
        query,
        matchedIntent: matchedIntent ? {
          id: matchedIntent.id,
          name: matchedIntent.name,
          confidence
        } : null,
        extractedEntities,
        reasoning: matchReasoning,
        pipelineSteps: dataPipeline,
        enrichments,
        toolResults: toolResults.map(r => ({
          tool: r.tool,
          success: r.success,
          error: r.error
        })),
        response: responseText,
        executionTime: `${executionTime}s`
      });

    } catch (error) {
      console.error('[Error]', error);
      sendEvent('error', {
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
        code: 'PROCESSING_ERROR'
      });
    } finally {
      mcpClient?.close();
      closeStream();
    }
  })();

  return new Response(responseStream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
});

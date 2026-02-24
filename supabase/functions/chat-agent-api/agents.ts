import { Agent, run, MCPServerStreamableHttp, OpenAIChatCompletionsModel } from 'https://esm.sh/@openai/agents@0.4.2?target=denonext';
import OpenAI from 'https://esm.sh/openai@4.104.0?target=denonext';
import { SYSTEM_PROMPTS } from './model-selector.ts';

export interface LLMConfig {
  id: string;
  provider: string;
  model: string;
  api_key: string | null;
  endpoint: string | null;
  max_tokens: number;
  temperature: number;
}

export interface AgentBuildContext {
  routeCategory: 'general_chat' | 'unified';
  query: string;
  selectedToolNames: string[];
  mcpBaseUrl?: string;
  mcpAuthToken?: string;
  entityId?: string;
  orgId?: string;
  isConfirmation: boolean;
  pendingActionSummary?: string;
  pendingActionTool?: string;
  paginationContext?: string;
  bulkListContext?: string;
  detailLookupContext?: string;
}

export interface AgentExecutionResult {
  runResult: AsyncIterable<unknown> & Record<string, unknown>;
  close: () => Promise<void>;
}

const NO_DATABASE_ID_EXPOSURE_RULE = `⚠️ ABSOLUTE RULE — NO EXCEPTIONS:
NEVER show database IDs, internal IDs, UUIDs, or numeric system IDs in any user-facing response.
Never show internal fields like id, *_id, entity_id, org_id, customer_id, vendor_id, invoice_id, bill_id, payment_id, created_by, or updated_by.
If tool data includes these fields or values, omit them entirely and only present human-readable references (invoice/bill numbers, names, dates, statuses, and amounts).`;

const DEFAULT_AZURE_OPENAI_ENDPOINT = 'https://lovable-hellobooks-resource.cognitiveservices.azure.com/openai/v1/';

function resolveLLMBaseEndpoint(endpoint: string | null | undefined): string {
  const raw = (endpoint || '').trim();
  if (!raw) return DEFAULT_AZURE_OPENAI_ENDPOINT;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (
      host.endsWith('.supabase.co') ||
      path.includes('/functions/v1') ||
      path.endsWith('/v1/messages')
    ) {
      console.warn(`[chat-agent-api] LLM endpoint "${raw}" looks incompatible with chat/completions. Falling back to default endpoint.`);
      return DEFAULT_AZURE_OPENAI_ENDPOINT;
    }
    return raw;
  } catch (_e) {
    console.warn(`[chat-agent-api] Invalid LLM endpoint "${raw}". Falling back to default endpoint.`);
    return DEFAULT_AZURE_OPENAI_ENDPOINT;
  }
}

function buildAccountingInstructions(ctx: AgentBuildContext): string {
  const confirmationContext = ctx.isConfirmation
    ? `\n\n⚡ CONFIRMATION CONTEXT: The user just confirmed a previous action.${ctx.pendingActionTool ? ` Pending tool: "${ctx.pendingActionTool}".` : ''}${ctx.pendingActionSummary ? ` Previous context: "${ctx.pendingActionSummary}".` : ''} Execute the action immediately with available tools. Do not ask for confirmation again.`
    : '';

  return `${SYSTEM_PROMPTS.unified}\n\n${NO_DATABASE_ID_EXPOSURE_RULE}\n\nAvailable tools: ${ctx.selectedToolNames.join(', ') || 'none'}\n\n⚠️ TOOL USAGE RULE: When the user asks for "all" records (all invoices, all bills, all customers, etc.), you MUST call the appropriate list tool immediately. Never say you cannot list records — always use the available tool to fetch them. Only pass parameters that are explicitly defined in the tool schema.${confirmationContext}${ctx.paginationContext || ''}${ctx.bulkListContext || ''}${ctx.detailLookupContext || ''}`;
}

function buildMasterInstructions(ctx: AgentBuildContext): string {
  const routeHint = ctx.routeCategory === 'general_chat'
    ? 'Route this request to greeting_agent unless the user clearly asks for HelloBooks data or accounting operations.'
    : 'Route this request to accounting_agent and prioritize tool-grounded answers.';

  return [
    'You are the master router for Munimji.',
    'You have two sub-agents exposed as tools: greeting_agent and accounting_agent.',
    'Always call exactly one sub-agent tool for each user request.',
    routeHint,
    'Do not answer directly unless tool execution fails. If it fails, provide a short user-safe fallback.',
  ].join('\n');
}

export async function executeMasterAgent(
  llmConfig: LLMConfig,
  input: unknown[],
  context: AgentBuildContext,
): Promise<AgentExecutionResult> {
  const baseURL = resolveLLMBaseEndpoint(llmConfig.endpoint);
  const openaiClient = new OpenAI({
    apiKey: llmConfig.api_key || 'missing-api-key',
    baseURL,
    defaultHeaders: {
      'api-key': llmConfig.api_key || '',
    },
  });

  const model = new OpenAIChatCompletionsModel(llmConfig.model, openaiClient);

  let mcpServer: MCPServerStreamableHttp | null = null;
  const selectedSet = new Set(context.selectedToolNames);

  if (context.routeCategory !== 'general_chat' && context.mcpBaseUrl && context.mcpAuthToken && context.entityId && context.orgId) {
    const url = `${context.mcpBaseUrl.replace(/\/+$/, '')}/?entityid=${context.entityId}&orgid=${context.orgId}`;
    mcpServer = new MCPServerStreamableHttp({
      name: 'hellobooks_mcp',
      url,
      cacheToolsList: true,
      requestInit: {
        headers: {
          Authorization: `Bearer ${context.mcpAuthToken}`,
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
          'User-Agent': 'Munimji-Chat-Agent/1.0',
        },
      },
      toolFilter: (_runContext, tool) => {
        if (selectedSet.size === 0) return true;
        return selectedSet.has(tool.name);
      },
    });
    await mcpServer.connect();
  }

  const greetingAgent = new Agent({
    name: 'Greeting Agent',
    instructions: SYSTEM_PROMPTS.general_chat,
    model,
  });

  const accountingAgent = new Agent({
    name: 'Accounting Agent',
    instructions: buildAccountingInstructions(context),
    model,
    tools: mcpServer ? [mcpServer] : [],
  });

  const masterAgent = new Agent({
    name: 'Master Agent',
    instructions: buildMasterInstructions(context),
    model,
    tools: [
      greetingAgent.asTool({
        toolName: 'greeting_agent',
        toolDescription: 'Use for greetings, chit-chat, and non-data HelloBooks guidance.',
      }),
      accountingAgent.asTool({
        toolName: 'accounting_agent',
        toolDescription: 'Use for all accounting, reporting, and HelloBooks MCP tool actions.',
      }),
    ],
  });

  const runResult = await run(masterAgent, input, {
    stream: true,
  }) as AsyncIterable<unknown> & Record<string, unknown>;

  return {
    runResult,
    close: async () => {
      if (mcpServer) await mcpServer.close();
    },
  };
}

// Types for the Realtime CFO Agent

export type SSEEventType = 
  | 'connected'
  | 'understanding_started'
  | 'intent_detecting'
  | 'intent_detected'
  | 'entities_extracted'
  | 'pipeline_planned'
  | 'enrichments_planned'
  | 'executing_tool'
  | 'tool_result'
  | 'response_generating'
  | 'response_chunk'
  | 'complete'
  | 'error';

export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
  timestamp: string;
}

export interface MatchedIntent {
  id?: string;
  name: string;
  moduleId?: string;
  confidence: number;
  description?: string;
}

export interface PipelineStep {
  tool: string;
  description: string;
  purpose?: string;
}

export interface EnrichmentPlan {
  type: string;
  description: string;
}

export interface ToolResult {
  tool: string;
  success: boolean;
  recordCount?: number;
  error?: string;
}

export interface AgentUnderstanding {
  intent?: MatchedIntent | null;
  reasoning?: string;
  entities?: Record<string, unknown>;
  pipelineSteps?: PipelineStep[];
  enrichments?: EnrichmentPlan[];
  responseFormat?: string;
  toolResults?: ToolResult[];
  isComplete?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
  understanding?: AgentUnderstanding;
  isStreaming?: boolean;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  executionTime?: string;
  llmModel?: string;
}

export interface CompleteEventData {
  query: string;
  matchedIntent: MatchedIntent | null;
  extractedEntities: Record<string, unknown>;
  reasoning: string;
  pipelineSteps: PipelineStep[];
  enrichments: EnrichmentPlan[];
  responseFormat: string;
  response: string;
  mcpToolResults: Array<{
    tool: string;
    input?: Record<string, unknown>;
    result?: string;
    error?: string;
    success: boolean;
  }>;
  dataSources: string[];
  llmModel: string;
  iterationCount: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

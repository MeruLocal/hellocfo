import React, { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Web Speech API type declarations
interface SpeechRecognitionAPI extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionAPI;
    webkitSpeechRecognition: new () => SpeechRecognitionAPI;
  }
}
import { toast } from '@/hooks/use-toast';
import { 
  Send, 
  Loader2, 
  Trash2, 
  Sparkles,
  MessageSquare,
  Database,
  Zap,
  Mic,
  MicOff,
  Paperclip,
  X,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageBubble } from './MessageBubble';
import { AgentThinkingPanel } from './AgentThinkingPanel';
import { ConversationSidebar } from './ConversationSidebar';
import { 
  ChatMessage, 
  SSEEvent, 
  AgentUnderstanding, 
  CompleteEventData,
  MatchedIntent,
  PipelineStep,
  EnrichmentPlan,
  ToolResult,
  RouteClassification,
  ToolsFilteredInfo,
  MCQData,
  MCQStatus,
} from './types';
import type { Intent, BusinessContext, CountryConfig, LLMConfig } from '@/hooks/useCFOData';
import type { MCPTool } from '@/hooks/useMCPTools';

interface RealtimeCFOAgentProps {
  intents: Intent[];
  businessContext: BusinessContext;
  countryConfigs: CountryConfig[];
  mcpTools?: MCPTool[];
  llmConfig?: LLMConfig;
}

export function RealtimeCFOAgent({
  intents,
  businessContext,
  countryConfigs,
  mcpTools,
  llmConfig
}: RealtimeCFOAgentProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentUnderstanding, setCurrentUnderstanding] = useState<AgentUnderstanding>({});
  const [currentPhase, setCurrentPhase] = useState('');
  const [conversationId, setConversationId] = useState<string>(crypto.randomUUID());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [conversationRefreshKey, setConversationRefreshKey] = useState(0);
  const [mcqChainCount, setMcqChainCount] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<{ file: File; fileId?: string; uploading: boolean } | null>(null);
  const MAX_MCQ_CHAIN = 2;
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionAPI | null>(null);

  // Entity ID for conversation scoping
  const entityId = 'default'; // Could be made configurable
  const userId = 'realtime-user'; // Could use auth user ID

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages, currentUnderstanding]);

  const handleSSEEvent = useCallback((event: SSEEvent, startTime: number) => {
    const data = event.data as Record<string, unknown>;

    switch (event.type) {
      case 'connected':
        console.log('CFO Agent connected:', data);
        break;

      case 'understanding_started':
        setCurrentPhase('routing');
        setCurrentUnderstanding({});
        break;

      case 'route_started':
        setCurrentPhase('routing');
        break;

      case 'route_classified':
        setCurrentPhase('detecting');
        setCurrentUnderstanding(prev => ({
          ...prev,
          route: data as unknown as RouteClassification,
        }));
        break;

      case 'tools_filtered':
        setCurrentPhase('tools');
        setCurrentUnderstanding(prev => ({
          ...prev,
          toolsFiltered: data as unknown as ToolsFilteredInfo,
        }));
        break;

      case 'intent_detecting':
        setCurrentPhase('detecting');
        break;

      case 'intent_detected':
        setCurrentPhase('intent');
        setCurrentUnderstanding(prev => ({
          ...prev,
          intent: data.intent as MatchedIntent | null,
          reasoning: data.reasoning as string
        }));
        break;

      case 'entities_extracted':
        setCurrentPhase('entities');
        setCurrentUnderstanding(prev => ({
          ...prev,
          entities: data.entities as Record<string, unknown>
        }));
        break;

      case 'pipeline_planned':
        setCurrentPhase('pipeline');
        setCurrentUnderstanding(prev => ({
          ...prev,
          pipelineSteps: data.steps as PipelineStep[]
        }));
        break;

      case 'pipeline_executing':
        setCurrentPhase('executing');
        break;

      case 'enrichments_planned':
        setCurrentPhase('enrichments');
        setCurrentUnderstanding(prev => ({
          ...prev,
          enrichments: data.enrichments as EnrichmentPlan[],
          responseFormat: data.responseFormat as string
        }));
        break;

      case 'enrichments_applying':
        setCurrentPhase('enrichments');
        setCurrentUnderstanding(prev => ({
          ...prev,
          enrichments: data.enrichments as EnrichmentPlan[],
        }));
        break;

      case 'executing_tool':
        setCurrentPhase('executing');
        break;

      case 'tool_result':
        const toolResultData = data as { tool: string; success: boolean; recordCount?: number; error?: string };
        setCurrentUnderstanding(prev => ({
          ...prev,
          toolResults: [
            ...(prev.toolResults || []),
            toolResultData
          ]
        }));
        break;

      case 'mode_switch':
        setCurrentUnderstanding(prev => ({
          ...prev,
          route: prev.route ? { ...prev.route, crossOver: true } : undefined,
        }));
        break;

      case 'mcq_prompt': {
        const mcqData = data as unknown as MCQData;
        // GAP 4: MCQ chain fatigue — suppress after MAX_MCQ_CHAIN
        setMcqChainCount(prev => {
          const newCount = prev + 1;
          if (newCount > MAX_MCQ_CHAIN) {
            console.log(`[MCQ] Chain limit reached (${newCount}/${MAX_MCQ_CHAIN}), suppressing MCQ`);
            return newCount;
          }
          // Insert an MCQ card as an agent message
          setMessages(prevMsgs => {
            const lastMessage = prevMsgs[prevMsgs.length - 1];
            const mcqDataWithMeta: MCQData = {
              ...mcqData,
              selectedValue: null,
              createdAt: new Date().toISOString(),
              status: 'active' as MCQStatus,
            };
            if (lastMessage && lastMessage.role === 'agent' && lastMessage.isStreaming) {
              return [
                ...prevMsgs.slice(0, -1),
                {
                  ...lastMessage,
                  content: mcqData.question,
                  mcqData: mcqDataWithMeta,
                  isStreaming: false,
                }
              ];
            }
            return [...prevMsgs, {
              id: crypto.randomUUID(),
              role: 'agent' as const,
              content: mcqData.question,
              timestamp: new Date(),
              mcqData: mcqDataWithMeta,
              isStreaming: false,
            }];
          });
          return newCount;
        });
        setIsProcessing(false);
        setCurrentPhase('');
        break;
      }

      case 'response_generating':
        setCurrentPhase('response');
        break;

      case 'response_chunk':
        setMessages(prev => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage && lastMessage.role === 'agent' && lastMessage.isStreaming) {
            return [
              ...prev.slice(0, -1),
              {
                ...lastMessage,
                content: (lastMessage.content || '') + (data.text as string || '')
              }
            ];
          }
          return prev;
        });
        break;

      case 'complete':
        const completeData = data as unknown as CompleteEventData;
        const executionTime = `${((Date.now() - startTime) / 1000).toFixed(2)}s`;
        
        setCurrentUnderstanding(prev => ({ ...prev, isComplete: true }));
        setCurrentPhase('');
        
        setMessages(prev => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage && lastMessage.role === 'agent') {
            return [
              ...prev.slice(0, -1),
              {
                ...lastMessage,
                content: completeData.response || lastMessage.content,
                isStreaming: false,
                understanding: {
                  intent: completeData.matchedIntent,
                  reasoning: completeData.reasoning,
                  entities: completeData.extractedEntities,
                  pipelineSteps: completeData.pipelineSteps,
                  enrichments: completeData.enrichments,
                  responseFormat: completeData.responseFormat,
                  toolResults: completeData.mcpToolResults?.map(r => ({
                    tool: r.tool,
                    success: r.success,
                    error: r.error
                  })),
                  isComplete: true,
                  route: { path: completeData.path || 'llm', category: completeData.category },
                },
                usage: completeData.usage,
                executionTime,
                llmModel: completeData.llmModel
              }
            ];
          }
          return prev;
        });
        
        setIsProcessing(false);
        setConversationRefreshKey((prev) => prev + 1);
        break;

      case 'error':
        toast({
          title: 'Error',
          description: data.message as string || 'An error occurred',
          variant: 'destructive'
        });
        setIsProcessing(false);
        setCurrentPhase('');
        break;
    }
  }, []);

  const sendMessage = async () => {
    if (!inputValue.trim() || isProcessing) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date()
    };

    // GAP 3: Free-text override — cancel any active MCQ cards when user sends a new message
    setMessages(prev => prev.map(msg => {
      if (msg.mcqData && msg.mcqData.status === 'active' && !msg.mcqData.selectedValue) {
        return { ...msg, mcqData: { ...msg.mcqData, status: 'overridden' as MCQStatus } };
      }
      return msg;
    }));

    // Reset MCQ chain counter for new query flow
    setMcqChainCount(0);

    // Add user message
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsProcessing(true);
    setCurrentUnderstanding({});
    setCurrentPhase('detecting');

    // Add streaming agent message placeholder
    const agentMessageId = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id: agentMessageId,
      role: 'agent',
      content: '',
      timestamp: new Date(),
      isStreaming: true
    }]);

    const startTime = Date.now();

    try {
      // Cancel any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      // Get the Supabase URL from the client
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      
      const response = await fetch(`${supabaseUrl}/functions/v1/realtime-cfo-agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`
        },
        body: JSON.stringify({
          query: userMessage.content,
          conversationId,
          intents: intents.filter(i => i.isActive).map(i => ({
            id: i.id,
            name: i.name,
            description: i.description,
            moduleId: i.moduleId,
            trainingPhrases: i.trainingPhrases,
            entities: i.entities,
            isActive: i.isActive,
            resolutionFlow: i.resolutionFlow
          })),
          businessContext: {
            country: businessContext.country,
            industry: businessContext.industry,
            entitySize: businessContext.entitySize,
            currency: businessContext.currency,
            fiscalYearEnd: businessContext.fiscalYearEnd
          },
          conversationHistory: messages
            .filter((m) => !m.isStreaming)
            .map((m) => ({
              role: m.role === 'user' ? 'user' : 'assistant',
              content: m.content,
              ...(m.timestamp ? { timestamp: m.timestamp.toISOString() } : {}),
            }))
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Read SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event: SSEEvent = JSON.parse(line.slice(6));
                handleSSEEvent(event, startTime);
              } catch (e) {
                console.error('Failed to parse SSE event:', e);
              }
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log('Request aborted');
        return;
      }

      console.error('CFO Agent error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send message',
        variant: 'destructive'
      });

      // Update the streaming message with error
      setMessages(prev => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage && lastMessage.role === 'agent' && lastMessage.isStreaming) {
          return [
            ...prev.slice(0, -1),
            {
              ...lastMessage,
              content: 'Sorry, I encountered an error processing your request. Please try again.',
              isStreaming: false
            }
          ];
        }
        return prev;
      });
    } finally {
      setIsProcessing(false);
      setCurrentPhase('');
    }
  };

  const handleMCQSelect = useCallback((messageId: string, option: { label: string; value: string; description?: string }) => {
    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId && msg.mcqData) {
        const newStatus: MCQStatus = option.value === 'cancel' ? 'cancelled' : 'resolved';
        return { ...msg, mcqData: { ...msg.mcqData, selectedValue: option.value, status: newStatus } };
      }
      return msg;
    }));

    // If it was a cancellation, just mark it
    if (option.value === 'cancel') return;

    // Re-send the selected option as a user message to continue the flow
    setInputValue(option.label);
    setTimeout(() => {
      setInputValue('');
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: option.label,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userMessage]);
      setInputValue('');
    }, 100);
  }, []);

  const clearChat = () => {
    setMessages([]);
    setCurrentUnderstanding({});
    setCurrentPhase('');
    setConversationId(crypto.randomUUID());
    setMcqChainCount(0);
    setPendingAttachment(null);
  };

  // Voice input handlers
  const toggleVoiceInput = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: 'Not supported', description: 'Voice input is not supported in this browser', variant: 'destructive' });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-IN';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      setInputValue(prev => prev ? `${prev} ${transcript}` : transcript);
      setIsListening(false);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  // File attachment handler
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Max 20MB
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum file size is 20MB', variant: 'destructive' });
      return;
    }

    setPendingAttachment({ file, uploading: true });

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entityId', entityId);
      formData.append('conversationId', conversationId);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/upload-attachment`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setPendingAttachment({ file, fileId: data.fileId, uploading: false });
    } catch (err) {
      toast({ title: 'Upload failed', description: 'Could not upload attachment', variant: 'destructive' });
      setPendingAttachment(null);
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [entityId, conversationId]);

  const handleSelectConversation = async (selectedConvId: string) => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(
        `${supabaseUrl}/functions/v1/get-conversations?conversationId=${encodeURIComponent(selectedConvId)}`,
        {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        const loadedMessages: ChatMessage[] = ((data.messages || []) as Array<{
          id: string;
          role: string;
          content: string;
          timestamp: string;
          metadata?: Record<string, unknown>;
        }>).map((m) => ({
          id: m.id || crypto.randomUUID(),
          role: m.role === 'user' ? 'user' as const : 'agent' as const,
          content: m.content,
          timestamp: new Date(m.timestamp),
          isStreaming: false,
        }));
        setMessages(loadedMessages);
        setConversationId(selectedConvId);
        setCurrentUnderstanding({});
        setCurrentPhase('');
      }
    } catch (e) {
      console.error('Failed to load conversation:', e);
    }
  };

  const handleNewChat = () => {
    clearChat();
  };

  const activeIntents = intents.filter(i => i.isActive);
  const countryConfig = countryConfigs.find(c => c.code === businessContext.country);

  return (
    <div className="h-[calc(100vh-200px)] flex">
      {/* Conversation History Sidebar */}
      <ConversationSidebar
        userId={userId}
        entityId={entityId}
        activeConversationId={conversationId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        refreshKey={conversationRefreshKey}
      />

      <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">CFO Agent</h1>
            <p className="text-sm text-muted-foreground">
              AI-powered financial assistant
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{countryConfig?.flag} {businessContext.country}</span>
            <span>•</span>
            <span>{businessContext.currency}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Database size={12} />
              {activeIntents.length} intents
            </span>
            {mcpTools && mcpTools.length > 0 && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1 text-green-600">
                  <Zap size={12} />
                  {mcpTools.length} MCP tools
                </span>
              </>
            )}
          </div>
          
          <Button 
            variant="ghost" 
            size="sm"
            onClick={clearChat}
            disabled={messages.length === 0}
          >
            <Trash2 size={16} className="mr-1" />
            Clear
          </Button>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <MessageSquare size={32} className="text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Start a Conversation</h2>
            <p className="text-muted-foreground max-w-md mb-6">
              Ask me anything about your financial data. I'll show you exactly how I understand 
              your query and what data I'm fetching.
            </p>
            
            {/* Sample Queries */}
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Try asking:</p>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {activeIntents.slice(0, 4).flatMap(intent => 
                  intent.trainingPhrases.slice(0, 1).map((phrase, idx) => (
                    <button
                      key={`${intent.id}-${idx}`}
                      onClick={() => {
                        setInputValue(phrase);
                        inputRef.current?.focus();
                      }}
                      className="px-3 py-2 text-sm bg-muted hover:bg-muted/80 rounded-lg transition-colors"
                    >
                      {phrase}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onMCQSelect={message.mcqData ? (option) => handleMCQSelect(message.id, option) : undefined}
              />
            ))}
            
            {/* Live Thinking Panel */}
            {isProcessing && Object.keys(currentUnderstanding).length > 0 && (
              <div className="ml-11">
                <AgentThinkingPanel
                  understanding={currentUnderstanding}
                  isProcessing={true}
                  currentPhase={currentPhase}
                />
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t border-border">
        {/* Pending attachment preview */}
        {pendingAttachment && (
          <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-muted rounded-lg text-sm">
            <FileText size={14} className="text-muted-foreground flex-shrink-0" />
            <span className="truncate flex-1">{pendingAttachment.file.name}</span>
            {pendingAttachment.uploading && (
              <Loader2 size={14} className="animate-spin text-muted-foreground" />
            )}
            {!pendingAttachment.uploading && pendingAttachment.fileId && (
              <span className="text-xs text-primary">Ready</span>
            )}
            <button
              onClick={() => setPendingAttachment(null)}
              className="p-0.5 hover:text-foreground text-muted-foreground"
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="flex gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.csv,.xlsx,.xls,.jpg,.jpeg,.png,.doc,.docx"
            onChange={handleFileSelect}
          />
          {/* Attachment button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing || !!pendingAttachment?.uploading}
            title="Attach file"
          >
            <Paperclip size={16} />
          </Button>
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Ask about your financial data..."
            disabled={isProcessing}
            className="flex-1"
          />
          {/* Voice input button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleVoiceInput}
            disabled={isProcessing}
            title={isListening ? 'Stop listening' : 'Voice input'}
            className={isListening ? 'text-destructive animate-pulse' : ''}
          >
            {isListening ? <MicOff size={16} /> : <Mic size={16} />}
          </Button>
          <Button 
            onClick={sendMessage}
            disabled={isProcessing || !inputValue.trim()}
          >
            {isProcessing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </Button>
        </div>
      </div>
      </div>
    </div>
  );
}

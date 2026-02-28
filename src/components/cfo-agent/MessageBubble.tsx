import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { User, Bot, ChevronDown, ChevronUp, Clock, Coins, ThumbsUp, ThumbsDown } from 'lucide-react';
import { ChatMessage } from './types';
import { AgentThinkingPanel } from './AgentThinkingPanel';
import { MCQCard } from './MCQCard';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface MessageBubbleProps {
  message: ChatMessage;
  onMCQSelect?: (option: { label: string; value: string; description?: string }) => void;
}

export function MessageBubble({ message, onMCQSelect }: MessageBubbleProps) {
  const [showUnderstanding, setShowUnderstanding] = useState(
    message.role === 'agent' && message.understanding?.intent !== undefined
  );
  const [feedback, setFeedback] = useState<'positive' | 'negative' | null>(null);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  
  const isUser = message.role === 'user';

  const submitFeedback = async (type: 'positive' | 'negative') => {
    if (feedbackSubmitting || feedback) return;
    setFeedbackSubmitting(true);
    try {
      await supabase.functions.invoke('submit-feedback', {
        body: { messageId: message.id, feedback: type },
      });
      setFeedback(type);
    } catch {
      // Silent fail
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      {/* Avatar */}
      <div className={cn(
        "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
        isUser 
          ? "bg-primary text-primary-foreground" 
          : "bg-muted text-muted-foreground"
      )}>
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      {/* Message Content */}
      <div className={cn("flex-1 max-w-[80%]", isUser && "flex flex-col items-end")}>
        {/* Understanding Panel for Agent Messages */}
        {!isUser && message.understanding && showUnderstanding && (
          <div className="mb-3 w-full">
            <AgentThinkingPanel 
              understanding={message.understanding}
              isProcessing={message.isStreaming || false}
              currentPhase={message.understanding.isComplete ? 'response' : 'detecting'}
            />
          </div>
        )}

        {/* MCQ Card */}
        {!isUser && message.mcqData && onMCQSelect && (
          <div className="mb-3 w-full">
            <MCQCard
              mcqId={message.mcqData.mcqId}
              mcqType={message.mcqData.mcqType}
              question={message.mcqData.question}
              options={message.mcqData.options}
              onSelect={onMCQSelect}
              selectedValue={message.mcqData.selectedValue}
              createdAt={message.mcqData.createdAt}
              status={message.mcqData.status}
            />
          </div>
        )}

        {/* Message Bubble - hide if MCQ card is shown */}
        {!(message.mcqData && onMCQSelect) && (
          <div className={cn(
            "rounded-2xl px-4 py-3",
            isUser 
              ? "bg-primary text-primary-foreground rounded-br-md" 
              : "bg-muted text-foreground rounded-bl-md"
          )}>
            {message.isStreaming && !message.content ? (
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-sm opacity-70">Thinking...</span>
              </div>
            ) : isUser ? (
              <div className="whitespace-pre-wrap text-sm">{message.content}</div>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_table]:text-xs [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_code]:text-xs [&_code]:bg-muted/50 [&_code]:px-1 [&_code]:rounded">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* Message Metadata */}
        <div className={cn(
          "flex items-center gap-3 mt-1 text-xs text-muted-foreground",
          isUser && "flex-row-reverse"
        )}>
          <span className="flex items-center gap-1">
            <Clock size={10} />
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          
          {!isUser && message.executionTime && (
            <span>{message.executionTime}</span>
          )}
          
          {!isUser && message.usage && (
            <span className="flex items-center gap-1" title="Tokens used">
              <Coins size={10} />
              {message.usage.total_tokens}
            </span>
          )}

          {/* Feedback buttons */}
          {!isUser && message.understanding?.isComplete && !message.isStreaming && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => submitFeedback('positive')}
                disabled={!!feedback || feedbackSubmitting}
                className={cn(
                  "p-1 rounded transition-colors",
                  feedback === 'positive'
                    ? "text-green-600 dark:text-green-400"
                    : "hover:text-foreground"
                )}
                title="Helpful"
              >
                <ThumbsUp size={12} />
              </button>
              <button
                onClick={() => submitFeedback('negative')}
                disabled={!!feedback || feedbackSubmitting}
                className={cn(
                  "p-1 rounded transition-colors",
                  feedback === 'negative'
                    ? "text-red-600 dark:text-red-400"
                    : "hover:text-foreground"
                )}
                title="Not helpful"
              >
                <ThumbsDown size={12} />
              </button>
            </div>
          )}

          {!isUser && message.understanding && (
            <button
              onClick={() => setShowUnderstanding(!showUnderstanding)}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
              {showUnderstanding ? (
                <>
                  <ChevronUp size={12} />
                  Hide thinking
                </>
              ) : (
                <>
                  <ChevronDown size={12} />
                  Show thinking
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

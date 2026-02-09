import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Brain, User } from 'lucide-react';

const DEMO_CONVERSATIONS = [
  {
    prompt: 'What are my pending sales invoices?',
    response:
      'You have 12 pending invoices totaling ₹4,52,300. The oldest is from Acme Corp (45 days overdue, ₹1,20,000). Want me to break it down by customer?',
  },
  {
    prompt: 'Show GST liability for this month',
    response:
      'Your GSTR-1 liability for Jan 2026: CGST ₹84,200 | SGST ₹84,200 | IGST ₹1,42,500. Total: ₹3,10,900. Filing deadline: Feb 11.',
  },
  {
    prompt: 'Compare this quarter revenue with last quarter',
    response:
      'Q4 revenue: ₹28.4L (up 18.2% from Q3\'s ₹24.0L). Top growth: Electronics (+32%), Services (+14%). Biggest decline: Raw Materials (-8%).',
  },
  {
    prompt: 'Show items below reorder level',
    response:
      '7 items below reorder level: Steel Rod (Stock: 20, Min: 100), Copper Wire (Stock: 5, Min: 50), Bearing 6205 (Stock: 12, Min: 40)... Shall I create purchase orders?',
  },
  {
    prompt: 'What is my best selling item this year?',
    response:
      "Your top seller is 'Premium Widget A' with 2,847 units sold (₹14.2L revenue). It accounts for 22% of total sales. Next best: 'Service Plan Gold' at 1,203 units.",
  },
];

type Phase = 'typing-prompt' | 'thinking' | 'typing-response' | 'pausing';

const LiveDemoSection = () => {
  const [currentDemo, setCurrentDemo] = useState(0);
  const [displayedPrompt, setDisplayedPrompt] = useState('');
  const [displayedResponse, setDisplayedResponse] = useState('');
  const [phase, setPhase] = useState<Phase>('typing-prompt');

  useEffect(() => {
    const convo = DEMO_CONVERSATIONS[currentDemo];

    if (phase === 'typing-prompt') {
      if (displayedPrompt.length < convo.prompt.length) {
        const timer = setTimeout(() => {
          setDisplayedPrompt(convo.prompt.slice(0, displayedPrompt.length + 1));
        }, 40);
        return () => clearTimeout(timer);
      } else {
        const timer = setTimeout(() => setPhase('thinking'), 300);
        return () => clearTimeout(timer);
      }
    }

    if (phase === 'thinking') {
      const timer = setTimeout(() => setPhase('typing-response'), 1500);
      return () => clearTimeout(timer);
    }

    if (phase === 'typing-response') {
      if (displayedResponse.length < convo.response.length) {
        const timer = setTimeout(() => {
          setDisplayedResponse(convo.response.slice(0, displayedResponse.length + 1));
        }, 18);
        return () => clearTimeout(timer);
      } else {
        const timer = setTimeout(() => setPhase('pausing'), 500);
        return () => clearTimeout(timer);
      }
    }

    if (phase === 'pausing') {
      const timer = setTimeout(() => {
        setCurrentDemo((prev) => (prev + 1) % DEMO_CONVERSATIONS.length);
        setDisplayedPrompt('');
        setDisplayedResponse('');
        setPhase('typing-prompt');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [phase, displayedPrompt, displayedResponse, currentDemo]);

  const cursor = (
    <span className="inline-block w-0.5 h-4 bg-foreground animate-pulse ml-0.5 align-text-bottom" />
  );

  return (
    <section id="demo" className="py-20 lg:py-28 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <Badge variant="outline" className="mb-4 text-xs">
            See It In Action
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Watch the CFO Agent Work
          </h2>
          <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
            Ask a question in plain English — get instant, data-backed answers.
          </p>
        </div>

        <div className="max-w-2xl mx-auto">
          <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
            {/* Title bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-destructive/60" />
                  <div className="w-3 h-3 rounded-full bg-warning/60" />
                  <div className="w-3 h-3 rounded-full bg-success/60" />
                </div>
                <span className="text-xs text-muted-foreground ml-2">CFO Agent</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span className="text-[10px] text-muted-foreground font-medium">Live Demo</span>
              </div>
            </div>

            {/* Chat area */}
            <div className="p-5 min-h-[220px] flex flex-col justify-end gap-4">
              {/* User prompt */}
              {displayedPrompt && (
                <div className="flex justify-end">
                  <div className="flex items-start gap-2 max-w-[85%]">
                    <div className="rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground leading-relaxed">
                      {displayedPrompt}
                      {phase === 'typing-prompt' && cursor}
                    </div>
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center mt-0.5">
                      <User className="h-3.5 w-3.5 text-primary" />
                    </div>
                  </div>
                </div>
              )}

              {/* Thinking indicator */}
              {phase === 'thinking' && (
                <div className="flex justify-start">
                  <div className="flex items-start gap-2 max-w-[85%]">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-ai/20 flex items-center justify-center mt-0.5">
                      <Brain className="h-3.5 w-3.5 text-ai" />
                    </div>
                    <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-3 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}

              {/* Agent response */}
              {(phase === 'typing-response' || phase === 'pausing') && displayedResponse && (
                <div className="flex justify-start">
                  <div className="flex items-start gap-2 max-w-[85%]">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-ai/20 flex items-center justify-center mt-0.5">
                      <Brain className="h-3.5 w-3.5 text-ai" />
                    </div>
                    <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5 text-sm text-foreground leading-relaxed">
                      {displayedResponse}
                      {phase === 'typing-response' && cursor}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Demo counter */}
            <div className="px-5 pb-3 flex justify-center gap-1.5">
              {DEMO_CONVERSATIONS.map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    i === currentDemo ? 'bg-primary' : 'bg-border'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LiveDemoSection;

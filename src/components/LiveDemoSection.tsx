import { useState, useEffect } from 'react';
import { User, Send, Paperclip, Mic, Camera, TrendingUp, Sparkles } from 'lucide-react';
import munimjiAvatar from '@/assets/munimji.png';

const DEMO_CONVERSATIONS = [
  {
    prompt: 'What are my pending sales invoices?',
    response:
      'You have **12 pending invoices** totaling ₹4,52,300. The oldest is from Acme Corp (45 days overdue, ₹1,20,000). Want me to break it down by customer?',
  },
  {
    prompt: 'Show GST liability for this month',
    response:
      'Your GSTR-1 liability for Jan 2026:\n\nCGST ₹84,200 | SGST ₹84,200 | IGST ₹1,42,500\n\n**Total: ₹3,10,900.** Filing deadline: Feb 11.',
  },
  {
    prompt: 'Compare this quarter revenue with last quarter',
    response:
      'Q4 revenue: **₹28.4L** (up 18.2% from Q3\'s ₹24.0L). Top growth: Electronics (+32%), Services (+14%). Biggest decline: Raw Materials (-8%).',
  },
  {
    prompt: 'What is my best selling item this year?',
    response:
      'Your top seller is **Premium Widget A** with 2,847 units sold (₹14.2L revenue). It accounts for 22% of total sales.',
  },
  {
    prompt: 'Show items below reorder level',
    response:
      '**7 items** below reorder level: Steel Rod (Stock: 20, Min: 100), Copper Wire (Stock: 5, Min: 50), Bearing 6205 (Stock: 12, Min: 40)… Shall I create purchase orders?',
  },
];

const SUGGESTION_CHIPS = [
  { icon: TrendingUp, label: 'Forecast cash flow for next 6 months' },
  { icon: Sparkles, label: 'Analyze quarterly financial performance' },
];

type Phase = 'typing-prompt' | 'thinking' | 'typing-response' | 'pausing';

const LiveDemoSection = ({ embedded = false }: { embedded?: boolean }) => {
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
    <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom" />
  );

  // Simple inline bold renderer for **text**
  const renderBold = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  const chatCard = (
    <div className="rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
      {/* Header bar — matching reference */}
      <div className="flex items-center justify-between px-4 py-3 bg-primary">
        <div className="flex items-center gap-3">
          <img
            src={munimjiAvatar}
            alt="Munimji"
            className="w-8 h-8 rounded-full object-cover border-2 border-primary-foreground/30"
          />
          <div className="flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-primary-foreground/80" />
            <span className="text-sm font-semibold text-primary-foreground">CFO Advisory</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="text-[10px] text-primary-foreground/70 font-medium">Live</span>
        </div>
      </div>

      {/* Progress bar accent */}
      <div className="h-0.5 bg-muted">
        <div className="h-full bg-primary/40 transition-all duration-1000" style={{ width: `${((currentDemo + 1) / DEMO_CONVERSATIONS.length) * 100}%` }} />
      </div>

      {/* Chat area */}
      <div className="p-5 min-h-[260px] max-h-[300px] flex flex-col justify-start gap-4 bg-background overflow-hidden">
        {/* Munimji greeting — always visible */}
        {phase === 'typing-prompt' && displayedPrompt.length === 0 && (
          <div className="flex items-start gap-2.5">
            <img
              src={munimjiAvatar}
              alt="Munimji"
              className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-0.5"
            />
            <div>
              <span className="text-xs font-semibold text-foreground mb-1 block">Munimji</span>
              <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-3 text-sm text-foreground leading-relaxed max-w-[90%]">
                <p>Namaste! 🙏</p>
                <p className="mt-1">I'm your <strong>Munimji</strong> (CFO Advisory).</p>
                <p className="mt-1">Ask me about <strong>cash flow</strong>, <strong>P&L</strong>, or <strong>revenue</strong>.</p>
                <p className="mt-1 text-muted-foreground italic text-xs">Try: "What's our total revenue this quarter?"</p>
              </div>
              <span className="text-[10px] text-muted-foreground mt-1 block">just now</span>
            </div>
          </div>
        )}

        {/* User message */}
        {displayedPrompt && (
          <div className="flex justify-end">
            <div className="flex items-start gap-2 max-w-[80%]">
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
          <div className="flex items-start gap-2.5">
            <img
              src={munimjiAvatar}
              alt="Munimji"
              className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-0.5"
            />
            <div>
              <span className="text-xs font-semibold text-foreground mb-1 block">Munimji</span>
              <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-3 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        {/* AI response */}
        {(phase === 'typing-response' || phase === 'pausing') && displayedResponse && (
          <div className="flex items-start gap-2.5">
            <img
              src={munimjiAvatar}
              alt="Munimji"
              className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-0.5"
            />
            <div>
              <span className="text-xs font-semibold text-foreground mb-1 block">Munimji</span>
              <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5 text-sm text-foreground leading-relaxed max-w-[90%]">
                {renderBold(displayedResponse)}
                {phase === 'typing-response' && cursor}
              </div>
              {phase === 'pausing' && (
                <span className="text-[10px] text-muted-foreground mt-1 block">just now</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Suggestion chips */}
      <div className="px-4 pb-2 flex gap-2 bg-background">
        {SUGGESTION_CHIPS.map((chip) => (
          <div
            key={chip.label}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-muted/50 hover:bg-accent/50 transition-colors cursor-pointer flex-1"
          >
            <chip.icon className="h-3.5 w-3.5 text-primary flex-shrink-0" />
            <span className="text-[11px] text-foreground leading-tight">{chip.label}</span>
          </div>
        ))}
      </div>

      {/* Input bar */}
      <div className="px-4 pb-4 pt-2 bg-background">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-border bg-muted/30">
          <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <span className="text-primary text-xs font-bold">+</span>
          </div>
          <span className="text-sm text-muted-foreground flex-1">Ask me anything...</span>
          <div className="flex items-center gap-2 text-muted-foreground/60">
            <Paperclip className="h-4 w-4" />
            <Mic className="h-4 w-4" />
            <Camera className="h-4 w-4" />
            <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
              <Send className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
          </div>
        </div>
      </div>

      {/* Demo counter dots */}
      <div className="pb-3 flex justify-center gap-1.5 bg-background">
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
  );

  if (embedded) {
    return chatCard;
  }

  return (
    <section id="demo" className="py-20 lg:py-28 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Watch the CFO Agent Work
          </h2>
          <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
            Ask a question in plain English — get instant, data-backed answers.
          </p>
        </div>
        <div className="max-w-2xl mx-auto">{chatCard}</div>
      </div>
    </section>
  );
};

export default LiveDemoSection;

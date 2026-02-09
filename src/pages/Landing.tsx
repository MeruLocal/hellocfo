import { useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Brain,
  MessageSquare,
  Layers,
  GitBranch,
  TestTube,
  Terminal,
  ArrowRight,
  Zap,
  BarChart3,
  Shield,
  Settings,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  TrendingUp,
  Package,
  Receipt,
  FileText,
  Building2,
  Wallet,
  Truck,
  BookOpen,
  HardDrive,
  MessageCircle,
  ListTodo,
  LayoutDashboard,
  DollarSign,
} from 'lucide-react';

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Modules', href: '#modules' },
];

const FEATURES = [
  {
    icon: Brain,
    title: 'AI Intent Engine',
    description:
      'Auto-generate query intents with training phrases, entities, and resolution pipelines using advanced AI models.',
    color: 'text-ai',
  },
  {
    icon: MessageSquare,
    title: 'Real-time CFO Agent',
    description:
      'Conversational AI that resolves financial queries in real-time with server-sent event streaming.',
    color: 'text-primary',
  },
  {
    icon: Layers,
    title: 'Multi-Module Coverage',
    description:
      '14+ modules including Sales, GST, Inventory, Purchases, Reports, Fixed Assets, and more.',
    color: 'text-success',
  },
  {
    icon: GitBranch,
    title: 'Smart Data Pipeline',
    description:
      'Visual pipeline builder with MCP tool integration for intelligent data fetching and computation.',
    color: 'text-warning',
  },
  {
    icon: TestTube,
    title: 'Test Cases Library',
    description:
      '150+ pre-built test cases with export to Markdown and CSV for comprehensive system validation.',
    color: 'text-info',
  },
  {
    icon: Terminal,
    title: 'API Console',
    description:
      'Built-in API testing console with live request/response inspection and authentication support.',
    color: 'text-destructive',
  },
];

const STEPS = [
  {
    number: '01',
    title: 'Configure Intents & Modules',
    description:
      'Set up your financial modules and define query intents that map to your business workflows.',
    icon: Settings,
  },
  {
    number: '02',
    title: 'AI Generates Everything',
    description:
      'Our AI engine generates training phrases, extracts entities, and builds resolution pipelines automatically.',
    icon: Sparkles,
  },
  {
    number: '03',
    title: 'Resolve Queries in Real-time',
    description:
      'Users ask natural language questions and the CFO agent resolves them instantly with accurate data.',
    icon: Zap,
  },
];

const MODULES = [
  { name: 'Sales', icon: TrendingUp },
  { name: 'Purchases', icon: Package },
  { name: 'GST', icon: Receipt },
  { name: 'Inventory', icon: Package },
  { name: 'Reports', icon: FileText },
  { name: 'Fixed Assets', icon: Building2 },
  { name: 'Expense Claim', icon: Wallet },
  { name: 'Accounting', icon: BookOpen },
  { name: 'Eway Bills', icon: Truck },
  { name: 'Drive', icon: HardDrive },
  { name: 'Comments', icon: MessageCircle },
  { name: 'Tasks', icon: ListTodo },
  { name: 'Workspace', icon: LayoutDashboard },
  { name: 'Taxes', icon: DollarSign },
];

const STATS = [
  { value: '14+', label: 'Modules' },
  { value: '150+', label: 'Test Cases' },
  { value: 'Real-time', label: 'Streaming' },
  { value: 'AI-Powered', label: 'Engine' },
];

const Landing = () => {
  const navigate = useNavigate();
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-visible');
          }
        });
      },
      { threshold: 0.1 }
    );

    document.querySelectorAll('.animate-on-scroll').forEach((el) => {
      observerRef.current?.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight">HelloCFO</span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <button
                key={link.href}
                onClick={() => scrollTo(link.href.replace('#', ''))}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/auth">Sign In</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/auth">
                Get Started <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 lg:pt-44 lg:pb-32">
        {/* Background grid */}
        <div
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage:
              'linear-gradient(hsl(var(--border)/0.4) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)/0.4) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-background/95 to-background" />
        {/* Gradient blob */}
        <div className="absolute top-20 left-1/2 -translate-x-1/2 -z-10 w-[600px] h-[400px] rounded-full bg-primary/10 blur-[120px]" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-xs font-medium gap-1.5">
            <Sparkles className="h-3 w-3" /> AI-Powered Financial Intelligence
          </Badge>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1] max-w-4xl mx-auto">
            Your AI-Powered CFO,{' '}
            <span className="bg-gradient-to-r from-primary to-ai bg-clip-text text-transparent">
              Always On Duty
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Resolve complex financial queries in real-time. HelloCFO combines AI intent engines,
            multi-module data pipelines, and conversational agents to automate your CFO workflows.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="px-8 text-base" asChild>
              <Link to="/auth">
                Get Started Free <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="px-8 text-base"
              onClick={() => scrollTo('features')}
            >
              See Features
            </Button>
          </div>

          {/* Mock dashboard illustration */}
          <div className="mt-16 max-w-4xl mx-auto">
            <div className="relative rounded-xl border border-border bg-card shadow-lg overflow-hidden">
              {/* Title bar */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/50">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-destructive/60" />
                  <div className="w-3 h-3 rounded-full bg-warning/60" />
                  <div className="w-3 h-3 rounded-full bg-success/60" />
                </div>
                <span className="text-xs text-muted-foreground ml-2">HelloCFO Dashboard</span>
              </div>
              {/* Content grid */}
              <div className="p-6 grid grid-cols-3 gap-4">
                {/* Sidebar mock */}
                <div className="col-span-1 space-y-3">
                  {['Intents', 'Modules', 'Pipeline', 'Agent', 'Cases'].map((item) => (
                    <div
                      key={item}
                      className="h-8 rounded-md bg-muted flex items-center px-3 text-xs text-muted-foreground"
                    >
                      {item}
                    </div>
                  ))}
                </div>
                {/* Main content mock */}
                <div className="col-span-2 space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg bg-primary/10 p-4 text-center">
                      <div className="text-2xl font-bold text-primary">247</div>
                      <div className="text-xs text-muted-foreground mt-1">Active Intents</div>
                    </div>
                    <div className="rounded-lg bg-success/10 p-4 text-center">
                      <div className="text-2xl font-bold text-success">98.2%</div>
                      <div className="text-xs text-muted-foreground mt-1">Accuracy</div>
                    </div>
                    <div className="rounded-lg bg-ai/10 p-4 text-center">
                      <div className="text-2xl font-bold text-ai">1.2s</div>
                      <div className="text-xs text-muted-foreground mt-1">Avg Response</div>
                    </div>
                  </div>
                  <div className="h-32 rounded-lg bg-muted/50 border border-border flex items-center justify-center text-xs text-muted-foreground">
                    Real-time query resolution stream
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4 text-xs">
              Core Capabilities
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Everything You Need to Automate Finance
            </h2>
            <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
              A comprehensive platform that combines AI, data pipelines, and real-time agents into
              one powerful system.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature) => (
              <Card
                key={feature.title}
                className="group hover:shadow-md transition-all duration-200 hover:-translate-y-1 border-border/60"
              >
                <CardContent className="p-6">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <feature.icon className={`h-5 w-5 ${feature.color}`} />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 lg:py-28 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4 text-xs">
              Simple Workflow
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              How HelloCFO Works
            </h2>
            <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
              Three simple steps from setup to real-time financial query resolution.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            {STEPS.map((step, i) => (
              <div key={step.number} className="relative text-center">
                {i < STEPS.length - 1 && (
                  <div className="hidden md:block absolute top-12 left-[60%] w-[80%] border-t-2 border-dashed border-border" />
                )}
                <div className="inline-flex h-14 w-14 rounded-2xl bg-primary/10 items-center justify-center mb-5">
                  <step.icon className="h-6 w-6 text-primary" />
                </div>
                <div className="text-xs font-bold text-primary mb-2">{step.number}</div>
                <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Modules Showcase */}
      <section id="modules" className="py-20 lg:py-28 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center mb-12">
          <Badge variant="outline" className="mb-4 text-xs">
            Comprehensive Coverage
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            14+ Financial Modules
          </h2>
          <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
            From sales and purchases to GST compliance and fixed assets — every module your
            finance team needs.
          </p>
        </div>

        {/* Scrolling row */}
        <div className="relative">
          <div className="flex gap-4 animate-scroll">
            {[...MODULES, ...MODULES].map((mod, i) => (
              <div
                key={`${mod.name}-${i}`}
                className="flex-shrink-0 flex items-center gap-2.5 px-5 py-3 rounded-full border border-border bg-card hover:bg-accent/50 transition-colors"
              >
                <mod.icon className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium whitespace-nowrap">{mod.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 lg:py-20 bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-primary to-ai bg-clip-text text-transparent">
                  {stat.value}
                </div>
                <div className="mt-1 text-sm text-muted-foreground font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <section className="py-20 lg:py-28">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Ready to Transform Your Finance Operations?
          </h2>
          <p className="mt-4 text-muted-foreground max-w-lg mx-auto">
            Start using HelloCFO today and let AI handle your financial queries, reporting, and
            compliance workflows.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="px-10 text-base" asChild>
              <Link to="/auth">
                Start Using HelloCFO <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="mt-6 flex items-center justify-center gap-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" /> No credit card required
            </span>
            <span className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-primary" /> Enterprise-grade security
            </span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-primary flex items-center justify-center">
              <BarChart3 className="h-3 w-3 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold">HelloCFO</span>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} HelloCFO. All rights reserved.
          </p>
        </div>
      </footer>

      <style>{`
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-scroll {
          animation: scroll 30s linear infinite;
        }
        .animate-scroll:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
};

export default Landing;

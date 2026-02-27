import React, { useState, useRef, useEffect } from 'react';
import { Play, RotateCcw, Copy, Check, LogIn, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface HelloBooksOrg {
  _id: string;
  Name: string;
  BusinessId?: string;
}

interface HelloBooksEntity {
  _id: string;
  Name: string;
  OrganizationId: string;
}

interface LiveTestPanelProps {
  onExecute: (query: string, entityId: string, orgId: string) => void;
  onClear: () => void;
  onCopyReport: () => void;
  isRunning: boolean;
  hasRun: boolean;
}

export function LiveTestPanel({ onExecute, onClear, onCopyReport, isRunning, hasRun }: LiveTestPanelProps) {
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // HelloBooks auth state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Org/Entity state
  const [organizations, setOrganizations] = useState<HelloBooksOrg[]>([]);
  const [entities, setEntities] = useState<HelloBooksEntity[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState('');

  const isLoggedIn = !!authToken;
  const filteredEntities = selectedOrgId
    ? entities.filter(e => e.OrganizationId === selectedOrgId)
    : entities;

  // Auto-select first org/entity
  useEffect(() => {
    if (!selectedOrgId && organizations.length > 0) {
      setSelectedOrgId(organizations[0]._id);
    }
  }, [organizations, selectedOrgId]);

  useEffect(() => {
    if (selectedOrgId && !selectedEntityId && filteredEntities.length > 0) {
      setSelectedEntityId(filteredEntities[0]._id);
    }
  }, [selectedOrgId, filteredEntities, selectedEntityId]);

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoginLoading(true);
    setLoginError('');

    try {
      // Login via proxy
      const { data: loginData, error: loginErr } = await supabase.functions.invoke('hellobooks-proxy', {
        body: { action: 'login', email, password },
      });
      if (loginErr || !loginData?.token) throw new Error(loginErr?.message || 'Login failed');

      setAuthToken(loginData.token);

      // Fetch organizations & entities
      const { data: entData, error: entErr } = await supabase.functions.invoke('hellobooks-proxy', {
        body: { action: 'get_organizations', token: loginData.token },
      });
      if (entErr) throw entErr;

      if (entData?.organizations && Array.isArray(entData.organizations)) {
        const str = (v: any): string => {
          if (!v) return '';
          if (typeof v === 'string') return v;
          if (typeof v === 'object' && v.Name) return v.Name;
          return String(v);
        };

        const mappedOrgs: HelloBooksOrg[] = entData.organizations.map((org: any) => ({
          _id: org._id,
          Name: str(org.Name),
          BusinessId: org.BusinessId,
        }));
        setOrganizations(mappedOrgs);

        const mappedEntities: HelloBooksEntity[] = [];
        for (const org of entData.organizations) {
          if (org.Entities && Array.isArray(org.Entities)) {
            for (const entity of org.Entities) {
              mappedEntities.push({
                _id: entity._id || entity.id,
                Name: str(entity.Name),
                OrganizationId: org._id,
              });
            }
          }
        }
        setEntities(mappedEntities);
        toast({ title: `Loaded ${mappedEntities.length} entities across ${mappedOrgs.length} orgs` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setLoginError(msg);
      toast({ title: 'Login failed', description: msg, variant: 'destructive' });
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    setAuthToken('');
    setOrganizations([]);
    setEntities([]);
    setSelectedOrgId('');
    setSelectedEntityId('');
  };

  const handleExecute = () => {
    if (!query.trim() || isRunning || !selectedEntityId || !selectedOrgId) return;
    onExecute(query.trim(), selectedEntityId, selectedOrgId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleExecute();
    }
  };

  const handleCopy = () => {
    onCopyReport();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="border rounded-lg bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground tracking-wide uppercase">Live Test Panel</h2>
        <div className="flex items-center gap-2">
          {isLoggedIn && (
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-foreground h-7 text-xs">
              <LogOut className="h-3 w-3 mr-1" />
              Logout
            </Button>
          )}
          {hasRun && (
            <Button variant="ghost" size="sm" onClick={handleCopy} className="text-muted-foreground hover:text-foreground h-7 text-xs">
              {copied ? <Check className="h-3 w-3 mr-1 text-emerald-500" /> : <Copy className="h-3 w-3 mr-1" />}
              Copy Report
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground hover:text-foreground h-7 text-xs">
            <RotateCcw className="h-3 w-3 mr-1" />
            Clear
          </Button>
        </div>
      </div>

      {/* Login section if not authenticated */}
      {!isLoggedIn && (
        <div className="border rounded-md bg-muted/20 p-3 space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Login to HelloBooks to load organizations & entities</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className="px-3 py-1.5 border rounded-md text-xs bg-background text-foreground"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className="px-3 py-1.5 border rounded-md text-xs bg-background text-foreground"
            />
          </div>
          {loginError && <p className="text-xs text-destructive">{loginError}</p>}
          <Button
            onClick={handleLogin}
            disabled={loginLoading || !email || !password}
            size="sm"
            className="h-7 text-xs"
          >
            {loginLoading ? 'Logging in…' : <><LogIn className="h-3 w-3 mr-1" /> Login</>}
          </Button>
        </div>
      )}

      <Textarea
        ref={textareaRef}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Enter query to debug… (Ctrl+Enter to execute)"
        className="bg-muted/30 border text-foreground font-mono text-sm min-h-[60px] resize-none placeholder:text-muted-foreground focus-visible:ring-primary/50"
        disabled={isRunning}
      />

      <div className="flex items-end gap-3">
        <div className="flex-1 grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Organization</label>
            <Select
              value={selectedOrgId}
              onValueChange={v => { setSelectedOrgId(v); setSelectedEntityId(''); }}
              disabled={!isLoggedIn}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={isLoggedIn ? "Select org" : "Login first"} />
              </SelectTrigger>
              <SelectContent>
                {organizations.map(o => (
                  <SelectItem key={o._id} value={o._id} className="text-xs">
                    {o.Name}{o.BusinessId ? ` (${o.BusinessId})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Entity</label>
            <Select
              value={selectedEntityId}
              onValueChange={setSelectedEntityId}
              disabled={!isLoggedIn || !selectedOrgId}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={!isLoggedIn ? "Login first" : !selectedOrgId ? "Select org first" : "Select entity"} />
              </SelectTrigger>
              <SelectContent>
                {filteredEntities.map(e => (
                  <SelectItem key={e._id} value={e._id} className="text-xs">
                    {e.Name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          onClick={handleExecute}
          disabled={!query.trim() || isRunning || !selectedEntityId || !selectedOrgId}
          className="bg-primary hover:bg-primary/90 text-primary-foreground h-8 px-4 text-xs shrink-0"
        >
          {isRunning ? (
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Running…
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Play className="h-3 w-3" />
              Execute
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { Play, RotateCcw, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useAllEntities } from '@/hooks/useEntityDetails';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface LiveTestPanelProps {
  onExecute: (query: string, entityId: string, orgId: string) => void;
  onClear: () => void;
  onCopyReport: () => void;
  isRunning: boolean;
  hasRun: boolean;
}

export function LiveTestPanel({ onExecute, onClear, onCopyReport, isRunning, hasRun }: LiveTestPanelProps) {
  const [query, setQuery] = useState('');
  const [entityId, setEntityId] = useState('');
  const [orgId, setOrgId] = useState('');
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { data: entityData } = useAllEntities();

  const organizations = entityData?.organizations || [];
  const entities = entityData?.entities || [];
  const filteredEntities = orgId ? entities.filter(e => e.org_id === orgId) : entities;

  // Auto-select first org/entity
  useEffect(() => {
    if (!orgId && organizations.length > 0) {
      setOrgId(organizations[0].org_id);
    }
  }, [organizations, orgId]);

  useEffect(() => {
    if (orgId && !entityId && filteredEntities.length > 0) {
      setEntityId(filteredEntities[0].entity_id);
    }
  }, [orgId, filteredEntities, entityId]);

  const handleExecute = () => {
    if (!query.trim() || isRunning) return;
    onExecute(query.trim(), entityId || 'default', orgId || '');
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
    <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-200 tracking-wide uppercase">Live Test Panel</h2>
        <div className="flex items-center gap-2">
          {hasRun && (
            <Button variant="ghost" size="sm" onClick={handleCopy} className="text-zinc-400 hover:text-zinc-200 h-7 text-xs">
              {copied ? <Check className="h-3 w-3 mr-1 text-emerald-400" /> : <Copy className="h-3 w-3 mr-1" />}
              Copy Report
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClear} className="text-zinc-400 hover:text-zinc-200 h-7 text-xs">
            <RotateCcw className="h-3 w-3 mr-1" />
            Clear
          </Button>
        </div>
      </div>

      <Textarea
        ref={textareaRef}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Enter query to debug… (Ctrl+Enter to execute)"
        className="bg-zinc-950 border-zinc-700 text-zinc-200 font-mono text-sm min-h-[60px] resize-none placeholder:text-zinc-600 focus-visible:ring-blue-500/50"
        disabled={isRunning}
      />

      <div className="flex items-end gap-3">
        <div className="flex-1 grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Organization</label>
            <Select value={orgId} onValueChange={v => { setOrgId(v); setEntityId(''); }}>
              <SelectTrigger className="bg-zinc-950 border-zinc-700 text-zinc-300 h-8 text-xs">
                <SelectValue placeholder="Select org" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700">
                {organizations.map(o => (
                  <SelectItem key={o.org_id} value={o.org_id} className="text-zinc-300 text-xs">
                    {o.org_name || o.org_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Entity</label>
            <Select value={entityId} onValueChange={setEntityId}>
              <SelectTrigger className="bg-zinc-950 border-zinc-700 text-zinc-300 h-8 text-xs">
                <SelectValue placeholder="Select entity" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700">
                {filteredEntities.map(e => (
                  <SelectItem key={e.entity_id} value={e.entity_id} className="text-zinc-300 text-xs">
                    {e.entity_name || e.entity_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          onClick={handleExecute}
          disabled={!query.trim() || isRunning}
          className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-4 text-xs shrink-0"
        >
          {isRunning ? (
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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

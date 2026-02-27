import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type ToolStatus = 'exists' | 'missing' | 'partial';

interface AuditTool {
  requiredName: string;
  chain: string;
  status: ToolStatus;
  actualName: string | null;
  priority: 'P1' | 'P2' | 'P3';
  notes: string;
}

const AUDIT_DATA: AuditTool[] = [
  // Pre-Req Chain: send_invoice
  { requiredName: 'get_invoice', chain: 'send_invoice', status: 'exists', actualName: 'get_invoice_by_id', priority: 'P2', notes: 'Takes InvoiceId (UUID). Returns ContactId, Status, Total.' },
  { requiredName: 'get_contact', chain: 'send_invoice', status: 'exists', actualName: 'get_customer_by_id', priority: 'P2', notes: 'Use get_customer_by_id or get_vendor_by_id. Returns EmailAddress, Name.' },
  { requiredName: 'send_invoice', chain: 'send_invoice', status: 'missing', actualName: null, priority: 'P2', notes: 'Write tool — not available in MCP. Cannot send invoices via email.' },

  // Pre-Req Chain: create_payment
  { requiredName: 'get_bill_by_number', chain: 'create_payment', status: 'exists', actualName: 'find_bill', priority: 'P1', notes: 'find_bill takes BillNumber string. Returns BillId, Total, AmountDue.' },
  { requiredName: 'get_accounts', chain: 'create_payment', status: 'exists', actualName: 'get_charts_of_accounts', priority: 'P1', notes: 'Returns all accounts. Filter by Type for BANK accounts.' },
  { requiredName: 'get_all_invoices', chain: 'create_payment', status: 'exists', actualName: 'get_invoices', priority: 'P1', notes: 'List/search invoices with filters.' },
  { requiredName: 'get_all_bills', chain: 'create_payment', status: 'exists', actualName: 'get_bills', priority: 'P1', notes: 'List/search bills with filters.' },
  { requiredName: 'create_payment', chain: 'create_payment', status: 'exists', actualName: 'create_payment', priority: 'P1', notes: 'Write tool — exists and working.' },

  // Pre-Req Chain: void_invoice
  { requiredName: 'void_invoice', chain: 'void_invoice', status: 'missing', actualName: null, priority: 'P2', notes: 'Write tool — not available in MCP. Cannot void invoices.' },

  // Pre-Req Chain: delete_contact
  { requiredName: 'delete_contact', chain: 'delete_contact', status: 'partial', actualName: 'delete_customers / delete_vendors', priority: 'P3', notes: 'Separate tools for customers vs vendors. No unified delete_contact.' },

  // Pre-Req Chain: approve_bill
  { requiredName: 'get_bill (by ID)', chain: 'approve_bill', status: 'exists', actualName: 'get_bill_by_id', priority: 'P1', notes: 'Takes BillId (UUID). Returns Status, Total, ContactName.' },
  { requiredName: 'approve_bill', chain: 'approve_bill', status: 'missing', actualName: null, priority: 'P3', notes: 'Approval workflow not exposed in MCP.' },

  // Pre-Req Chain: update_payment
  { requiredName: 'get_payment (single)', chain: 'update_payment', status: 'missing', actualName: null, priority: 'P1', notes: 'Only get_all_payments exists. No single payment fetch by PaymentId.' },
  { requiredName: 'update_payment', chain: 'update_payment', status: 'partial', actualName: 'update_payments', priority: 'P1', notes: 'Plural form exists — may be batch update. Needs verification.' },

  // Pre-Req Chain: create_credit_note
  { requiredName: 'create_credit_note', chain: 'create_credit_note', status: 'exists', actualName: 'create_sales_credit_note', priority: 'P2', notes: 'Also create_purchase_credit_note for vendor side.' },

  // Pre-Req Chain: create_invoice (entity resolution)
  { requiredName: 'search_contacts', chain: 'create_invoice', status: 'exists', actualName: 'get_customers / get_all_customers', priority: 'P2', notes: 'Search by name for entity resolution. Also get_all_vendors.' },
  { requiredName: 'get_items', chain: 'create_invoice', status: 'exists', actualName: 'get_items / get_item_by_id', priority: 'P2', notes: 'Resolve item codes for line items.' },
  { requiredName: 'get_tax_rates', chain: 'create_invoice', status: 'exists', actualName: 'get_taxations', priority: 'P2', notes: 'Returns TaxType, Name, Rate for GST compliance.' },
  { requiredName: 'create_invoice', chain: 'create_invoice', status: 'exists', actualName: 'create_invoice', priority: 'P2', notes: 'Write tool — exists and working.' },

  // Pre-Req Chain: create_journal_entry
  { requiredName: 'create_journal_entry', chain: 'create_journal', status: 'exists', actualName: 'create_journal', priority: 'P3', notes: 'Lines with AccountId, DebitAmount, CreditAmount.' },
];

const statusIcon = (s: ToolStatus) => {
  if (s === 'exists') return <CheckCircle2 size={15} className="text-emerald-500" />;
  if (s === 'missing') return <XCircle size={15} className="text-red-500" />;
  return <AlertTriangle size={15} className="text-amber-500" />;
};

const priorityColor = (p: string) => {
  if (p === 'P1') return 'destructive';
  if (p === 'P2') return 'default';
  return 'secondary';
};

export function MissingToolsAudit() {
  const missing = AUDIT_DATA.filter(t => t.status === 'missing');
  const partial = AUDIT_DATA.filter(t => t.status === 'partial');
  const existing = AUDIT_DATA.filter(t => t.status === 'exists');

  return (
    <div className="p-6 max-w-6xl mx-auto w-full space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="border rounded-lg bg-card p-4 text-center">
          <div className="text-2xl font-bold text-emerald-500">{existing.length}</div>
          <div className="text-xs text-muted-foreground">Tools Available</div>
        </div>
        <div className="border rounded-lg bg-card p-4 text-center">
          <div className="text-2xl font-bold text-red-500">{missing.length}</div>
          <div className="text-xs text-muted-foreground">Tools Missing</div>
        </div>
        <div className="border rounded-lg bg-card p-4 text-center">
          <div className="text-2xl font-bold text-amber-500">{partial.length}</div>
          <div className="text-xs text-muted-foreground">Partial / Verify</div>
        </div>
      </div>

      {/* Info */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>
          Audit based on pre-requisite chain requirements from v3 architecture.
          Compared against <strong>698 MCP tools</strong> in mcp_tools_master and <strong>0 tools</strong> in tool_registry.
          Missing tools block specific pipeline flows.
        </span>
      </div>

      {/* Missing Tools Table */}
      {missing.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-red-500 flex items-center gap-2">
            <XCircle size={14} /> Missing Tools ({missing.length})
          </h2>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Tool Name</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Pre-Req Chain</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Priority</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {missing.map((t, i) => (
                  <tr key={i} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs text-red-400">{t.requiredName}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{t.chain}</td>
                    <td className="px-3 py-2">
                      <Badge variant={priorityColor(t.priority) as any} className="text-[10px]">{t.priority}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{t.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Partial Tools Table */}
      {partial.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-amber-500 flex items-center gap-2">
            <AlertTriangle size={14} /> Partial / Needs Verification ({partial.length})
          </h2>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Required</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Actual Name</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Chain</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Priority</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {partial.map((t, i) => (
                  <tr key={i} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs text-amber-400">{t.requiredName}</td>
                    <td className="px-3 py-2 font-mono text-xs">{t.actualName}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{t.chain}</td>
                    <td className="px-3 py-2">
                      <Badge variant={priorityColor(t.priority) as any} className="text-[10px]">{t.priority}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{t.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Existing Tools Table */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-emerald-500 flex items-center gap-2">
          <CheckCircle2 size={14} /> Available Tools ({existing.length})
        </h2>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Required</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">MCP Tool Name</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Chain</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {existing.map((t, i) => (
                <tr key={i} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs">{t.requiredName}</td>
                  <td className="px-3 py-2 font-mono text-xs text-emerald-400">{t.actualName}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{t.chain}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{t.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

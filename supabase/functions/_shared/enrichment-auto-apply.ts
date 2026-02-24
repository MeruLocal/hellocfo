// Enrichment Auto-Apply — SHARED SOURCE OF TRUTH
// Detects data patterns and applies enrichments on the LLM path

export interface AutoEnrichment {
  type: string;
  description: string;
  applied: boolean;
}

interface DataCharacteristics {
  hasTimeSeries: boolean;
  hasAmounts: boolean;
  hasList: boolean;
  hasThresholds: boolean;
  recordCount: number;
}

function analyzeData(toolResults: { tool: string; result?: string; success: boolean }[]): DataCharacteristics {
  const successfulResults = toolResults.filter(r => r.success && r.result);
  let hasTimeSeries = false, hasAmounts = false, hasList = false, hasThresholds = false, totalRecords = 0;
  for (const result of successfulResults) {
    const text = result.result || "";
    if (/\b(month|quarter|year|week|period|date|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(text)) hasTimeSeries = true;
    if (/[₹$]|amount|total|balance|value|revenue|cost|price/i.test(text)) hasAmounts = true;
    try { const parsed = JSON.parse(text); if (Array.isArray(parsed)) { hasList = true; totalRecords += parsed.length; } } catch (_e) { if ((text.match(/\n/g) || []).length > 3) hasList = true; }
    if (/overdue|aging|outstanding|limit|threshold|alert|warning|critical/i.test(text)) hasThresholds = true;
  }
  return { hasTimeSeries, hasAmounts, hasList, hasThresholds, recordCount: totalRecords };
}

export function detectAutoEnrichments(toolResults: { tool: string; result?: string; success: boolean }[]): AutoEnrichment[] {
  const c = analyzeData(toolResults);
  const enrichments: AutoEnrichment[] = [];
  if (c.hasTimeSeries) enrichments.push({ type: "trend_analysis", description: "Identify trends, growth rates, and directional changes in the time series data", applied: true });
  if (c.hasAmounts) enrichments.push({ type: "currency_formatting", description: "Format all amounts in Indian numbering (lakhs/crores) with ₹ symbol", applied: true });
  if (c.hasList && c.recordCount > 3) enrichments.push({ type: "ranking", description: "Rank and highlight top/bottom items in the list", applied: true });
  if (c.hasThresholds) enrichments.push({ type: "alert_evaluation", description: "Evaluate thresholds and flag items that need attention (overdue, critical, etc.)", applied: true });
  return enrichments;
}

export function buildEnrichmentInstructions(enrichments: AutoEnrichment[]): string {
  if (enrichments.length === 0) return "";
  return `\n\nAUTO-ENRICHMENTS TO APPLY:\n${enrichments.map(e => `- ${e.type.replace(/_/g, " ").toUpperCase()}: ${e.description}`).join("\n")}`;
}

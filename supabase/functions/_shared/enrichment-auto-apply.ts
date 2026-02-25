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
  hasComplianceDeadlines: boolean;
  hasTaxData: boolean;
  hasAssetData: boolean;
  recordCount: number;
}

function analyzeData(toolResults: { tool: string; result?: string; success: boolean }[]): DataCharacteristics {
  const successfulResults = toolResults.filter(r => r.success && r.result);
  let hasTimeSeries = false, hasAmounts = false, hasList = false, hasThresholds = false, totalRecords = 0;
  let hasComplianceDeadlines = false, hasTaxData = false, hasAssetData = false;
  for (const result of successfulResults) {
    const text = result.result || "";
    if (/\b(month|quarter|year|week|period|date|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(text)) hasTimeSeries = true;
    if (/[₹$]|amount|total|balance|value|revenue|cost|price/i.test(text)) hasAmounts = true;
    try { const parsed = JSON.parse(text); if (Array.isArray(parsed)) { hasList = true; totalRecords += parsed.length; } } catch (_e) { if ((text.match(/\n/g) || []).length > 3) hasList = true; }
    if (/overdue|aging|outstanding|limit|threshold|alert|warning|critical/i.test(text)) hasThresholds = true;
    if (/due\s+date|deadline|filing|deposit\s+by|penalty|last\s+date|due\s+on|compliance|gstr|tds\s+return|tax\s+calendar/i.test(text)) hasComplianceDeadlines = true;
    if (/tax\s+payable|itc|input\s+tax|net\s+gst|tds\s+deducted|tcs|advance\s+tax|gst\s+liability|tax\s+due|challan/i.test(text)) hasTaxData = true;
    if (/book\s+value|wdv|written\s+down|depreciation|fixed\s+asset|asset\s+register|cwip|net\s+block|gross\s+block|accumulated/i.test(text)) hasAssetData = true;
  }
  return { hasTimeSeries, hasAmounts, hasList, hasThresholds, hasComplianceDeadlines, hasTaxData, hasAssetData, recordCount: totalRecords };
}

export function detectAutoEnrichments(toolResults: { tool: string; result?: string; success: boolean }[]): AutoEnrichment[] {
  const c = analyzeData(toolResults);
  const enrichments: AutoEnrichment[] = [];
  if (c.hasTimeSeries) enrichments.push({ type: "trend_analysis", description: "Identify trends, growth rates, and directional changes in the time series data", applied: true });
  if (c.hasAmounts || c.hasTaxData || c.hasAssetData) enrichments.push({ type: "currency_formatting", description: "Format all amounts in Indian numbering (lakhs/crores) with ₹ symbol", applied: true });
  if (c.hasList && c.recordCount > 3) enrichments.push({ type: "ranking", description: "Rank and highlight top/bottom items in the list", applied: true });
  if (c.hasThresholds || c.hasComplianceDeadlines || c.hasTaxData) enrichments.push({ type: "alert_evaluation", description: "Evaluate thresholds, flag compliance deadlines, tax dues, and items that need urgent attention", applied: true });
  if (c.hasAssetData) enrichments.push({ type: "depreciation_summary", description: "Summarize asset values with gross block, accumulated depreciation, net book value (WDV), and highlight fully depreciated assets", applied: true });
  return enrichments;
}

export function buildEnrichmentInstructions(enrichments: AutoEnrichment[]): string {
  if (enrichments.length === 0) return "";
  return `\n\nAUTO-ENRICHMENTS TO APPLY:\n${enrichments.map(e => `- ${e.type.replace(/_/g, " ").toUpperCase()}: ${e.description}`).join("\n")}`;
}

// Enrichment Auto-Apply — Detects data patterns and applies enrichments on the LLM path
// This adds context to raw MCP data before the LLM generates its response

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

/**
 * Analyze tool results to detect data characteristics.
 */
function analyzeData(toolResults: { tool: string; result?: string; success: boolean }[]): DataCharacteristics {
  const successfulResults = toolResults.filter((r) => r.success && r.result);

  let hasTimeSeries = false;
  let hasAmounts = false;
  let hasList = false;
  let hasThresholds = false;
  let totalRecords = 0;

  for (const result of successfulResults) {
    const text = result.result || "";

    // Check for time series data (dates, months, periods)
    if (/\b(month|quarter|year|week|period|date|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(text)) {
      hasTimeSeries = true;
    }

    // Check for monetary amounts
    if (/[₹$]|amount|total|balance|value|revenue|cost|price/i.test(text)) {
      hasAmounts = true;
    }

    // Check if result is a list/array
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        hasList = true;
        totalRecords += parsed.length;
      }
    } catch {
      // Not JSON, check for list-like patterns
      if ((text.match(/\n/g) || []).length > 3) {
        hasList = true;
      }
    }

    // Check for threshold-related data
    if (/overdue|aging|outstanding|limit|threshold|alert|warning|critical/i.test(text)) {
      hasThresholds = true;
    }
  }

  return {
    hasTimeSeries,
    hasAmounts,
    hasList,
    hasThresholds,
    recordCount: totalRecords,
  };
}

/**
 * Determine which enrichments to auto-apply based on the data characteristics.
 * Returns enrichment instructions to prepend to the LLM's context.
 */
export function detectAutoEnrichments(
  toolResults: { tool: string; result?: string; success: boolean }[]
): AutoEnrichment[] {
  const characteristics = analyzeData(toolResults);
  const enrichments: AutoEnrichment[] = [];

  if (characteristics.hasTimeSeries) {
    enrichments.push({
      type: "trend_analysis",
      description: "Identify trends, growth rates, and directional changes in the time series data",
      applied: true,
    });
  }

  if (characteristics.hasAmounts) {
    enrichments.push({
      type: "currency_formatting",
      description: "Format all amounts in Indian numbering (lakhs/crores) with ₹ symbol",
      applied: true,
    });
  }

  if (characteristics.hasList && characteristics.recordCount > 3) {
    enrichments.push({
      type: "ranking",
      description: "Rank and highlight top/bottom items in the list",
      applied: true,
    });
  }

  if (characteristics.hasThresholds) {
    enrichments.push({
      type: "alert_evaluation",
      description: "Evaluate thresholds and flag items that need attention (overdue, critical, etc.)",
      applied: true,
    });
  }

  return enrichments;
}

/**
 * Build enrichment instructions string to add to the LLM prompt context.
 */
export function buildEnrichmentInstructions(enrichments: AutoEnrichment[]): string {
  if (enrichments.length === 0) return "";

  const instructions = enrichments
    .map((e) => `- ${e.type.replace(/_/g, " ").toUpperCase()}: ${e.description}`)
    .join("\n");

  return `\n\nAUTO-ENRICHMENTS TO APPLY:\n${instructions}`;
}

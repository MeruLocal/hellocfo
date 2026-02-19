// Model Selector — Picks the cheapest LLM model for the job
// Uses the existing LLM config from the database as the "capable" model
// and selects cheaper alternatives for simpler tasks

import type { QueryCategory } from "./classifier.ts";

export interface ModelSelection {
  tier: "cheap" | "capable";
  reason: string;
}

// Complexity indicators for queries
const COMPLEX_INDICATORS = [
  // Analytical keywords
  "analyze", "analyse", "analysis", "compare", "comparison", "trend",
  "forecast", "predict", "projection", "anomaly", "anomalies",
  "correlation", "regression", "variance", "deviation",
  // Multi-step keywords
  "and then", "after that", "also", "additionally", "furthermore",
  "step by step", "detailed", "comprehensive", "deep dive",
  // Aggregation complexity
  "year over year", "yoy", "month over month", "mom", "quarter",
  "seasonal", "cyclical", "benchmark", "industry average",
  // Hindi complex
  "vishleshan", "tulna", "purvanumaaan",
];

/**
 * Select the model tier based on query characteristics.
 * 
 * - General chat: always cheap
 * - Simple CFO/bookkeeper queries: cheap
 * - Complex analytical queries: capable
 */
export function selectModelTier(
  query: string,
  category: QueryCategory
): ModelSelection {
  // General chat is always cheap
  if (category === "general_chat") {
    return { tier: "cheap", reason: "General conversation" };
  }

  const normalizedQuery = query.toLowerCase();
  const wordCount = normalizedQuery.split(/\s+/).length;

  // Check for complexity indicators
  const complexMatches = COMPLEX_INDICATORS.filter((k) =>
    normalizedQuery.includes(k)
  );

  // Long queries with analytical keywords → capable
  if (wordCount > 30 && complexMatches.length > 0) {
    return {
      tier: "capable",
      reason: `Complex query (${wordCount} words, ${complexMatches.length} analytical keywords)`,
    };
  }

  // Multiple complexity indicators → capable
  if (complexMatches.length >= 2) {
    return {
      tier: "capable",
      reason: `Analytical query (keywords: ${complexMatches.join(", ")})`,
    };
  }

  // Default: cheap model handles most queries well
  return { tier: "cheap", reason: "Standard query" };
}

// ============================================================
// System Prompts — Category-specific
// ============================================================

export const SYSTEM_PROMPTS = {
  fast_path: `You are a CFO AI Agent formatting financial data for an Indian business.

INSTRUCTIONS:
- Format all amounts in Indian numbering (lakhs, crores) with ₹ symbol
- Be concise and direct — the data is already fetched
- Use markdown tables for tabular data
- Highlight key insights or anomalies
- Do NOT call any tools — just format the provided data

RESPONSE STYLE: Concise, data-focused, executive summary format.`,

  bookkeeper: `You are a CFO AI Agent helping with bookkeeping operations for an Indian business.

INSTRUCTIONS:
- You help users create, edit, delete, and manage financial records
- ALWAYS confirm before destructive actions (delete, void, cancel)
- If required parameters are missing, ASK the user before proceeding
- Use Indian formats: ₹ amounts in lakhs/crores, DD/MM/YYYY dates
- After completing an action, summarize what was done

SAFETY:
- Never delete without explicit confirmation
- Validate amounts and dates before submission
- Warn about irreversible operations

RESPONSE STYLE: Action-oriented, step-by-step confirmation.`,

  cfo: `You are a CFO AI Agent providing financial analysis for an Indian business.

INSTRUCTIONS:
- Provide analytical, insight-driven responses
- Highlight risks, anomalies, and opportunities
- Use Indian formats: ₹ amounts in lakhs/crores, DD/MM/YYYY dates
- Include context with numbers (% change, comparisons)
- Use markdown tables and formatting for clarity
- When data shows concerning trends, flag them proactively

ANALYSIS APPROACH:
- Lead with the key finding/insight
- Support with specific numbers
- End with recommendations or action items

RESPONSE STYLE: Analytical, insightful, executive-level.`,

  general_chat: `You are a friendly CFO AI Agent for an Indian business.

INSTRUCTIONS:
- Be warm and professional
- Keep responses brief (1-3 sentences)
- If the user greets you, respond warmly and offer to help with financial queries
- Redirect off-topic questions back to finance gently
- Support both English and Hindi

RESPONSE STYLE: Warm, brief, helpful.`,
};

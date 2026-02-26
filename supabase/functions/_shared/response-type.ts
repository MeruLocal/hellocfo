// Response Type Detector — SHARED SOURCE OF TRUTH
// Detects the expected response type based on query patterns and tool results

export type ResponseType =
  | "table"           // Tabular data display
  | "list"            // List of items
  | "analysis"        // Analytical/insight response
  | "chart"           // Visual chart/graph
  | "document"        // Document/record operation result
  | "calculation"     // Numerical calculation result
  | "guide"           // How-to/instructional guide
  | "setup"           // Configuration/setup response
  | "info"            // Informational response
  | "process"         // Process/workflow description
  | "confirmation"    // Confirmation of action
  | "error"           // Error response
  | "dashboard"       // Dashboard/KPI summary
  | "summary"         // Summary/overview
  | "tracking"        // Status tracking response
  | "calendar"        // Calendar/schedule view
  | "checklist"       // Checklist items
  | "action"          // Action result (create/update/delete)
  | "export"          // Export/download response
  | "recovery"        // Recovery/restoration response
  | "troubleshooting"; // Troubleshooting response

interface ResponseTypeResult {
  type: ResponseType;
  confidence: number;
  reason: string;
}

// Query patterns for each response type
const RESPONSE_TYPE_PATTERNS: { type: ResponseType; patterns: RegExp[]; keywords: string[] }[] = [
  {
    type: "table",
    patterns: [
      /\b(list|show|display|get|fetch)\s+(all|my|the)?\s*(invoices?|bills?|customers?|vendors?|payments?|transactions?|items?|products?)/i,
      /\b(aging|ageing)\s+(report|analysis|summary)/i,
      /\bregister\b/i,
    ],
    keywords: ["list", "show all", "display", "register", "ledger", "aging", "ageing", "statement"],
  },
  {
    type: "analysis",
    patterns: [
      /\b(analyze|analyse|analysis|insight|trend|compare|comparison|why|reason|cause)\b/i,
      /\b(profit|margin|ratio|kpi|performance|efficiency|health)\b.*\b(analysis|review|check)\b/i,
    ],
    keywords: ["analyze", "analyse", "insight", "trend", "compare", "why", "reason", "root cause", "deep dive", "breakdown"],
  },
  {
    type: "chart",
    patterns: [
      /\b(chart|graph|plot|visualize|visualization|trend\s+line|bar\s+chart|pie\s+chart)\b/i,
    ],
    keywords: ["chart", "graph", "plot", "visualize", "trend line", "sparkline"],
  },
  {
    type: "dashboard",
    patterns: [
      /\b(dashboard|kpi|metrics|overview|snapshot|at\s+a\s+glance)\b/i,
    ],
    keywords: ["dashboard", "kpi", "metrics", "overview", "snapshot", "summary view"],
  },
  {
    type: "calculation",
    patterns: [
      /\b(calculate|compute|total|sum|average|count|how\s+much|kitna)\b/i,
      /\b(gst|tax|tds|interest|depreciation)\s+(calculation|amount|liability|payable)\b/i,
    ],
    keywords: ["calculate", "compute", "total", "sum", "average", "how much", "kitna", "amount"],
  },
  {
    type: "document",
    patterns: [
      /\b(invoice|bill|credit\s+note|payment|receipt|voucher|challan)\s+(details?|info|information)\b/i,
      /\bshow\s+(me\s+)?(invoice|bill|payment)\s+#?\d+/i,
    ],
    keywords: ["details", "info", "document", "record", "voucher"],
  },
  {
    type: "action",
    patterns: [
      /\b(create|add|make|generate|new|update|edit|modify|delete|remove|void|cancel)\b/i,
    ],
    keywords: ["create", "add", "make", "update", "edit", "delete", "remove", "void", "cancel", "banao", "naya"],
  },
  {
    type: "guide",
    patterns: [
      /\b(how\s+to|how\s+do\s+i|guide|tutorial|steps?\s+to|process\s+to|way\s+to)\b/i,
    ],
    keywords: ["how to", "how do i", "guide", "tutorial", "steps", "process"],
  },
  {
    type: "setup",
    patterns: [
      /\b(setup|set\s+up|configure|configuration|settings?|enable|disable|connect|integrate)\b/i,
    ],
    keywords: ["setup", "set up", "configure", "settings", "enable", "connect", "integrate"],
  },
  {
    type: "list",
    patterns: [
      /\b(list|enumerate|what\s+are|show\s+me)\s+(the\s+)?(options?|choices?|types?|categories?|features?)\b/i,
    ],
    keywords: ["list", "enumerate", "options", "choices", "what are"],
  },
  {
    type: "calendar",
    patterns: [
      /\b(calendar|schedule|due\s+dates?|deadlines?|upcoming|this\s+(week|month)|compliance\s+calendar)\b/i,
    ],
    keywords: ["calendar", "schedule", "due dates", "deadlines", "upcoming"],
  },
  {
    type: "checklist",
    patterns: [
      /\b(checklist|todo|to-do|tasks?|action\s+items?|pending\s+items?)\b/i,
    ],
    keywords: ["checklist", "todo", "tasks", "action items", "pending"],
  },
  {
    type: "process",
    patterns: [
      /\b(workflow|process|procedure|flow|steps?\s+involved)\b/i,
    ],
    keywords: ["workflow", "process", "procedure", "flow"],
  },
  {
    type: "tracking",
    patterns: [
      /\b(track|tracking|status|where\s+is|progress|monitor)\b/i,
    ],
    keywords: ["track", "tracking", "status", "progress", "monitor"],
  },
  {
    type: "export",
    patterns: [
      /\b(export|download|backup|extract|dump)\b/i,
    ],
    keywords: ["export", "download", "backup", "extract"],
  },
  {
    type: "troubleshooting",
    patterns: [
      /\b(error|issue|problem|not\s+working|failed|stuck|help\s+me\s+fix|troubleshoot)\b/i,
    ],
    keywords: ["error", "issue", "problem", "not working", "failed", "stuck", "troubleshoot"],
  },
  {
    type: "recovery",
    patterns: [
      /\b(recover|restore|undo|rollback|get\s+back|accidentally\s+deleted)\b/i,
    ],
    keywords: ["recover", "restore", "undo", "rollback", "get back"],
  },
  {
    type: "summary",
    patterns: [
      /\b(summary|summarize|summarise|brief|quick\s+look|highlight)\b/i,
    ],
    keywords: ["summary", "summarize", "brief", "highlight"],
  },
  {
    type: "info",
    patterns: [
      /\b(what\s+is|explain|tell\s+me\s+about|information\s+about|describe)\b/i,
    ],
    keywords: ["what is", "explain", "tell me about", "describe", "information"],
  },
  {
    type: "confirmation",
    patterns: [
      /^(yes|no|okay|ok|sure|confirm|cancel|haan|nahi|theek|accha)[\s!?.]*$/i,
    ],
    keywords: ["yes", "no", "confirm", "cancel"],
  },
];

/**
 * Detect the expected response type based on the query.
 */
export function detectResponseType(
  query: string,
  toolsUsed: string[] = [],
  isWriteOperation: boolean = false
): ResponseTypeResult {
  const normalizedQuery = query.toLowerCase().trim();

  // If it's a write operation, return action type
  if (isWriteOperation || toolsUsed.some(t => /^(create_|update_|delete_|void_|cancel_)/.test(t))) {
    return { type: "action", confidence: 0.95, reason: "Write operation detected" };
  }

  // Check each pattern
  let bestMatch: ResponseTypeResult = { type: "info", confidence: 0.3, reason: "Default fallback" };

  for (const config of RESPONSE_TYPE_PATTERNS) {
    // Check regex patterns
    for (const pattern of config.patterns) {
      if (pattern.test(normalizedQuery)) {
        const confidence = 0.9;
        if (confidence > bestMatch.confidence) {
          bestMatch = { type: config.type, confidence, reason: `Matched pattern for ${config.type}` };
        }
      }
    }

    // Check keywords
    for (const keyword of config.keywords) {
      if (normalizedQuery.includes(keyword)) {
        const confidence = 0.7 + (keyword.length > 5 ? 0.1 : 0);
        if (confidence > bestMatch.confidence) {
          bestMatch = { type: config.type, confidence, reason: `Matched keyword "${keyword}"` };
        }
      }
    }
  }

  // Boost confidence based on tools used
  if (toolsUsed.length > 0) {
    const toolName = toolsUsed[0].toLowerCase();
    if (toolName.includes("list") || toolName.includes("get_all")) {
      if (bestMatch.type === "table" || bestMatch.type === "list") {
        bestMatch.confidence = Math.min(0.95, bestMatch.confidence + 0.1);
      }
    }
    if (toolName.includes("report") || toolName.includes("analysis")) {
      if (bestMatch.type === "analysis" || bestMatch.type === "table") {
        bestMatch.confidence = Math.min(0.95, bestMatch.confidence + 0.1);
      }
    }
  }

  return bestMatch;
}

/**
 * Detect response type from tool results content.
 */
export function detectResponseTypeFromResults(
  toolResults: { tool: string; result?: string; success: boolean }[]
): ResponseType {
  const successfulResults = toolResults.filter(r => r.success && r.result);

  if (successfulResults.length === 0) {
    return "info";
  }

  // Check if results look like tables/lists
  let hasArrayData = false;
  let hasAnalyticalData = false;

  for (const result of successfulResults) {
    const text = result.result || "";

    // Check for array/list data
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 1) {
        hasArrayData = true;
      }
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const keys = Object.keys(parsed);
        if (keys.some(k => ["data", "items", "records", "rows"].includes(k.toLowerCase()))) {
          hasArrayData = true;
        }
      }
    } catch (_e) {
      // Not JSON, check for table-like content
      if ((text.match(/\n/g) || []).length > 3) {
        hasArrayData = true;
      }
    }

    // Check for analytical patterns
    if (/\b(trend|growth|increase|decrease|change|variance|deviation|ratio|percentage|%|average|total)\b/i.test(text)) {
      hasAnalyticalData = true;
    }
  }

  if (hasAnalyticalData) return "analysis";
  if (hasArrayData) return "table";

  // Check tool names
  const toolName = successfulResults[0].tool.toLowerCase();
  if (toolName.includes("create") || toolName.includes("update") || toolName.includes("delete")) {
    return "action";
  }
  if (toolName.includes("report") || toolName.includes("analysis")) {
    return "analysis";
  }
  if (toolName.includes("list") || toolName.includes("get_all")) {
    return "table";
  }

  return "info";
}

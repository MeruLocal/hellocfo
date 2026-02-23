// Category Classifier — Simple keyword-based classification (no LLM call)
// Classifies queries into: unified | general_chat
// SHARED SOURCE OF TRUTH — all agents import from here

export type QueryCategory = "unified" | "general_chat";

export interface ClassificationResult {
  category: QueryCategory;
  confidence: number;
  subCategory?: string;
  matchedKeywords: string[];
}

const GENERAL_CHAT_PATTERNS = [
  /^(hi|hello|hey|howdy|good\s+(morning|afternoon|evening|night))[\s!?.]*$/i,
  /^(thanks|thank\s+you|thx|ty|cheers)[\s!?.]*$/i,
  /^(bye|goodbye|see\s+you|take\s+care)[\s!?.]*$/i,
  /^(help|what\s+can\s+you\s+do|who\s+are\s+you)[\s!?.]*$/i,
  /^(ok|okay|sure|got\s+it|understood)[\s!?.]*$/i,
  /^(yes|no|yep|nope|yeah|nah)[\s!?.]*$/i,
  /^(namaste|namaskar|dhanyavaad|shukriya|alvida)[\s!?.]*$/i,
  /^(haan|nahi|theek|accha)[\s!?.]*$/i,
];

// Keywords that indicate the query needs financial tools (not just chat)
const FINANCIAL_KEYWORDS: { words: string[]; subCategory: string }[] = [
  // Action keywords
  { words: ["create", "add", "new", "make", "generate", "banao", "naya"], subCategory: "create" },
  { words: ["edit", "update", "change", "modify", "badlo", "sudhar"], subCategory: "edit" },
  { words: ["delete", "remove", "cancel", "hatao", "mita"], subCategory: "delete" },
  { words: ["record", "enter", "log", "book", "darj"], subCategory: "record" },
  { words: ["send", "email", "mail", "share", "bhejo"], subCategory: "send" },
  { words: ["file", "submit", "upload", "dakhil"], subCategory: "file" },
  { words: ["void", "reverse", "undo"], subCategory: "void" },
  { words: ["import", "export", "bulk"], subCategory: "bulk" },
  { words: ["clone", "duplicate", "copy"], subCategory: "clone" },
  { words: ["reconcile", "match", "categorize", "split"], subCategory: "banking" },
  { words: ["merge", "transfer", "adjust"], subCategory: "manage" },
  { words: ["reminder", "yaad dilao"], subCategory: "reminder" },
  { words: ["e-invoice", "einvoice", "e-way", "eway"], subCategory: "compliance" },
  // View/query keywords
  { words: ["show", "get", "fetch", "list", "view", "display", "dikhao", "batao", "dikha"], subCategory: "view" },
  { words: ["report", "statement", "summary", "overview"], subCategory: "report" },
  { words: ["analyze", "analysis", "analyse", "insight", "trend", "vishleshan"], subCategory: "analysis" },
  { words: ["compare", "comparison", "versus", "vs", "tulna"], subCategory: "compare" },
  // Entity keywords
  { words: ["invoice", "bill", "credit note", "debit note", "payment", "expense", "journal"], subCategory: "transaction" },
  { words: ["revenue", "income", "sales", "turnover", "aay", "bikri"], subCategory: "revenue" },
  { words: ["expense", "cost", "spending", "kharcha", "vyay"], subCategory: "expense" },
  { words: ["profit", "loss", "margin", "p&l", "laabh", "naafa", "nuksan"], subCategory: "profitability" },
  { words: ["balance sheet", "assets", "liabilities", "equity"], subCategory: "balance_sheet" },
  { words: ["cash", "cashflow", "cash flow", "liquidity", "fund", "nakad"], subCategory: "cash" },
  { words: ["receivable", "receivables", "ar", "outstanding", "overdue", "aging", "baaki"], subCategory: "receivables" },
  { words: ["payable", "payables", "ap", "dues", "dena"], subCategory: "payables" },
  { words: ["gst", "tax", "tds", "itr", "gstr", "kar"], subCategory: "tax" },
  { words: ["kpi", "ratio", "metric", "health", "score", "performance"], subCategory: "kpis" },
  { words: ["inventory", "stock", "item", "product", "maal", "saman"], subCategory: "inventory" },
  { words: ["customer", "vendor", "contact", "client", "supplier", "graahak"], subCategory: "contacts" },
  { words: ["bank", "account", "ledger", "transaction", "khata"], subCategory: "ledger" },
  { words: ["forecast", "predict", "projection", "budget", "plan"], subCategory: "forecast" },
  { words: ["top", "best", "worst", "highest", "lowest", "most", "least"], subCategory: "ranking" },
  { words: ["how much", "kitna", "total", "count", "number"], subCategory: "aggregate" },
  { words: ["what", "kya", "which", "kaun", "when", "kab"], subCategory: "query" },
];

export function classifyQuery(query: string): ClassificationResult {
  const normalizedQuery = query.toLowerCase().trim();

  // Check general chat patterns first
  for (const pattern of GENERAL_CHAT_PATTERNS) {
    if (pattern.test(normalizedQuery)) {
      return { category: "general_chat", confidence: 0.95, subCategory: "greeting", matchedKeywords: [normalizedQuery] };
    }
  }

  // Very short messages with no financial keywords → general chat
  const wordCount = normalizedQuery.split(/\s+/).length;
  if (wordCount <= 2 && !normalizedQuery.match(/[₹$%0-9]/)) {
    const hasFinancial = FINANCIAL_KEYWORDS.some(k => k.words.some(w => normalizedQuery.includes(w)));
    if (!hasFinancial) return { category: "general_chat", confidence: 0.7, subCategory: "short_message", matchedKeywords: [] };
  }

  // Any financial keyword match → unified
  let score = 0;
  const matches: string[] = [];
  let sub = "";
  for (const g of FINANCIAL_KEYWORDS) {
    for (const w of g.words) {
      if (normalizedQuery.includes(w)) {
        score += w.length > 4 ? 2 : 1;
        matches.push(w);
        if (!sub) sub = g.subCategory;
      }
    }
  }

  if (score > 0) {
    return {
      category: "unified",
      confidence: Math.min(0.95, 0.6 + score * 0.1),
      subCategory: sub,
      matchedKeywords: matches,
    };
  }

  // Default: unified (let the LLM decide how to handle it with tools)
  return { category: "unified", confidence: 0.5, subCategory: "general", matchedKeywords: [] };
}

// No-op kept for backward compat — always returns false now
export function detectCrossOver(_query: string, _currentCategory: QueryCategory): boolean {
  return false;
}

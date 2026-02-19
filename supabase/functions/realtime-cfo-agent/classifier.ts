// Category Classifier — Simple keyword-based classification (no LLM call)
// Classifies queries into: bookkeeper | cfo | general_chat

export type QueryCategory = "bookkeeper" | "cfo" | "general_chat";

export interface ClassificationResult {
  category: QueryCategory;
  confidence: number;
  subCategory?: string;
  matchedKeywords: string[];
}

// Patterns for general chat (greetings, thanks, off-topic)
const GENERAL_CHAT_PATTERNS = [
  // English
  /^(hi|hello|hey|howdy|good\s+(morning|afternoon|evening|night))[\s!?.]*$/i,
  /^(thanks|thank\s+you|thx|ty|cheers)[\s!?.]*$/i,
  /^(bye|goodbye|see\s+you|take\s+care)[\s!?.]*$/i,
  /^(help|what\s+can\s+you\s+do|who\s+are\s+you)[\s!?.]*$/i,
  /^(ok|okay|sure|got\s+it|understood)[\s!?.]*$/i,
  /^(yes|no|yep|nope|yeah|nah)[\s!?.]*$/i,
  // Hindi
  /^(namaste|namaskar|dhanyavaad|shukriya|alvida)[\s!?.]*$/i,
  /^(haan|nahi|theek|accha)[\s!?.]*$/i,
];

// Keywords that indicate bookkeeper (write/action) operations
const BOOKKEEPER_KEYWORDS: { words: string[]; subCategory: string }[] = [
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
  { words: ["invoice", "bill", "credit note", "debit note", "payment", "expense", "journal"], subCategory: "transaction" },
  { words: ["reminder", "yaad dilao"], subCategory: "reminder" },
  { words: ["e-invoice", "einvoice", "e-way", "eway"], subCategory: "compliance" },
];

// Keywords that indicate CFO (read/report/analysis) operations
const CFO_KEYWORDS: { words: string[]; subCategory: string }[] = [
  { words: ["show", "get", "fetch", "list", "view", "display", "dikhao", "batao", "dikha"], subCategory: "view" },
  { words: ["report", "statement", "summary", "overview"], subCategory: "report" },
  { words: ["analyze", "analysis", "analyse", "insight", "trend", "vishleshan"], subCategory: "analysis" },
  { words: ["compare", "comparison", "versus", "vs", "tulna"], subCategory: "compare" },
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
  { words: ["bank", "account", "ledger", "journal", "transaction", "khata"], subCategory: "ledger" },
  { words: ["forecast", "predict", "projection", "budget", "plan"], subCategory: "forecast" },
  { words: ["top", "best", "worst", "highest", "lowest", "most", "least"], subCategory: "ranking" },
  { words: ["how much", "kitna", "total", "count", "number"], subCategory: "aggregate" },
  { words: ["what", "kya", "which", "kaun", "when", "kab"], subCategory: "query" },
];

// Action keywords that force bookkeeper even in CFO context (cross-over detection)
const ACTION_OVERRIDE_KEYWORDS = [
  "create", "delete", "send", "file", "record", "void", "cancel",
  "banao", "bhejo", "hatao", "mita", "dakhil",
];

/**
 * Classify a user query into a category.
 * Returns the category, confidence, and matched keywords.
 */
export function classifyQuery(query: string): ClassificationResult {
  const normalizedQuery = query.toLowerCase().trim();

  // 1. Check general chat first (exact match patterns)
  for (const pattern of GENERAL_CHAT_PATTERNS) {
    if (pattern.test(normalizedQuery)) {
      return {
        category: "general_chat",
        confidence: 0.95,
        subCategory: "greeting",
        matchedKeywords: [normalizedQuery],
      };
    }
  }

  // Short messages (< 4 words) that look like chat
  const wordCount = normalizedQuery.split(/\s+/).length;
  if (wordCount <= 2 && !normalizedQuery.match(/[₹$%0-9]/)) {
    // Could be a single keyword like "invoices" or "revenue" — check below
    // But things like "hi there" should be general chat
    const hasCFOKeyword = CFO_KEYWORDS.some((k) =>
      k.words.some((w) => normalizedQuery.includes(w))
    );
    const hasBookkeeperKeyword = BOOKKEEPER_KEYWORDS.some((k) =>
      k.words.some((w) => normalizedQuery.includes(w))
    );
    if (!hasCFOKeyword && !hasBookkeeperKeyword) {
      return {
        category: "general_chat",
        confidence: 0.7,
        subCategory: "short_message",
        matchedKeywords: [],
      };
    }
  }

  // 2. Score bookkeeper keywords
  let bookkeeperScore = 0;
  const bookkeeperMatches: string[] = [];
  let bookkeeperSub = "";

  for (const group of BOOKKEEPER_KEYWORDS) {
    for (const word of group.words) {
      if (normalizedQuery.includes(word)) {
        bookkeeperScore += word.length > 4 ? 2 : 1; // Longer keywords score higher
        bookkeeperMatches.push(word);
        if (!bookkeeperSub) bookkeeperSub = group.subCategory;
      }
    }
  }

  // 3. Score CFO keywords
  let cfoScore = 0;
  const cfoMatches: string[] = [];
  let cfoSub = "";

  for (const group of CFO_KEYWORDS) {
    for (const word of group.words) {
      if (normalizedQuery.includes(word)) {
        cfoScore += word.length > 4 ? 2 : 1;
        cfoMatches.push(word);
        if (!cfoSub) cfoSub = group.subCategory;
      }
    }
  }

  // 4. Check for action override (cross-over detection)
  const hasActionOverride = ACTION_OVERRIDE_KEYWORDS.some((k) =>
    normalizedQuery.includes(k)
  );

  // 5. Decide category
  if (bookkeeperScore > 0 && bookkeeperScore > cfoScore) {
    return {
      category: "bookkeeper",
      confidence: Math.min(0.95, 0.6 + bookkeeperScore * 0.1),
      subCategory: bookkeeperSub,
      matchedKeywords: bookkeeperMatches,
    };
  }

  if (cfoScore > 0) {
    // Check for cross-over: CFO query with action intent
    if (hasActionOverride && bookkeeperScore > 0) {
      return {
        category: "bookkeeper",
        confidence: Math.min(0.9, 0.5 + bookkeeperScore * 0.1),
        subCategory: bookkeeperSub,
        matchedKeywords: [...bookkeeperMatches, ...cfoMatches],
      };
    }

    return {
      category: "cfo",
      confidence: Math.min(0.95, 0.6 + cfoScore * 0.1),
      subCategory: cfoSub,
      matchedKeywords: cfoMatches,
    };
  }

  // Default to CFO (most queries are reads)
  return {
    category: "cfo",
    confidence: 0.5,
    subCategory: "general",
    matchedKeywords: [],
  };
}

/**
 * Detect if a follow-up query in a CFO conversation requires bookkeeper tools.
 * This handles cross-over scenarios like "send reminders to overdue customers".
 */
export function detectCrossOver(query: string, currentCategory: QueryCategory): boolean {
  if (currentCategory !== "cfo") return false;

  const normalizedQuery = query.toLowerCase().trim();
  return ACTION_OVERRIDE_KEYWORDS.some((k) => normalizedQuery.includes(k));
}

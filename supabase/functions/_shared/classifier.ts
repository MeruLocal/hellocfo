// Category Classifier — Simple keyword-based classification (no LLM call)
// Classifies queries into: bookkeeper | cfo | general_chat
// SHARED SOURCE OF TRUTH — all agents import from here

export type QueryCategory = "bookkeeper" | "cfo" | "general_chat";

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

const ACTION_OVERRIDE_KEYWORDS = [
  "create", "delete", "send", "file", "record", "void", "cancel",
  "banao", "bhejo", "hatao", "mita", "dakhil",
];

export function classifyQuery(query: string): ClassificationResult {
  const normalizedQuery = query.toLowerCase().trim();
  for (const pattern of GENERAL_CHAT_PATTERNS) {
    if (pattern.test(normalizedQuery)) {
      return { category: "general_chat", confidence: 0.95, subCategory: "greeting", matchedKeywords: [normalizedQuery] };
    }
  }
  const wordCount = normalizedQuery.split(/\s+/).length;
  if (wordCount <= 2 && !normalizedQuery.match(/[₹$%0-9]/)) {
    const hasCFO = CFO_KEYWORDS.some(k => k.words.some(w => normalizedQuery.includes(w)));
    const hasBK = BOOKKEEPER_KEYWORDS.some(k => k.words.some(w => normalizedQuery.includes(w)));
    if (!hasCFO && !hasBK) return { category: "general_chat", confidence: 0.7, subCategory: "short_message", matchedKeywords: [] };
  }
  let bkScore = 0; const bkMatches: string[] = []; let bkSub = "";
  for (const g of BOOKKEEPER_KEYWORDS) for (const w of g.words) if (normalizedQuery.includes(w)) { bkScore += w.length > 4 ? 2 : 1; bkMatches.push(w); if (!bkSub) bkSub = g.subCategory; }
  let cfoScore = 0; const cfoMatches: string[] = []; let cfoSub = "";
  for (const g of CFO_KEYWORDS) for (const w of g.words) if (normalizedQuery.includes(w)) { cfoScore += w.length > 4 ? 2 : 1; cfoMatches.push(w); if (!cfoSub) cfoSub = g.subCategory; }
  const hasAction = ACTION_OVERRIDE_KEYWORDS.some(k => normalizedQuery.includes(k));
  if (bkScore > 0 && bkScore > cfoScore) return { category: "bookkeeper", confidence: Math.min(0.95, 0.6 + bkScore * 0.1), subCategory: bkSub, matchedKeywords: bkMatches };
  if (cfoScore > 0) {
    if (hasAction && bkScore > 0) return { category: "bookkeeper", confidence: Math.min(0.9, 0.5 + bkScore * 0.1), subCategory: bkSub, matchedKeywords: [...bkMatches, ...cfoMatches] };
    return { category: "cfo", confidence: Math.min(0.95, 0.6 + cfoScore * 0.1), subCategory: cfoSub, matchedKeywords: cfoMatches };
  }
  return { category: "cfo", confidence: 0.5, subCategory: "general", matchedKeywords: [] };
}

export function detectCrossOver(query: string, currentCategory: QueryCategory): boolean {
  if (currentCategory !== "cfo") return false;
  return ACTION_OVERRIDE_KEYWORDS.some(k => query.toLowerCase().trim().includes(k));
}

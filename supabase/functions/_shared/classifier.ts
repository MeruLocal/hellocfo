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
  { words: ["e-invoice", "einvoice", "e-way", "eway", "eway bill", "ewb", "transporter", "shipment"], subCategory: "compliance" },
  // View/query keywords
  { words: ["show", "get", "fetch", "list", "view", "display", "dikhao", "batao", "dikha"], subCategory: "view" },
  { words: ["report", "statement", "summary", "overview"], subCategory: "report" },
  { words: ["dupont", "altman z-score", "fund flow", "operating leverage", "interest coverage", "cash conversion cycle", "common size", "revenue recognition", "break even", "break-even"], subCategory: "report" },
  { words: ["analyze", "analysis", "analyse", "insight", "trend", "vishleshan"], subCategory: "analysis" },
  { words: ["compare", "comparison", "versus", "vs", "tulna"], subCategory: "compare" },
  // Entity keywords
  { words: ["invoice", "bill", "credit note", "debit note", "payment", "expense", "journal"], subCategory: "transaction" },
  { words: ["revenue", "income", "sales", "turnover", "aay", "bikri", "discount", "churn", "channel", "lifetime value", "clv", "acquisition"], subCategory: "revenue" },
  { words: ["expense", "cost", "spending", "kharcha", "vyay"], subCategory: "expense" },
  { words: ["claim", "reimbursement", "reimburse", "pending claim", "expense claim", "approved claim", "rejected claim"], subCategory: "expense" },
  { words: ["per diem", "mileage", "petty cash", "auto approved", "receipt missing", "policy violation", "fuel expense", "client entertainment", "travel expense"], subCategory: "expense" },
  { words: ["profit", "loss", "margin", "p&l", "laabh", "naafa", "nuksan"], subCategory: "profitability" },
  { words: ["balance sheet", "assets", "liabilities", "equity"], subCategory: "balance_sheet" },
  { words: ["fixed asset", "asset register", "depreciation", "book value", "cwip", "capital work", "fully depreciated", "wdv", "slm"], subCategory: "balance_sheet" },
  { words: ["lease agreement", "revaluation", "impairment", "physical verification", "asset tag", "useful life", "component depreciation", "insurance expiring", "cwip aging", "asset disposal", "asset transfer", "maintenance cost"], subCategory: "balance_sheet" },
  { words: ["cash", "cashflow", "cash flow", "liquidity", "fund", "nakad"], subCategory: "cash" },
  { words: ["receivable", "receivables", "ar", "outstanding", "overdue", "aging", "baaki"], subCategory: "receivables" },
  { words: ["payable", "payables", "ap", "dues", "dena"], subCategory: "payables" },
  { words: ["gst", "tax", "tds", "tcs", "itr", "gstr", "kar"], subCategory: "tax" },
  { words: ["advance tax", "professional tax", "form 16", "form 26q", "form 24q", "form 15g", "form 15h", "section 194", "section 192", "challan 280", "challan 281"], subCategory: "tax" },
  { words: ["tds deducted", "tds certificate", "tds payable", "tds receivable", "tds return", "tax compliance", "tax calendar"], subCategory: "tax" },
  { words: ["mat", "minimum alternate tax", "deferred tax", "form 26as", "transfer pricing", "oltas", "pan verification", "tax audit", "withholding tax"], subCategory: "tax" },
  { words: ["tds challan", "tds default", "short deduction", "tds on salary", "brought forward loss", "effective tax rate", "lower deduction"], subCategory: "tax" },
  { words: ["reverse charge", "rcm", "nil rated", "exempt supply", "place of supply", "cdn", "gstr-9", "annual return", "gstr-2b", "gstr-2a"], subCategory: "tax" },
  { words: ["itc reversal", "itc utilization", "itc on capital", "auto populated", "nil return", "late fee"], subCategory: "tax" },
  { words: ["kpi", "ratio", "metric", "health", "score", "performance"], subCategory: "kpis" },
  { words: ["ebitda", "pbt", "dso", "dpo", "current ratio", "quick ratio", "debt equity", "working capital", "net worth"], subCategory: "kpis" },
  { words: ["inventory", "stock", "item", "product", "maal", "saman", "fifo", "weighted average", "dead stock", "reorder", "expiry", "warehouse", "batch", "scrap", "landed cost"], subCategory: "inventory" },
  { words: ["customer", "vendor", "contact", "client", "supplier", "graahak"], subCategory: "contacts" },
  { words: ["bank", "account", "ledger", "transaction", "khata", "chart of accounts", "cost center", "cost centre", "journal entry", "unposted", "recurring entry"], subCategory: "ledger" },
  { words: ["suspense account", "control account", "subsidiary ledger", "period end", "unclosed period", "doubtful debt", "prepaid amortization", "loan reconciliation", "credit card reconciliation", "narration missing", "high value transaction"], subCategory: "ledger" },
  { words: ["forecast", "predict", "projection", "budget", "plan"], subCategory: "forecast" },
  // Platform features (Drive, Comments, Tasks, Workspace)
  { words: ["file", "files", "document", "documents", "uploaded", "storage", "shared with me", "drive", "attachment"], subCategory: "drive" },
  { words: ["orphaned file", "retention policy", "auto attached", "confidential", "version history", "recycle bin", "storage quota", "download history", "file tag"], subCategory: "drive" },
  { words: ["comment", "comments", "mentioned", "mention", "unread comment", "thread", "resolved comment"], subCategory: "comments" },
  { words: ["escalation comment", "action item from comment", "comment trend", "most discussed", "comment thread"], subCategory: "comments" },
  { words: ["task", "tasks", "pending task", "overdue task", "assigned", "my tasks", "due this week", "team task"], subCategory: "tasks" },
  { words: ["sla", "task handover", "recurring task", "workload distribution", "task aging", "task blocked", "task escalated", "unassigned task"], subCategory: "tasks" },
  { words: ["dashboard", "notification", "notifications", "workspace", "alert", "bookmark", "favorite", "kpi", "login history"], subCategory: "workspace" },
  { words: ["anomaly alert", "compliance calendar", "working capital forecast", "data backup", "budget overrun", "multi currency exposure", "bulk operation"], subCategory: "workspace" },
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

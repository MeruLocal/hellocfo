import { TOOL_CATEGORIES, selectToolsForQuery } from './tool-groups.ts';

export interface MCPToolDef {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface ToolSearchResult {
  selectedToolNames: string[];
  matchedCategories: string[];
  strategy: string;
  totalTools: number;
}

const DEFAULT_TOP_N = 24;
const DEFAULT_FALLBACK_N = 48;

const STOP_WORDS = new Set([
  'the', 'for', 'with', 'and', 'show', 'list', 'get', 'fetch', 'all', 'from',
  'this', 'that', 'into', 'about', 'what', 'which', 'where', 'when', 'please',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !STOP_WORDS.has(t));
}

function scoreTool(
  queryTokens: string[],
  tool: MCPToolDef,
  categoryBoost: number,
): number {
  const nameTokens = tokenize(tool.name.replace(/_/g, ' '));
  const descTokens = tokenize(tool.description || '');
  const schemaTokens = tokenize(JSON.stringify(tool.inputSchema || {}));

  let score = categoryBoost;

  for (const qt of queryTokens) {
    if (nameTokens.includes(qt)) score += 4;
    else if (nameTokens.some(t => t.startsWith(qt) || qt.startsWith(t))) score += 2;

    if (descTokens.includes(qt)) score += 2;
    else if (descTokens.some(t => t.startsWith(qt) || qt.startsWith(t))) score += 1;

    if (schemaTokens.includes(qt)) score += 1;
  }

  if (/^(create_|update_|delete_|void_|cancel_)/.test(tool.name)) score += 0.25;
  if (/^(get_|list_|search_|find_|fetch_)/.test(tool.name)) score += 0.5;

  return score;
}

function getCategoryMatches(query: string): string[] {
  const q = query.toLowerCase();
  const matches: string[] = [];
  for (const category of TOOL_CATEGORIES) {
    if (category.keywords.some(keyword => q.includes(keyword.toLowerCase()))) {
      matches.push(category.name);
    }
  }
  return matches;
}

export function selectMcpToolsForQuery(
  query: string,
  mcpTools: MCPToolDef[],
  options?: {
    topN?: number;
    fallbackN?: number;
    requiredToolNames?: string[];
  },
): ToolSearchResult {
  const topN = options?.topN ?? DEFAULT_TOP_N;
  const fallbackN = options?.fallbackN ?? DEFAULT_FALLBACK_N;
  const required = new Set(options?.requiredToolNames || []);

  const totalTools = mcpTools.length;
  if (totalTools === 0) {
    return {
      selectedToolNames: [],
      matchedCategories: [],
      strategy: 'no_mcp_tools',
      totalTools,
    };
  }

  const queryTokens = tokenize(query);
  const matchedCategories = getCategoryMatches(query);
  const staticSelection = selectToolsForQuery(query, 'unified', mcpTools);

  const categoryToolSet = new Set<string>();
  for (const categoryName of matchedCategories) {
    const category = TOOL_CATEGORIES.find(c => c.name === categoryName);
    if (!category) continue;
    for (const toolName of category.tools) categoryToolSet.add(toolName);
  }

  const scored = mcpTools.map(tool => {
    const categoryBoost = categoryToolSet.has(tool.name) ? 6 : 0;
    const score = scoreTool(queryTokens, tool, categoryBoost);
    return { toolName: tool.name, score };
  }).sort((a, b) => b.score - a.score);

  const selected: string[] = [];
  for (const item of scored) {
    if (item.score <= 0) continue;
    if (!selected.includes(item.toolName)) selected.push(item.toolName);
    if (selected.length >= topN) break;
  }

  for (const requiredTool of required) {
    if (!selected.includes(requiredTool) && mcpTools.some(t => t.name === requiredTool)) {
      selected.push(requiredTool);
    }
  }

  if (selected.length > 0) {
    return {
      selectedToolNames: selected,
      matchedCategories: matchedCategories.length > 0 ? matchedCategories : staticSelection.matchedCategories,
      strategy: 'heuristic_topn',
      totalTools,
    };
  }

  const staticFallback = staticSelection.toolNames
    .filter(name => mcpTools.some(tool => tool.name === name))
    .slice(0, fallbackN);

  for (const requiredTool of required) {
    if (!staticFallback.includes(requiredTool) && mcpTools.some(t => t.name === requiredTool)) {
      staticFallback.push(requiredTool);
    }
  }

  if (staticFallback.length > 0) {
    return {
      selectedToolNames: staticFallback,
      matchedCategories: staticSelection.matchedCategories,
      strategy: 'fallback_category_set',
      totalTools,
    };
  }

  const allTools = mcpTools.map(tool => tool.name);
  return {
    selectedToolNames: allTools,
    matchedCategories: staticSelection.matchedCategories,
    strategy: 'fallback_all_tools',
    totalTools,
  };
}

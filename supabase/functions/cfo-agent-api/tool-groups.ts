// Re-export from shared module — single source of truth
export {
  TOOL_CATEGORIES,
  selectToolsForQuery,
  buildOpenAIToolsFromMcp,
  detectFollowUp,
  type ToolCategory,
  type OpenAITool,
  type FollowUpResult,
} from "../_shared/tool-groups.ts";

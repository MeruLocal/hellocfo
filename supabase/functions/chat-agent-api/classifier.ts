// Re-export classifier from shared — single source of truth
export {
  classifyQuery,
  detectCrossOver,
  type QueryCategory,
  type ClassificationResult,
} from "../_shared/classifier.ts";

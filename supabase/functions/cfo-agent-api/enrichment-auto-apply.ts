// Re-export enrichment-auto-apply from shared — single source of truth
export {
  detectAutoEnrichments,
  buildEnrichmentInstructions,
  type AutoEnrichment,
} from "../_shared/enrichment-auto-apply.ts";

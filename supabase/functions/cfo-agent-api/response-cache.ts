// Response Cache Layer — Phase 2
// Provides aggressive caching with entity isolation and TTL-based invalidation

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getInvalidationTargets } from "../_shared/tool-groups.ts";

export interface CacheEntry {
  id: string;
  cache_key: string;
  entity_id: string;
  query_hash: string;
  query_text: string;
  content: string;
  path: string;
  ttl_seconds: number;
  created_at: string;
}

const TTL_CONFIG: Record<string, number> = {
  aging_report: 600,
  financial_summary: 600,
  list_invoices: 300,
  list_bills: 300,
  list_payments: 300,
  list_customers: 300,
  list_vendors: 300,
  list_transactions: 300,
  get_by_id: 120,
  general_chat: 1800,
  default: 300,
};

export function generateCacheKey(
  query: string,
  entityId: string,
  path: string,
): { cacheKey: string; queryHash: string } {
  const normalized = query.toLowerCase().trim().replace(/\s+/g, " ");
  const queryHash = simpleHash(normalized);
  const cacheKey = `${entityId}:${path}:${queryHash}`;
  return { cacheKey, queryHash };
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function determineTTL(
  path: string,
  category: string,
  toolsUsed: string[],
): number {
  if (category === "general_chat") return TTL_CONFIG.general_chat;
  for (const tool of toolsUsed) {
    if (tool.includes("aged") || tool.includes("aging") || tool.includes("report")) return TTL_CONFIG.aging_report;
    if (tool.includes("get_all") || tool.includes("get_bills") || tool.includes("get_all_invoices")) return TTL_CONFIG.list_invoices;
    if (tool.includes("_by_id")) return TTL_CONFIG.get_by_id;
  }
  return TTL_CONFIG.default;
}

export async function checkCache(
  supabase: ReturnType<typeof createClient>,
  entityId: string,
  cacheKey: string,
  reqId: string,
): Promise<CacheEntry | null> {
  try {
    const { data, error } = await supabase
      .from("response_cache")
      .select("*")
      .eq("cache_key", cacheKey)
      .eq("entity_id", entityId)
      .single();

    if (error || !data) return null;

    const createdAt = new Date(data.created_at).getTime();
    const ttlMs = (data.ttl_seconds || 300) * 1000;
    const now = Date.now();

    if (now - createdAt > ttlMs) {
      await supabase.from("response_cache").delete().eq("id", data.id);
      return null;
    }

    console.log(`[${reqId}] Cache HIT: ${cacheKey} (age: ${((now - createdAt) / 1000).toFixed(0)}s)`);
    return data as CacheEntry;
  } catch (e) {
    console.error(`[${reqId}] Cache check error:`, e);
    return null;
  }
}

export async function writeCache(
  supabase: ReturnType<typeof createClient>,
  entityId: string,
  cacheKey: string,
  queryHash: string,
  queryText: string,
  content: string,
  path: string,
  ttlSeconds: number,
  reqId: string,
): Promise<void> {
  try {
    if (content.length < 20 || content.length > 50000) return;

    await supabase
      .from("response_cache")
      .upsert({
        cache_key: cacheKey,
        entity_id: entityId,
        query_hash: queryHash,
        query_text: queryText,
        content,
        path,
        ttl_seconds: ttlSeconds,
        created_at: new Date().toISOString(),
      }, { onConflict: "cache_key" });

    console.log(`[${reqId}] Cache WRITE: key=${cacheKey}, ttl=${ttlSeconds}s`);
  } catch (e) {
    console.error(`[${reqId}] Cache write error:`, e);
  }
}

export async function invalidateCacheForEntity(
  supabase: ReturnType<typeof createClient>,
  entityId: string,
  toolsUsed: string[],
  reqId: string,
): Promise<number> {
  const isWriteOp = toolsUsed.some(t =>
    t.startsWith("update_") || t.startsWith("create_") || t.startsWith("delete_") ||
    t.startsWith("edit_") || t.startsWith("file_") || t.startsWith("generate_") ||
    t.startsWith("cancel_") || t.startsWith("reconcile_") || t.startsWith("import_") ||
    t.startsWith("categorize_") || t.startsWith("match_") || t.startsWith("adjust_") ||
    t.startsWith("stock_") || t.startsWith("record_")
  );
  if (!isWriteOp) return 0;

  try {
      const targets = getInvalidationTargets(toolsUsed);

    if (targets === null || targets.length === 0) {
      if (targets === null) {
        const { data } = await supabase
          .from("response_cache")
          .delete()
          .eq("entity_id", entityId)
          .select("id");
        const count = data?.length || 0;
        if (count > 0) console.log(`[${reqId}] Cache INVALIDATED ALL: ${count} entries`);
        return count;
      }
      return 0;
    }

    let totalDeleted = 0;
    for (const target of targets) {
      const { data } = await supabase
        .from("response_cache")
        .delete()
        .eq("entity_id", entityId)
        .ilike("path", `%${target}%`)
        .select("id");
      totalDeleted += data?.length || 0;
    }
    if (totalDeleted > 0) console.log(`[${reqId}] Cache TARGETED: ${totalDeleted} entries (${targets.join(", ")})`);
    return totalDeleted;
  } catch (e) {
    console.error(`[${reqId}] Cache invalidation error:`, e);
    return 0;
  }
}

export function hasWriteOperations(toolsUsed: string[]): boolean {
  return toolsUsed.some(t =>
    t.startsWith("update_") || t.startsWith("create_") || t.startsWith("delete_") ||
    t.startsWith("edit_") || t.startsWith("file_") || t.startsWith("generate_") ||
    t.startsWith("cancel_") || t.startsWith("reconcile_") || t.startsWith("import_") ||
    t.startsWith("categorize_") || t.startsWith("match_") || t.startsWith("adjust_") ||
    t.startsWith("stock_") || t.startsWith("record_")
  );
}

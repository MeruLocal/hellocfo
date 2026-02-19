import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCallback, useMemo } from "react";

export interface EntityDetails {
  entity_id: string;
  entity_name: string;
  org_id: string;
  org_name?: string;
  gstin?: string;
  pan?: string;
  address?: string;
  state?: string;
  city?: string;
  is_active?: boolean;
}

export interface Organization {
  org_id: string;
  org_name: string;
}

interface EntityCache {
  [key: string]: EntityDetails;
}

// Build cache key from entity_id and org_id
const buildCacheKey = (entityId: string, orgId: string) => `${orgId}:${entityId}`;

// Hook to fetch ALL entities (for dropdowns)
export function useAllEntities() {
  return useQuery({
    queryKey: ["all-entities"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-entity-details", {
        body: { action: "list_all" },
      });

      if (error) throw error;
      return {
        entities: (data?.entities || []) as EntityDetails[],
        organizations: (data?.organizations || []) as Organization[],
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000,
  });
}

// Hook to fetch entities by organization
export function useEntitiesByOrg(orgId: string | null) {
  return useQuery({
    queryKey: ["entities-by-org", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      
      const { data, error } = await supabase.functions.invoke("get-entity-details", {
        body: { action: "list_by_org", org_id: orgId },
      });

      if (error) throw error;
      return (data?.entities || []) as EntityDetails[];
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useEntityDetails() {
  const queryClient = useQueryClient();

  // Fetch single entity details
  const fetchEntityDetails = useCallback(async (entityId: string, orgId: string): Promise<EntityDetails> => {
    const cacheKey = buildCacheKey(entityId, orgId);
    
    // Check if already in cache
    const cached = queryClient.getQueryData<EntityDetails>(["entity-details", cacheKey]);
    if (cached) {
      return cached;
    }

    try {
      const { data, error } = await supabase.functions.invoke("get-entity-details", {
        body: { entity_id: entityId, org_id: orgId },
      });

      if (error) throw error;

      const entity: EntityDetails = {
        entity_id: data?.entity_id || entityId,
        entity_name: data?.entity_name || entityId,
        org_id: data?.org_id || orgId,
        org_name: data?.org_name,
        gstin: data?.gstin,
        pan: data?.pan,
        state: data?.state,
        city: data?.city,
      };

      // Cache the result
      queryClient.setQueryData(["entity-details", cacheKey], entity);
      
      return entity;
    } catch (err) {
      console.error("Failed to fetch entity details:", err);
      // Return fallback with ID as name
      return {
        entity_id: entityId,
        entity_name: entityId,
        org_id: orgId,
      };
    }
  }, [queryClient]);

  // Get entity from cache (sync) or return fallback
  const getEntityFromCache = useCallback((entityId: string, orgId: string): EntityDetails | null => {
    const cacheKey = buildCacheKey(entityId, orgId);
    return queryClient.getQueryData<EntityDetails>(["entity-details", cacheKey]) || null;
  }, [queryClient]);

  // Prefetch multiple entities at once
  const prefetchEntities = useCallback(async (entities: Array<{ entityId: string; orgId: string }>) => {
    const uncached = entities.filter(({ entityId, orgId }) => {
      const cacheKey = buildCacheKey(entityId, orgId);
      return !queryClient.getQueryData(["entity-details", cacheKey]);
    });

    // Fetch uncached entities in parallel (batch of 5 at a time to avoid overwhelming)
    const batchSize = 5;
    for (let i = 0; i < uncached.length; i += batchSize) {
      const batch = uncached.slice(i, i + batchSize);
      await Promise.all(
        batch.map(({ entityId, orgId }) => fetchEntityDetails(entityId, orgId))
      );
    }
  }, [queryClient, fetchEntityDetails]);

  return {
    fetchEntityDetails,
    getEntityFromCache,
    prefetchEntities,
  };
}

// Hook to fetch and subscribe to a single entity's details
export function useEntityDetail(entityId: string | null, orgId: string | null) {
  return useQuery({
    queryKey: ["entity-details", entityId && orgId ? buildCacheKey(entityId, orgId) : null],
    queryFn: async () => {
      if (!entityId || !orgId) return null;
      
      const { data, error } = await supabase.functions.invoke("get-entity-details", {
        body: { entity_id: entityId, org_id: orgId },
      });

      if (error) throw error;
      
      return {
        entity_id: data?.entity_id || entityId,
        entity_name: data?.entity_name || entityId,
        org_id: data?.org_id || orgId,
        org_name: data?.org_name,
        gstin: data?.gstin,
        pan: data?.pan,
        state: data?.state,
        city: data?.city,
      } as EntityDetails;
    },
    enabled: !!entityId && !!orgId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes (formerly cacheTime)
  });
}

// Hook for bulk entity lookup with caching
export function useEntitiesLookup(entities: Array<{ entityId: string; orgId: string }>) {
  const uniqueEntities = useMemo(() => {
    const seen = new Set<string>();
    return entities.filter(({ entityId, orgId }) => {
      const key = buildCacheKey(entityId, orgId);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [entities]);

  return useQuery({
    queryKey: ["entities-bulk", uniqueEntities.map(e => buildCacheKey(e.entityId, e.orgId)).sort().join(",")],
    queryFn: async () => {
      const results: EntityCache = {};
      
      // Fetch all entities in parallel
      await Promise.all(
        uniqueEntities.map(async ({ entityId, orgId }) => {
          try {
            const { data, error } = await supabase.functions.invoke("get-entity-details", {
              body: { entity_id: entityId, org_id: orgId },
            });
            
            if (!error && data) {
              results[buildCacheKey(entityId, orgId)] = {
                entity_id: data.entity_id || entityId,
                entity_name: data.entity_name || entityId,
                org_id: data.org_id || orgId,
                org_name: data.org_name,
                gstin: data.gstin,
                pan: data.pan,
                state: data.state,
              };
            } else {
              // Fallback
              results[buildCacheKey(entityId, orgId)] = {
                entity_id: entityId,
                entity_name: entityId,
                org_id: orgId,
              };
            }
          } catch {
            results[buildCacheKey(entityId, orgId)] = {
              entity_id: entityId,
              entity_name: entityId,
              org_id: orgId,
            };
          }
        })
      );
      
      return results;
    },
    enabled: uniqueEntities.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

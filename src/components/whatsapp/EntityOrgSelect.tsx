import { useState, useEffect } from "react";
import { useAllEntities, EntityDetails, Organization } from "@/hooks/useEntityDetails";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

interface EntityOrgSelectProps {
  selectedEntityId: string;
  selectedOrgId: string;
  onSelect: (entityId: string, orgId: string) => void;
  disabled?: boolean;
  showLabels?: boolean;
  className?: string;
}

export function EntityOrgSelect({
  selectedEntityId,
  selectedOrgId,
  onSelect,
  disabled = false,
  showLabels = true,
  className = "",
}: EntityOrgSelectProps) {
  const { data, isLoading } = useAllEntities();
  const [orgId, setOrgId] = useState(selectedOrgId);

  // Update local state when props change
  useEffect(() => {
    setOrgId(selectedOrgId);
  }, [selectedOrgId]);

  const organizations = data?.organizations || [];
  const allEntities = data?.entities || [];
  
  // Filter entities by selected org
  const filteredEntities = orgId
    ? allEntities.filter((e) => e.org_id === orgId)
    : allEntities;

  const handleOrgChange = (newOrgId: string) => {
    setOrgId(newOrgId);
    // Clear entity selection when org changes
    onSelect("", newOrgId);
  };

  const handleEntityChange = (entityId: string) => {
    const entity = allEntities.find((e) => e.entity_id === entityId);
    if (entity) {
      onSelect(entity.entity_id, entity.org_id);
    }
  };

  if (isLoading) {
    return (
      <div className={`grid grid-cols-2 gap-4 ${className}`}>
        <div>
          {showLabels && <Label className="mb-1 block">Organization</Label>}
          <Skeleton className="h-10 w-full" />
        </div>
        <div>
          {showLabels && <Label className="mb-1 block">Entity</Label>}
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-2 gap-4 ${className}`}>
      <div>
        {showLabels && <Label className="mb-1 block">Organization</Label>}
        <Select value={orgId} onValueChange={handleOrgChange} disabled={disabled}>
          <SelectTrigger>
            <SelectValue placeholder="Select organization..." />
          </SelectTrigger>
          <SelectContent className="bg-background border shadow-lg z-50">
            {organizations.map((org) => (
              <SelectItem key={org.org_id} value={org.org_id}>
                {org.org_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        {showLabels && <Label className="mb-1 block">Entity</Label>}
        <Select
          value={selectedEntityId}
          onValueChange={handleEntityChange}
          disabled={disabled || !orgId}
        >
          <SelectTrigger>
            <SelectValue placeholder={orgId ? "Select entity..." : "Select org first..."} />
          </SelectTrigger>
          <SelectContent className="bg-background border shadow-lg z-50">
            {filteredEntities.map((entity) => (
              <SelectItem key={entity.entity_id} value={entity.entity_id}>
                <div className="flex flex-col">
                  <span className="font-medium">{entity.entity_name}</span>
                  {entity.gstin && (
                    <span className="text-xs text-muted-foreground">
                      GSTIN: {entity.gstin}
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
            {filteredEntities.length === 0 && (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                No entities found
              </div>
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// Compact single-select version (selects entity, auto-sets org)
interface EntitySelectProps {
  value: string; // entity_id
  onValueChange: (entityId: string, orgId: string, entity: EntityDetails | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function EntitySelect({
  value,
  onValueChange,
  disabled = false,
  placeholder = "Select entity...",
  className = "",
}: EntitySelectProps) {
  const { data, isLoading } = useAllEntities();
  const entities = data?.entities || [];

  const handleChange = (entityId: string) => {
    const entity = entities.find((e) => e.entity_id === entityId) || null;
    onValueChange(entityId, entity?.org_id || "", entity);
  };

  if (isLoading) {
    return <Skeleton className={`h-10 w-full ${className}`} />;
  }

  return (
    <Select value={value} onValueChange={handleChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="bg-background border shadow-lg z-50">
        {entities.map((entity) => (
          <SelectItem key={`${entity.org_id}-${entity.entity_id}`} value={entity.entity_id}>
            <div className="flex items-center gap-2">
              <span className="font-medium">{entity.entity_name}</span>
              <span className="text-xs text-muted-foreground">({entity.org_name})</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

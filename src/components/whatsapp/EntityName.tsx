import { useEntityDetail } from "@/hooks/useEntityDetails";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface EntityNameProps {
  entityId: string;
  orgId: string;
  showOrg?: boolean;
  className?: string;
}

export function EntityName({ entityId, orgId, showOrg = false, className = "" }: EntityNameProps) {
  const { data: entity, isLoading } = useEntityDetail(entityId, orgId);

  if (isLoading) {
    return <Skeleton className="h-4 w-24" />;
  }

  const rawName = entity?.entity_name;
  const entityName = typeof rawName === 'string' ? rawName : entityId;
  const rawOrg = entity?.org_name;
  const orgName = typeof rawOrg === 'string' ? rawOrg : orgId;
  const hasDetails = entity?.gstin || entity?.pan || entity?.state;

  const content = (
    <div className={`space-y-0.5 ${className}`}>
      <div className="text-sm font-medium">{entityName}</div>
      {showOrg && (
        <div className="text-xs text-muted-foreground">{orgName}</div>
      )}
    </div>
  );

  if (hasDetails) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="cursor-help">{content}</div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1 text-xs">
              {entity?.gstin && <div>GSTIN: {entity.gstin}</div>}
              {entity?.pan && <div>PAN: {entity.pan}</div>}
              {entity?.state && <div>State: {entity.state}</div>}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return content;
}

// Compact version for tables
interface EntityNameCompactProps {
  entityId: string;
  orgId: string;
}

export function EntityNameCompact({ entityId, orgId }: EntityNameCompactProps) {
  const { data: entity, isLoading } = useEntityDetail(entityId, orgId);

  if (isLoading) {
    return <Skeleton className="h-3 w-20 inline-block" />;
  }

  const name = entity?.entity_name;
  return <span>{typeof name === 'string' ? name : entityId}</span>;
}

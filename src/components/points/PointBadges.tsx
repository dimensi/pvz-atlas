import type { ComponentProps } from "react";
import { canonicalizeBrand, getBrandLabel } from "@/lib/brands";
import type { PointStatus } from "@/lib/data-model/types";
import { POINT_STATUS_LABELS } from "@/lib/points/list";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type BadgeProps = Omit<ComponentProps<typeof Badge>, "children" | "variant">;

export function BrandBadge({
  brand,
  className,
  ...props
}: BadgeProps & { brand: string | null | undefined }) {
  const colorClass = `brand-pill-${canonicalizeBrand(brand) ?? "other"}`;

  return (
    <Badge className={cn(colorClass, className)} {...props}>
      {getBrandLabel(brand)}
    </Badge>
  );
}

export function StatusBadge({
  status,
  className,
  ...props
}: BadgeProps & { status: PointStatus }) {
  const colorClass = `point-status-${status.replace("_", "-")}`;

  return (
    <Badge className={cn(colorClass, className)} {...props}>
      {POINT_STATUS_LABELS[status]}
    </Badge>
  );
}

"use client";

import { MessageSquare, Navigation, Pencil, UserPlus, Trash2 } from "lucide-react";
import type { Owner, Point, PointStatus } from "@/lib/data-model/types";
import { BrandBadge, StatusBadge } from "@/components/points/PointBadges";
import { PointStatusPicker } from "@/components/points/PointStatusPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DrawerFooter } from "@/components/ui/drawer";
import { Label } from "@/components/ui/label";

export interface PointDetailsContentProps {
  point: Point;
  owner: Owner | null;
  distanceLabel?: string | null;
  routeUrl?: string | null;
  isSavingStatus?: boolean;
  onStatusSelect: (status: PointStatus) => void | Promise<void>;
  onAssignOwner?: () => void;
  onEdit: () => void;
  onNote: () => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function PointDetailsContent({
  point,
  owner,
  distanceLabel,
  routeUrl,
  isSavingStatus = false,
  onStatusSelect,
  onAssignOwner,
  onEdit,
  onNote,
  onDelete,
  onClose
}: PointDetailsContentProps) {
  const isClosed = point.status === "closed";

  return (
    <div className="point-details-content">
      <div className="point-meta-row">
        <BrandBadge brand={point.brand} />
        <Badge
          variant={owner ? "secondary" : "outline"}
          className="point-details-owner-badge"
        >
          {owner?.name ?? "Без владельца"}
        </Badge>
        {distanceLabel ? <Badge variant="secondary">{distanceLabel}</Badge> : null}
      </div>

      <div className="point-details-heading">
        <h3>{point.address}</h3>
        <p>{point.city}</p>
      </div>

      {point.comment ? <p className="point-details-note">{point.comment}</p> : null}

      <div className="ui-field">
        <Label>Статус</Label>
        <PointStatusPicker
          value={point.status}
          onSelect={onStatusSelect}
          disabled={isSavingStatus || isClosed}
        />
      </div>

      {routeUrl ? (
        <Button asChild className="point-details-route">
          <a href={routeUrl} target="_blank" rel="noreferrer">
            <Navigation size={18} aria-hidden="true" />
            Маршрут
          </a>
        </Button>
      ) : null}

      <div className="point-details-actions" aria-label="Действия с ПВЗ">
        {onAssignOwner ? (
          <Button
            type="button"
            variant="outline"
            className="point-details-actions-wide"
            onClick={onAssignOwner}
          >
            <UserPlus size={18} aria-hidden="true" />
            Назначить владельца
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onNote}>
          <MessageSquare size={18} aria-hidden="true" />
          Заметка
        </Button>
        <Button type="button" variant="outline" onClick={onEdit}>
          <Pencil size={18} aria-hidden="true" />
          Редактировать
        </Button>
      </div>

      <DrawerFooter className="point-details-footer">
        <Button type="button" variant="secondary" onClick={onClose}>
          Готово
        </Button>
      </DrawerFooter>
    </div>
  );
}

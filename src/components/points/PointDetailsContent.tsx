"use client";

import { MessageSquare, Navigation, Pencil, UserPlus } from "lucide-react";
import type { Owner, Point, PointStatus } from "@/lib/data-model/types";
import { BrandBadge } from "@/components/points/PointBadges";
import { PointStatusPicker } from "@/components/points/PointStatusPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  buildPhoneUrl,
  buildTelegramUrl,
  formatTelegramLabel
} from "@/lib/owners/contacts";

export interface PointDetailsVisibleActions {
  route?: boolean;
  assignOwner?: boolean;
  note?: boolean;
  edit?: boolean;
}

export interface PointDetailsContentProps {
  point: Point;
  owner: Owner | null;
  distanceLabel?: string | null;
  routeUrl?: string | null;
  isSavingStatus?: boolean;
  visibleActions?: PointDetailsVisibleActions;
  onStatusSelect: (status: PointStatus) => void | Promise<void>;
  onAssignOwner?: () => void;
  onEdit: () => void;
  onNote: () => void;
}

export function PointDetailsContent({
  point,
  owner,
  distanceLabel,
  routeUrl,
  isSavingStatus = false,
  visibleActions,
  onStatusSelect,
  onAssignOwner,
  onEdit,
  onNote
}: PointDetailsContentProps) {
  const isClosed = point.status === "closed";
  const showRoute = visibleActions?.route ?? Boolean(routeUrl);
  const showAssignOwner = visibleActions?.assignOwner ?? Boolean(onAssignOwner);
  const showNote = visibleActions?.note ?? true;
  const showEdit = visibleActions?.edit ?? true;
  const phoneUrl = buildPhoneUrl(owner?.phone);
  const telegramUrl = buildTelegramUrl(owner?.telegram);
  const telegramLabel = formatTelegramLabel(owner?.telegram);

  return (
    <div className="point-details-content">
      <div className="point-meta-row">
        <BrandBadge brand={point.brand} />
        {distanceLabel ? <Badge variant="secondary">{distanceLabel}</Badge> : null}
      </div>

      <div className="point-details-owner">
        {owner ? (
          <>
            <span className="point-details-owner-name">{owner.name}</span>
            {phoneUrl && owner.phone ? (
              <>
                <span className="point-group-contact-sep" aria-hidden="true">
                  ·
                </span>
                <a className="point-group-contact-link" href={phoneUrl}>
                  {owner.phone}
                </a>
              </>
            ) : null}
            {telegramUrl && telegramLabel ? (
              <>
                <span className="point-group-contact-sep" aria-hidden="true">
                  ·
                </span>
                <a className="point-group-contact-link" href={telegramUrl}>
                  {telegramLabel}
                </a>
              </>
            ) : null}
          </>
        ) : (
          <span className="point-details-owner-empty">Без владельца</span>
        )}
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

      {showRoute && routeUrl ? (
        <Button asChild className="point-details-route">
          <a href={routeUrl} target="_blank" rel="noreferrer">
            <Navigation size={18} aria-hidden="true" />
            Маршрут
          </a>
        </Button>
      ) : null}

      <div className="point-details-actions" aria-label="Действия с ПВЗ">
        {showAssignOwner && onAssignOwner ? (
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
        {showNote ? (
          <Button type="button" variant="outline" onClick={onNote}>
            <MessageSquare size={18} aria-hidden="true" />
            Заметка
          </Button>
        ) : null}
        {showEdit ? (
          <Button type="button" variant="outline" onClick={onEdit}>
            <Pencil size={18} aria-hidden="true" />
            Редактировать
          </Button>
        ) : null}
      </div>
    </div>
  );
}

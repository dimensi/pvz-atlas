"use client";

import type { PointStatus } from "@/lib/data-model/types";
import {
  EDITABLE_POINT_STATUSES,
  POINT_STATUS_LABELS,
  type EditablePointStatus
} from "@/lib/points/list";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";

function statusOptionClassName(status: EditablePointStatus, isSelected: boolean): string {
  return cn(
    "point-status-picker-option",
    isSelected && `point-status-picker-option-selected point-status-picker-option-${status.replace("_", "-")}`
  );
}

export interface PointStatusPickerProps {
  value: PointStatus;
  onSelect: (status: PointStatus) => void | Promise<void>;
  disabled?: boolean;
}

export function PointStatusPicker({ value, onSelect, disabled = false }: PointStatusPickerProps) {
  return (
    <ButtonGroup
      aria-label="Статус ПВЗ"
      className="point-status-picker w-full [&>[data-slot=button]]:min-h-11 [&>[data-slot=button]]:flex-1 [&>[data-slot=button]]:px-2"
    >
      {EDITABLE_POINT_STATUSES.map((status) => {
        const isSelected = value === status;

        return (
          <Button
            key={status}
            type="button"
            variant="outline"
            size="sm"
            className={statusOptionClassName(status, isSelected)}
            aria-pressed={isSelected}
            disabled={disabled}
            onClick={() => {
              if (status !== value) {
                void onSelect(status);
              }
            }}
          >
            {POINT_STATUS_LABELS[status]}
          </Button>
        );
      })}
    </ButtonGroup>
  );
}

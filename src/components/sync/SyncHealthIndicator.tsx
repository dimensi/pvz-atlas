"use client";

import { AlertTriangle, CheckCircle2, Clock3, WifiOff } from "lucide-react";
import type { Change, Conflict } from "@/lib/data-model/types";

export type SyncHealthState = "synced" | "pending" | "conflict" | "offline" | "error" | "refreshing";

interface SyncHealthIndicatorProps {
  pendingChanges: Change[];
  conflicts: Conflict[];
  isOnline: boolean;
  isRefreshing?: boolean;
  error?: string | null;
  showSynced?: boolean;
}

function getSyncHealthState({
  conflicts,
  error,
  isOnline,
  isRefreshing,
  pendingChanges
}: SyncHealthIndicatorProps): SyncHealthState {
  if (conflicts.length > 0) {
    return "conflict";
  }

  if (error) {
    return "error";
  }

  if (!isOnline) {
    return "offline";
  }

  if (pendingChanges.length > 0) {
    return "pending";
  }

  if (isRefreshing) {
    return "refreshing";
  }

  return "synced";
}

function labelForState(state: SyncHealthState, pendingCount: number, conflictCount: number): string {
  if (state === "offline") {
    return pendingCount > 0 ? `Будет отправлено при сети: ${pendingCount}` : "Офлайн";
  }

  if (state === "pending") {
    return `Будет отправлено: ${pendingCount}`;
  }

  if (state === "conflict") {
    return `Есть конфликт: ${conflictCount}`;
  }

  if (state === "error") {
    return "Ошибка синхронизации";
  }

  if (state === "refreshing") {
    return "Обновляю";
  }

  return "Сохранено";
}

function iconForState(state: SyncHealthState) {
  if (state === "offline") {
    return <WifiOff size={14} aria-hidden="true" />;
  }

  if (state === "conflict" || state === "error") {
    return <AlertTriangle size={14} aria-hidden="true" />;
  }

  if (state === "pending" || state === "refreshing") {
    return <Clock3 size={14} aria-hidden="true" />;
  }

  return <CheckCircle2 size={14} aria-hidden="true" />;
}

export function SyncHealthIndicator(props: SyncHealthIndicatorProps) {
  const state = getSyncHealthState(props);
  const pendingCount = props.pendingChanges.length;
  const conflictCount = props.conflicts.length;
  const role = state === "conflict" || state === "error" ? "alert" : "status";

  if (state === "synced" && !props.showSynced) {
    return null;
  }

  const content = (
    <>
      {iconForState(state)}
      <span>{labelForState(state, pendingCount, conflictCount)}</span>
    </>
  );

  if (state !== "synced" && state !== "refreshing") {
    return (
      <a className={`sync-badge sync-badge-${state}`} href="/sync" role={role}>
        {content}
      </a>
    );
  }

  return (
    <div className={`sync-badge sync-badge-${state}`} role={role}>
      {content}
    </div>
  );
}

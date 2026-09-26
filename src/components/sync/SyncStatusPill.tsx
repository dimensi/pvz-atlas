"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, WifiOff } from "lucide-react";
import { OfflineAwareLink } from "@/components/pwa/OfflineAwareLink";
import type { SyncStatusDisplay } from "@/lib/sync/status";
import { useSyncOverview } from "./SyncOverviewProvider";

const lastStatusKey = "pvz-atlas-last-sync-status";
const statusChangedEvent = "pvz-atlas-sync-status-changed";

function subscribeToLastStatus(callback: () => void): () => void {
  window.addEventListener(statusChangedEvent, callback);
  return () => window.removeEventListener(statusChangedEvent, callback);
}

function getLastStatusSnapshot(): string | null {
  try {
    return sessionStorage.getItem(lastStatusKey);
  } catch {
    return null;
  }
}

function readLastStatus(serialized: string | null): SyncStatusDisplay | null {
  try {
    const value: unknown = JSON.parse(serialized ?? "null");
    if (value && typeof value === "object" && "kind" in value && "label" in value &&
      "needsAttention" in value && typeof value.kind === "string" &&
      typeof value.label === "string" && typeof value.needsAttention === "boolean") {
      return value as SyncStatusDisplay;
    }
  } catch {
    // A disabled session store only removes the remembered display state.
  }
  return null;
}

function shortLabel(kind: string, fullLabel: string, pendingCount: number, noticeCount: number): string {
  if (kind === "review") return "Обновить";
  if (kind === "error") return "Ошибка";
  if (kind === "checking") return "Проверяю";
  if (kind === "verified") return "Проверено";
  if (kind === "updated") return "Обновлено";
  if (kind === "never") return "Нет проверки";
  if (kind === "notice") return `${noticeCount} не ${noticeCount === 1 ? "принята" : "приняты"}`;
  if (kind === "held") return "Старые правки";
  if (kind === "pending") return `${pendingCount} ждут`;
  if (kind === "offline" && pendingCount > 0) return `Офлайн · ${pendingCount}`;
  return fullLabel;
}

export function SyncStatusPill() {
  const { status, pendingCount, unreadNoticeCount, ready, online, run } = useSyncOverview();
  const lastStatusSnapshot = useSyncExternalStore(subscribeToLastStatus, getLastStatusSnapshot, () => null);
  const lastStatus = useMemo(() => readLastStatus(lastStatusSnapshot), [lastStatusSnapshot]);

  const remembering = online && run?.state === "checking" &&
    (status.kind === "verified" || status.kind === "never") && lastStatus;
  const display = remembering ? lastStatus : status;

  useEffect(() => {
    if (!ready || (online && run?.state === "checking")) return;
    try {
      sessionStorage.setItem(lastStatusKey, JSON.stringify(status));
      window.dispatchEvent(new Event(statusChangedEvent));
    } catch {
      // The live status remains available when session storage is disabled.
    }
  }, [online, ready, run?.state, status]);

  const Icon = display.kind === "offline" ? WifiOff
    : display.kind === "review" || display.kind === "error" || display.kind === "notice" || display.kind === "held" || display.kind === "never" || display.kind === "updated"
      ? AlertTriangle
      : display.kind === "verified" ? CheckCircle2
        : display.kind === "checking" ? RefreshCw : Clock3;

  return (
    <OfflineAwareLink
      aria-label={`${display.label}. Открыть состояние данных`}
      className={`status-pill sync-access-link sync-access-${display.kind}`}
      data-ready={ready ? "true" : undefined}
      href="/sync"
      title={display.label}
    >
      <Icon size={16} aria-hidden="true" />
      <span className="sync-pill-full">{display.label}</span>
      <span className="sync-pill-short">
        {remembering ? display.label : shortLabel(display.kind, display.label, pendingCount, unreadNoticeCount)}
      </span>
    </OfflineAwareLink>
  );
}

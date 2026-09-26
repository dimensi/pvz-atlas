"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, WifiOff } from "lucide-react";
import { useSyncOverview } from "./SyncOverviewProvider";

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
  const { status, pendingCount, unreadNoticeCount } = useSyncOverview();
  const Icon = status.kind === "offline" ? WifiOff
    : status.kind === "review" || status.kind === "error" || status.kind === "notice" || status.kind === "held" || status.kind === "never" || status.kind === "updated"
      ? AlertTriangle
      : status.kind === "verified" ? CheckCircle2
        : status.kind === "checking" ? RefreshCw : Clock3;

  return (
    <Link
      aria-label={`${status.label}. Открыть состояние данных`}
      className={`status-pill sync-access-link sync-access-${status.kind}`}
      href="/sync"
      title={status.label}
    >
      <Icon size={16} aria-hidden="true" />
      <span className="sync-pill-full">{status.label}</span>
      <span className="sync-pill-short">
        {shortLabel(status.kind, status.label, pendingCount, unreadNoticeCount)}
      </span>
    </Link>
  );
}

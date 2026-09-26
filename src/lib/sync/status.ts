import type { Conflict } from "@/lib/data-model/types";
import type { CacheReplacementNotice, SeenSyncNotices, SyncReview, SyncRunState } from "./meta";

export type SyncStatusKind =
  | "review"
  | "offline"
  | "error"
  | "checking"
  | "notice"
  | "updated"
  | "pending"
  | "held"
  | "verified"
  | "never";

export interface SyncStatusInput {
  online: boolean;
  review: SyncReview | null;
  run: SyncRunState | null;
  lastPullServerTime: string | null;
  pendingCount: number;
  heldCount: number;
  unreadNoticeCount: number;
  replacementNotice: CacheReplacementNotice | null;
}

export interface SyncStatusDisplay {
  kind: SyncStatusKind;
  label: string;
  needsAttention: boolean;
}

export function countUnreadSyncNotices(
  conflicts: Conflict[],
  sourceId: string | null,
  seen: SeenSyncNotices | undefined
): number {
  if (!sourceId) return 0;
  return conflicts.filter((conflict) =>
    conflict.sourceId === sourceId &&
    conflict.localNotice === true &&
    conflict.resolution === "remote" &&
    conflict.resolvedAt !== null &&
    (seen?.sourceId !== sourceId || conflict.resolvedAt > seen.through)
  ).length;
}

function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export function deriveSyncStatus(input: SyncStatusInput): SyncStatusDisplay {
  if (input.review) {
    return { kind: "review", label: "Нужно обновить данные", needsAttention: true };
  }
  if (!input.online) {
    return {
      kind: "offline",
      label: input.pendingCount > 0
        ? `Офлайн · ${input.pendingCount} ${plural(input.pendingCount, "правка", "правки", "правок")}`
        : "Офлайн",
      needsAttention: false
    };
  }
  if (input.run?.state === "error") {
    return { kind: "error", label: "Не удалось обновить", needsAttention: true };
  }
  if (input.run?.state === "checking") {
    return {
      kind: "checking",
      label: input.pendingCount > 0 ? "Отправляю правки" : "Проверяю данные",
      needsAttention: false
    };
  }
  if (input.replacementNotice) {
    return { kind: "updated", label: "Данные обновлены", needsAttention: true };
  }
  if (input.unreadNoticeCount > 0) {
    return {
      kind: "notice",
      label: `${input.unreadNoticeCount} ${plural(input.unreadNoticeCount, "правка", "правки", "правок")} не ${plural(input.unreadNoticeCount, "применилась", "применились", "применились")}`,
      needsAttention: true
    };
  }
  if (input.pendingCount > 0) {
    return {
      kind: "pending",
      label: `${input.pendingCount} ${plural(input.pendingCount, "правка", "правки", "правок")} ${plural(input.pendingCount, "ждёт", "ждут", "ждут")} отправки`,
      needsAttention: false
    };
  }
  if (input.heldCount > 0) {
    return { kind: "held", label: "Есть старые правки", needsAttention: true };
  }
  if (input.lastPullServerTime) {
    return { kind: "verified", label: "Данные проверены", needsAttention: false };
  }
  return { kind: "never", label: "Нет проверки таблицы", needsAttention: true };
}

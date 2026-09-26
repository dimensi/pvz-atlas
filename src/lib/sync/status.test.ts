import { describe, expect, it } from "vitest";
import { countUnreadSyncNotices, deriveSyncStatus, type SyncStatusInput } from "./status";
import type { Conflict } from "@/lib/data-model/types";

const base: SyncStatusInput = {
  online: true,
  review: null,
  run: { state: "ok", at: "2026-09-26T10:00:00.000Z" },
  lastPullServerTime: "2026-09-26T10:00:00.000Z",
  pendingCount: 0,
  heldCount: 0,
  unreadNoticeCount: 0,
  replacementNotice: null
};

describe("operator sync status", () => {
  it("never calls untouched or failed data verified", () => {
    expect(deriveSyncStatus({ ...base, lastPullServerTime: null, run: null }).kind).toBe("never");
    expect(deriveSyncStatus({ ...base, run: { state: "error", at: base.lastPullServerTime! } }).kind).toBe("error");
  });

  it("shows a required refresh before routine queue or notice states", () => {
    expect(deriveSyncStatus({
      ...base,
      review: { kind: "source-changed", beforePoints: 500, afterPoints: 10,
        removedPoints: 490, removedOwners: 0, removedVisits: 0, pendingChanges: 2 },
      pendingCount: 2,
      unreadNoticeCount: 1
    }).kind).toBe("review");
  });

  it("distinguishes offline edits, pending edits, and unapplied edits", () => {
    expect(deriveSyncStatus({ ...base, online: false, pendingCount: 1 }).label).toBe("Офлайн · 1 правка");
    expect(deriveSyncStatus({ ...base, pendingCount: 1 }).label).toBe("1 правка ждёт отправки");
    expect(deriveSyncStatus({ ...base, unreadNoticeCount: 1 }).label).toBe("1 правка не применилась");
    expect(deriveSyncStatus({ ...base, heldCount: 2 }).kind).toBe("held");
  });

  it("surfaces an automatic table replacement until acknowledged", () => {
    expect(deriveSyncStatus({
      ...base,
      replacementNotice: {
        kind: "source-changed", at: base.lastPullServerTime!,
        beforePoints: 20, afterPoints: 2, removedPoints: 18,
        removedOwners: 0, removedVisits: 0
      }
    })).toMatchObject({ kind: "updated", label: "Данные обновлены" });
  });

  it("shows a successful server check only after one completed", () => {
    expect(deriveSyncStatus(base)).toMatchObject({
      kind: "verified", label: "Данные проверены", needsAttention: false
    });
  });

  it("keeps the last useful state during a short background check", () => {
    const checking = { ...base, run: { state: "checking" as const, at: base.lastPullServerTime! } };
    expect(deriveSyncStatus({ ...checking, showChecking: false }).kind).toBe("verified");
    expect(deriveSyncStatus({ ...checking, pendingCount: 1, showChecking: false }).kind).toBe("pending");
    expect(deriveSyncStatus({ ...checking, showChecking: true }).kind).toBe("checking");
  });

  it("keeps an automatic collision visible until its history is opened", () => {
    const notice: Conflict = {
      id: "notice-one", sourceId: "source-A", localNotice: true,
      entityName: "point", entityId: "point-one",
      field: "comment", localValue: "local", remoteValue: "sheet", baseVersion: 1,
      remoteVersion: 2, resolvedAt: "2026-09-26T10:05:00.000Z", resolution: "remote",
      createdAt: "2026-09-26T10:05:00.000Z", updatedAt: "2026-09-26T10:05:00.000Z",
      deletedAt: null, version: 1
    };
    expect(countUnreadSyncNotices([notice], "source-A", undefined)).toBe(1);
    expect(countUnreadSyncNotices([notice], "source-A", {
      sourceId: "source-A", through: "2026-09-26T10:05:00.000Z"
    })).toBe(0);
    expect(countUnreadSyncNotices([notice], "source-B", undefined)).toBe(0);
  });
});

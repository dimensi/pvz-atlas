import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SyncStatusDisplay } from "@/lib/sync/status";
import { SyncStatusPill } from "./SyncStatusPill";

let currentStatus: SyncStatusDisplay;

vi.mock("./SyncOverviewProvider", () => ({
  useSyncOverview: () => ({
    status: currentStatus,
    ready: true,
    online: true,
    run: { state: "checking", at: "2026-09-26T10:00:00.000Z" },
    pendingCount: 0,
    unreadNoticeCount: 0
  })
}));

describe("header sync status", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem("pvz-atlas-last-sync-status", JSON.stringify({
      kind: "error", label: "Не удалось обновить", needsAttention: true
    }));
  });

  it("keeps the last status during a short background check", () => {
    currentStatus = { kind: "never", label: "Нет проверки таблицы", needsAttention: true };
    render(<SyncStatusPill />);
    expect(screen.getByRole("link", { name: /Не удалось обновить/ })).toBeTruthy();
  });

  it("shows a required review even during a background check", () => {
    currentStatus = { kind: "review", label: "Нужно обновить данные", needsAttention: true };
    render(<SyncStatusPill />);
    expect(screen.getByRole("link", { name: /Нужно обновить данные/ })).toBeTruthy();
  });
});

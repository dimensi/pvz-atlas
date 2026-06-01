import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Change, Conflict } from "@/lib/data-model/types";
import { SyncHealthIndicator } from "./SyncHealthIndicator";

const now = "2026-01-01T00:00:00.000Z";

const change: Change = {
  id: "change-1",
  entityName: "point",
  entityId: "point-1",
  operation: "update",
  baseVersion: 1,
  clientId: "client-1",
  patch: { comment: "note" },
  syncedAt: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  version: 1
};

const conflict: Conflict = {
  id: "conflict-1",
  entityName: "point",
  entityId: "point-1",
  field: "comment",
  localValue: "local",
  remoteValue: "remote",
  baseVersion: 1,
  remoteVersion: 2,
  resolvedAt: null,
  resolution: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  version: 1
};

describe("SyncHealthIndicator", () => {
  it("renders nothing when clean by default", () => {
    const { container } = render(
      <SyncHealthIndicator pendingChanges={[]} conflicts={[]} isOnline isRefreshing={false} />
    );

    expect(container.textContent).toBe("");
  });

  it("links pending changes to sync diagnostics without alert role", () => {
    render(
      <SyncHealthIndicator
        pendingChanges={[change]}
        conflicts={[]}
        isOnline
        isRefreshing={false}
      />
    );

    expect(screen.getByRole("status").getAttribute("href")).toBe("/sync");
    expect(screen.getByText("Будет отправлено: 1")).toBeTruthy();
  });

  it("prioritizes conflicts over offline and uses alert role", () => {
    render(
      <SyncHealthIndicator
        pendingChanges={[change]}
        conflicts={[conflict]}
        isOnline={false}
        isRefreshing={false}
      />
    );

    expect(screen.getByRole("alert").getAttribute("href")).toBe("/sync");
    expect(screen.getByText("Есть конфликт: 1")).toBeTruthy();
  });

  it("prioritizes conflicts over sync errors", () => {
    render(
      <SyncHealthIndicator
        pendingChanges={[]}
        conflicts={[conflict]}
        isOnline
        isRefreshing={false}
        error="network failed"
      />
    );

    expect(screen.getByRole("alert").getAttribute("href")).toBe("/sync");
    expect(screen.getByText("Есть конфликт: 1")).toBeTruthy();
  });
});

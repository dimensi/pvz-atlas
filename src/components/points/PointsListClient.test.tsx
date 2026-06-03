import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Point } from "@/lib/data-model/types";
import PointsListClient from "./PointsListClient";

const snapshotMocks = vi.hoisted(() => ({
  refreshCache: vi.fn(),
  refreshOnline: vi.fn(),
  useOnlineCachedSnapshot: vi.fn()
}));

vi.mock("@/lib/sync/use-online-cached-snapshot", () => ({
  useOnlineCachedSnapshot: () => snapshotMocks.useOnlineCachedSnapshot()
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn()
  }
}));

vi.mock("./PointActionDialogs", () => ({
  PointActionDialogs: ({ action }: { action: string | null }) => (
    <div data-testid="point-action-dialog">{action ?? "closed"}</div>
  )
}));

const point: Point = {
  id: "point-1",
  sourceKey: "ozon|vidnoe|green-9",
  brand: "ozon",
  city: "Видное",
  address: "Зеленые Аллеи, 9",
  normalizedCity: "видное",
  normalizedAddress: "зеленые аллеи 9",
  ownerId: null,
  status: "new",
  lat: 55.551,
  lon: 37.709,
  comment: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  version: 1
};

describe("PointsListClient", () => {
  beforeEach(() => {
    snapshotMocks.refreshCache.mockReset();
    snapshotMocks.refreshOnline.mockReset();
    snapshotMocks.useOnlineCachedSnapshot.mockReset();
    snapshotMocks.refreshCache.mockResolvedValue({});
    snapshotMocks.refreshOnline.mockResolvedValue({});
    snapshotMocks.useOnlineCachedSnapshot.mockReturnValue({
      snapshot: {
        points: [point],
        owners: [],
        visits: [],
        pendingChanges: [],
        conflicts: [],
        lastPullServerTime: null
      },
      error: null,
      isOnline: true,
      isLoadingCache: false,
      isRefreshing: false,
      refreshCache: snapshotMocks.refreshCache,
      refreshOnline: snapshotMocks.refreshOnline
    });
  });

  it("replaces the visit card action with status and edit actions", () => {
    render(<PointsListClient />);

    expect(screen.queryByRole("button", { name: "Отметить визит" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Снять отметку визита" })).toBeNull();
    expect(screen.getByRole("button", { name: "Статус" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Редактировать" })).toBeTruthy();
  });

  it("opens the existing status/details and edit drawers from the card", () => {
    render(<PointsListClient />);

    fireEvent.click(screen.getByRole("button", { name: "Статус" }));
    expect(screen.getByTestId("point-action-dialog").textContent).toBe("details");

    fireEvent.click(screen.getByRole("button", { name: "Редактировать" }));
    expect(screen.getByTestId("point-action-dialog").textContent).toBe("edit");
  });
});

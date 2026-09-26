import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Conflict, Owner, Point } from "@/lib/data-model/types";
import SyncClient from "./SyncClient";

const { mockDb, mockRunSync, mockOverview } = vi.hoisted(() => ({
  mockDb: {
    changes: { filter: vi.fn() },
    conflicts: { filter: vi.fn() },
    points: { toArray: vi.fn() },
    owners: { toArray: vi.fn() },
    visits: { toArray: vi.fn() },
    meta: { get: vi.fn() }
  },
  mockRunSync: vi.fn(),
  mockOverview: {
    online: true,
    status: { kind: "verified", label: "Данные проверены", needsAttention: false },
    run: { state: "ok", at: "2026-09-25T12:30:00.000Z" },
    lastPullServerTime: "2026-09-25T12:30:00.000Z",
    pendingCount: 0,
    heldCount: 0,
    review: null,
    markNoticesRead: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock("@/lib/indexeddb/db", () => ({ db: mockDb }));
vi.mock("@/lib/sync/engine", () => ({ runSync: mockRunSync }));
vi.mock("./SyncOverviewProvider", () => ({ useSyncOverview: () => mockOverview }));

const timestamp = "2026-09-25T12:30:00.000Z";

const point: Point = {
  id: "point-private-id",
  sourceKey: "source-key",
  brand: "ozon",
  city: "Москва",
  address: "Тверская, 1",
  normalizedCity: "москва",
  normalizedAddress: "тверская, 1",
  ownerId: "owner-remote-id",
  status: "active",
  lat: null,
  lon: null,
  comment: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  deletedAt: null,
  version: 2
};

const owners: Owner[] = [
  {
    id: "owner-local-id",
    name: "Анна",
    phone: null,
    telegram: null,
    comment: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    version: 1
  },
  {
    id: "owner-remote-id",
    name: "Борис",
    phone: null,
    telegram: null,
    comment: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    version: 2
  }
];

const unappliedOwnerChange: Conflict = {
  id: "conflict-private-id",
  sourceId: "source-A",
  localNotice: true,
  entityName: "point",
  entityId: point.id,
  field: "ownerId",
  localValue: owners[0].id,
  remoteValue: owners[1].id,
  baseVersion: 1,
  remoteVersion: 2,
  resolvedAt: timestamp,
  resolution: "remote",
  createdAt: timestamp,
  updatedAt: timestamp,
  deletedAt: null,
  version: 1
};

describe("SyncClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOverview.heldCount = 0;
    mockDb.changes.filter.mockReturnValue({ toArray: async () => [] });
    mockDb.meta.get.mockResolvedValue({ value: "source-A" });
    mockDb.conflicts.filter.mockReturnValue({ toArray: async () => [unappliedOwnerChange] });
    mockDb.points.toArray.mockResolvedValue([point]);
    mockDb.owners.toArray.mockResolvedValue(owners);
    mockDb.visits.toArray.mockResolvedValue([]);
  });

  it("shows the point and owner names for an unapplied local edit without technical choices", async () => {
    render(<SyncClient />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Ozon · Москва · Тверская, 1" })).toBeTruthy();
    });

    expect(screen.getByText(/локальное значение «Анна» не применено/)).toBeTruthy();
    expect(screen.getByText(/В таблице оставлено «Борис»/)).toBeTruthy();
    expect(screen.queryByText(/point-private-id|owner-local-id|owner-remote-id|conflict-private-id/)).toBeNull();
    expect(screen.queryByRole("button", { name: /принять|оставить мое/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Проверить сейчас" })).toBeTruthy();
  });

  it("tells the operator when a full update is waiting for review", async () => {
    mockRunSync.mockResolvedValue({ reviewRequired: true });
    render(<SyncClient />);

    fireEvent.click(await screen.findByRole("button", { name: "Проверить сейчас" }));

    expect(
      await screen.findByText("В таблице появились изменения для проверки. Они пока не применены.")
    ).toBeTruthy();
  });

  it("offers a local backup when older edits are held", async () => {
    mockOverview.heldCount = 1;
    mockDb.changes.filter.mockReturnValue({ toArray: async () => [{
      id: "saved-change", sourceId: "old-source", syncedAt: null, deletedAt: null,
      patch: { comment: "сохранить" }
    }] });
    const createObjectURL = vi.fn().mockReturnValue("blob:backup");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<SyncClient />);
    fireEvent.click(await screen.findByRole("button", { name: "Скачать копию правок" }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledOnce());
    expect(screen.getByText(/не отправляются в текущую таблицу/)).toBeTruthy();
  });
});

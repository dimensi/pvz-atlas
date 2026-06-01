import { describe, expect, it } from "vitest";
import type { Change, Conflict, Owner, Point, Visit } from "@/lib/data-model/types";
import type { MetaEntry, PvzDatabase } from "@/lib/indexeddb/db";
import { LAST_PULL_META_KEY } from "./engine";
import { readCachedSnapshot } from "./cache";

const now = "2026-01-02T03:04:05.000Z";

class FakeTable<TItem extends object> {
  items: TItem[];
  private key: keyof TItem;

  constructor(key: keyof TItem, items: TItem[] = []) {
    this.key = key;
    this.items = [...items];
  }

  async get(key: string): Promise<TItem | undefined> {
    return this.items.find((item) => item[this.key] === key);
  }

  filter(predicate: (item: TItem) => boolean) {
    return {
      toArray: async () => this.items.filter(predicate)
    };
  }
}

const point = (overrides: Partial<Point> = {}): Point => ({
  id: "point-1",
  sourceKey: "ozon|moscow|main-1",
  brand: "Ozon",
  city: "Moscow",
  address: "Main 1",
  normalizedCity: "moscow",
  normalizedAddress: "main 1",
  ownerId: null,
  status: "new",
  lat: null,
  lon: null,
  comment: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  version: 1,
  ...overrides
});

const owner = (overrides: Partial<Owner> = {}): Owner => ({
  id: "owner-1",
  name: "Owner",
  phone: null,
  telegram: null,
  comment: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  version: 1,
  ...overrides
});

const visit = (overrides: Partial<Visit> = {}): Visit => ({
  id: "visit-1",
  pointId: "point-1",
  visitedAt: now,
  status: "completed",
  comment: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  version: 1,
  ...overrides
});

const change = (overrides: Partial<Change> = {}): Change => ({
  id: "change-1",
  entityName: "point",
  entityId: "point-1",
  operation: "update",
  baseVersion: 1,
  clientId: "client-1",
  patch: { ownerId: "owner-1" },
  syncedAt: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  version: 1,
  ...overrides
});

const conflict = (overrides: Partial<Conflict> = {}): Conflict => ({
  id: "conflict-1",
  entityName: "point",
  entityId: "point-1",
  field: "ownerId",
  localValue: "owner-1",
  remoteValue: "owner-2",
  baseVersion: 1,
  remoteVersion: 2,
  resolvedAt: null,
  resolution: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  version: 1,
  ...overrides
});

function createDatabase(): PvzDatabase {
  return {
    points: new FakeTable<Point>("id", [
      point(),
      point({ id: "deleted-point", deletedAt: now })
    ]),
    owners: new FakeTable<Owner>("id", [owner(), owner({ id: "deleted-owner", deletedAt: now })]),
    visits: new FakeTable<Visit>("id", [visit(), visit({ id: "deleted-visit", deletedAt: now })]),
    changes: new FakeTable<Change>("id", [
      change(),
      change({ id: "synced-change", syncedAt: now }),
      change({ id: "deleted-change", deletedAt: now })
    ]),
    conflicts: new FakeTable<Conflict>("id", [
      conflict(),
      conflict({ id: "resolved-conflict", resolvedAt: now }),
      conflict({ id: "deleted-conflict", deletedAt: now })
    ]),
    meta: new FakeTable<MetaEntry>("key", [
      {
        key: LAST_PULL_META_KEY,
        value: "2026-01-03T00:00:00.000Z",
        updatedAt: "2026-01-03T00:00:00.000Z"
      }
    ])
  } as unknown as PvzDatabase;
}

describe("readCachedSnapshot", () => {
  it("reads visible cached rows, pending state, conflicts, and last pull time", async () => {
    const snapshot = await readCachedSnapshot(createDatabase());

    expect(snapshot.points.map((item) => item.id)).toEqual(["point-1"]);
    expect(snapshot.owners.map((item) => item.id)).toEqual(["owner-1"]);
    expect(snapshot.visits.map((item) => item.id)).toEqual(["visit-1"]);
    expect(snapshot.pendingChanges.map((item) => item.id)).toEqual(["change-1"]);
    expect(snapshot.conflicts.map((item) => item.id)).toEqual(["conflict-1"]);
    expect(snapshot.lastPullServerTime).toBe("2026-01-03T00:00:00.000Z");
  });
});

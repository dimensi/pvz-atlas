import { describe, expect, it } from "vitest";
import type { Change, Conflict, Point } from "@/lib/data-model/types";
import type { PvzDatabase } from "@/lib/indexeddb/db";
import { mergePulledConflicts, resolveConflictLocal } from "./conflict-resolution";

const now = "2026-01-02T03:04:05.000Z";
const resolvedAt = "2026-01-02T03:05:00.000Z";

class FakeTable<TItem extends object> {
  items: TItem[];
  private key: keyof TItem;

  constructor(key: keyof TItem, items: TItem[] = []) {
    this.key = key;
    this.items = [...items];
  }

  async bulkPut(items: TItem[]): Promise<void> {
    for (const item of items) {
      await this.put(item);
    }
  }

  async get(key: string): Promise<TItem | undefined> {
    return this.items.find((item) => item[this.key] === key);
  }

  async put(item: TItem): Promise<void> {
    const index = this.items.findIndex((existing) => existing[this.key] === item[this.key]);
    if (index === -1) {
      this.items.push(item);
      return;
    }

    this.items[index] = item;
  }

  filter(predicate: (item: TItem) => boolean) {
    return {
      toArray: async () => this.items.filter(predicate)
    };
  }
}

function createDatabase(options: {
  changes?: Change[];
  conflicts?: Conflict[];
  points?: Point[];
}): PvzDatabase {
  return {
    points: new FakeTable<Point>("id", options.points ?? []),
    owners: new FakeTable("id"),
    visits: new FakeTable("id"),
    conflicts: new FakeTable<Conflict>("id", options.conflicts ?? []),
    changes: new FakeTable<Change>("id", options.changes ?? []),
    transaction: async (...args: unknown[]) => {
      const callback = args.at(-1);
      if (typeof callback !== "function") {
        throw new Error("transaction callback missing");
      }
      return callback();
    }
  } as unknown as PvzDatabase;
}

const point: Point = {
  id: "point-1",
  sourceKey: "ozon|moscow|main-1",
  brand: "Ozon",
  city: "Moscow",
  address: "Main 1",
  normalizedCity: "moscow",
  normalizedAddress: "main 1",
  ownerId: "owner-local",
  status: "new",
  lat: null,
  lon: null,
  comment: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  version: 2
};

const change: Change = {
  id: "change-1",
  entityName: "point",
  entityId: "point-1",
  operation: "update",
  baseVersion: 1,
  clientId: "client-1",
  patch: { ownerId: "owner-local" },
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
  field: "ownerId",
  localValue: "owner-local",
  remoteValue: "owner-remote",
  baseVersion: 1,
  remoteVersion: 3,
  resolvedAt: null,
  resolution: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  version: 1
};

describe("resolveConflictLocal", () => {
  it("resolves as local and retries the pending change from the remote version", async () => {
    const database = createDatabase({
      changes: [change],
      conflicts: [conflict],
      points: [point]
    });

    await resolveConflictLocal("conflict-1", "local", {
      database,
      clock: () => resolvedAt
    });

    expect((database.conflicts as unknown as FakeTable<Conflict>).items[0]).toMatchObject({
      id: "conflict-1",
      resolvedAt,
      resolution: "local"
    });
    expect((database.changes as unknown as FakeTable<Change>).items[0]).toMatchObject({
      id: "change-1",
      baseVersion: 3,
      syncedAt: null
    });
  });

  it("resolves as remote, applies the remote field locally, and clears the field patch", async () => {
    const database = createDatabase({
      changes: [change],
      conflicts: [conflict],
      points: [point]
    });

    await resolveConflictLocal("conflict-1", "remote", {
      database,
      clock: () => resolvedAt
    });

    expect((database.points as unknown as FakeTable<Point>).items[0]).toMatchObject({
      id: "point-1",
      ownerId: "owner-remote",
      version: 3
    });
    expect((database.changes as unknown as FakeTable<Change>).items[0]).toMatchObject({
      id: "change-1",
      syncedAt: resolvedAt
    });
    expect((database.conflicts as unknown as FakeTable<Conflict>).items[0]).toMatchObject({
      id: "conflict-1",
      resolvedAt,
      resolution: "remote"
    });
  });
});

describe("mergePulledConflicts", () => {
  it("keeps a locally resolved conflict over an older unresolved pulled copy", () => {
    const localResolved = {
      ...conflict,
      resolvedAt,
      resolution: "remote" as const,
      updatedAt: resolvedAt,
      version: 2
    };

    expect(mergePulledConflicts([conflict], [localResolved])).toEqual([localResolved]);
  });
});

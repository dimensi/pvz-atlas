import { describe, expect, it, vi } from "vitest";
import type { Change, Conflict, Point } from "@/lib/data-model/types";
import type { PvzDatabase } from "@/lib/indexeddb/db";
import type { PullResponse, PushResponse } from "@/lib/api/types";
import { LAST_PULL_META_KEY, refreshOnlineCache, runSync } from "./engine";

const now = "2026-01-02T03:04:05.000Z";
const pushedAt = "2026-01-02T03:05:00.000Z";
const finalTime = "2026-01-02T03:06:00.000Z";

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

  async bulkGet(keys: string[]): Promise<Array<TItem | undefined>> {
    return keys.map((key) => this.items.find((item) => item[this.key] === key));
  }

  async put(item: TItem): Promise<void> {
    const index = this.items.findIndex((existing) => existing[this.key] === item[this.key]);
    if (index === -1) {
      this.items.push(item);
      return;
    }

    this.items[index] = item;
  }

  async get(key: string): Promise<TItem | undefined> {
    return this.items.find((item) => item[this.key] === key);
  }

  filter(predicate: (item: TItem) => boolean) {
    return {
      toArray: async () => this.items.filter(predicate),
      count: async () => this.items.filter(predicate).length
    };
  }
}

function createDatabase(options: {
  changes?: Change[];
  conflicts?: Conflict[];
  points?: Point[];
} = {}): PvzDatabase {
  return {
    points: new FakeTable<Point>("id", options.points ?? []),
    owners: new FakeTable("id"),
    visits: new FakeTable("id"),
    conflicts: new FakeTable<Conflict>("id", options.conflicts ?? []),
    changes: new FakeTable<Change>("id", options.changes ?? []),
    meta: new FakeTable("key"),
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
  ownerId: null,
  status: "new",
  lat: null,
  lon: null,
  comment: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  version: 1
};

const change: Change = {
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
  version: 1
};

describe("runSync", () => {
  it("pulls, applies remote data, pushes queued changes through API clients, and pulls again", async () => {
    const database = createDatabase({ changes: [change] });
    const firstPull: PullResponse = {
      serverTime: now,
      points: [point],
      owners: [],
      visits: [],
      conflicts: []
    };
    const pushResponse: PushResponse = {
      serverTime: pushedAt,
      applied: ["change-1"],
      rejected: [],
      conflicts: [],
      points: [{ ...point, ownerId: "owner-1", version: 2, updatedAt: pushedAt }]
    };
    const finalPull: PullResponse = {
      serverTime: finalTime,
      points: [],
      owners: [],
      visits: [],
      conflicts: []
    };
    const api = {
      pullSync: vi.fn().mockResolvedValueOnce(firstPull).mockResolvedValueOnce(finalPull),
      pushSync: vi.fn().mockResolvedValue(pushResponse)
    };

    const result = await runSync({ database, api, clientId: "client-1", since: null });

    expect(api.pullSync).toHaveBeenNthCalledWith(1, null);
    expect(api.pushSync).toHaveBeenCalledWith({ clientId: "client-1", changes: [change] });
    expect(api.pullSync).toHaveBeenNthCalledWith(2, null);
    expect(result.pendingChangeCount).toBe(1);
    expect((database.points as unknown as FakeTable<Point>).items[0]).toMatchObject({
      id: "point-1",
      ownerId: "owner-1"
    });
    expect((database.changes as unknown as FakeTable<Change>).items[0]).toMatchObject({
      id: "change-1",
      syncedAt: pushedAt,
      version: 2
    });
  });

  it("preserves locally dirty entities while applying pulls", async () => {
    const localDirtyPoint = {
      ...point,
      ownerId: "owner-local",
      version: 2,
      updatedAt: "2026-01-02T03:04:30.000Z"
    };
    const remotePoint = { ...point, ownerId: null, version: 1 };
    const database = createDatabase({
      changes: [change],
      points: [localDirtyPoint]
    });
    const firstPull: PullResponse = {
      serverTime: now,
      points: [remotePoint],
      owners: [],
      visits: [],
      conflicts: []
    };
    const pushResponse: PushResponse = {
      serverTime: pushedAt,
      applied: ["change-1"],
      rejected: [],
      conflicts: [],
      points: [{ ...localDirtyPoint, version: 3, updatedAt: pushedAt }]
    };
    const finalPull: PullResponse = {
      serverTime: finalTime,
      points: [{ ...localDirtyPoint, version: 3, updatedAt: pushedAt }],
      owners: [],
      visits: [],
      conflicts: []
    };
    const api = {
      pullSync: vi.fn().mockResolvedValueOnce(firstPull).mockResolvedValueOnce(finalPull),
      pushSync: vi.fn().mockImplementation(async () => {
        expect((database.points as unknown as FakeTable<Point>).items[0]).toMatchObject({
          id: "point-1",
          ownerId: "owner-local",
          version: 2
        });
        return pushResponse;
      })
    };

    await runSync({ database, api, clientId: "client-1", since: null });

    expect((database.points as unknown as FakeTable<Point>).items[0]).toMatchObject({
      id: "point-1",
      ownerId: "owner-local",
      version: 3
    });
  });

  it("does not overwrite an entity when push response leaves another local change pending", async () => {
    const commentChange: Change = {
      ...change,
      id: "change-2",
      patch: { comment: "local note" },
      createdAt: "2026-01-02T03:04:06.000Z",
      updatedAt: "2026-01-02T03:04:06.000Z"
    };
    const localDirtyPoint = {
      ...point,
      ownerId: "owner-1",
      comment: "local note",
      version: 3,
      updatedAt: "2026-01-02T03:04:30.000Z"
    };
    const database = createDatabase({
      changes: [change, commentChange],
      points: [localDirtyPoint]
    });
    const firstPull: PullResponse = {
      serverTime: now,
      points: [],
      owners: [],
      visits: [],
      conflicts: []
    };
    const pushResponse: PushResponse = {
      serverTime: pushedAt,
      applied: ["change-1"],
      rejected: [{ changeId: "change-2", reason: "conflict" }],
      conflicts: [],
      points: [{ ...point, ownerId: "owner-1", comment: null, version: 2, updatedAt: pushedAt }]
    };
    const finalPull: PullResponse = {
      serverTime: finalTime,
      points: [{ ...point, ownerId: "owner-1", comment: null, version: 2, updatedAt: pushedAt }],
      owners: [],
      visits: [],
      conflicts: []
    };
    const api = {
      pullSync: vi.fn().mockResolvedValueOnce(firstPull).mockResolvedValueOnce(finalPull),
      pushSync: vi.fn().mockResolvedValue(pushResponse)
    };

    await runSync({ database, api, clientId: "client-1", since: null });

    expect((database.points as unknown as FakeTable<Point>).items[0]).toMatchObject({
      id: "point-1",
      ownerId: "owner-1",
      comment: "local note"
    });
    expect((database.changes as unknown as FakeTable<Change>).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "change-1", syncedAt: pushedAt }),
        expect.objectContaining({ id: "change-2", syncedAt: null })
      ])
    );
  });

  it("does not push pending changes that already have unresolved conflicts", async () => {
    const conflict: Conflict = {
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
      createdAt: pushedAt,
      updatedAt: pushedAt,
      deletedAt: null,
      version: 1
    };
    const database = createDatabase({
      changes: [change],
      conflicts: [conflict],
      points: [{ ...point, ownerId: "owner-1" }]
    });
    const emptyPull: PullResponse = {
      serverTime: now,
      points: [{ ...point, ownerId: "owner-2", version: 2 }],
      owners: [],
      visits: [],
      conflicts: [conflict]
    };
    const api = {
      pullSync: vi.fn().mockResolvedValue(emptyPull),
      pushSync: vi.fn()
    };

    const result = await runSync({ database, api, clientId: "client-1", since: null });

    expect(api.pushSync).not.toHaveBeenCalled();
    expect(result.pushed).toBeNull();
    expect((database.changes as unknown as FakeTable<Change>).items[0]).toMatchObject({
      id: "change-1",
      syncedAt: null
    });
    expect((database.points as unknown as FakeTable<Point>).items[0]).toMatchObject({
      id: "point-1",
      ownerId: "owner-1"
    });
  });

  it("pushes locally resolved conflicts even when no entity changes remain", async () => {
    const resolvedConflict: Conflict = {
      id: "conflict-1",
      entityName: "point",
      entityId: "point-1",
      field: "ownerId",
      localValue: "owner-1",
      remoteValue: "owner-2",
      baseVersion: 1,
      remoteVersion: 2,
      resolvedAt: pushedAt,
      resolution: "remote",
      createdAt: now,
      updatedAt: pushedAt,
      deletedAt: null,
      version: 2
    };
    const database = createDatabase({
      conflicts: [resolvedConflict]
    });
    const firstPull: PullResponse = {
      serverTime: now,
      points: [],
      owners: [],
      visits: [],
      conflicts: []
    };
    const pushResponse: PushResponse = {
      serverTime: pushedAt,
      applied: [],
      rejected: [],
      conflicts: []
    };
    const finalPull: PullResponse = {
      serverTime: finalTime,
      points: [],
      owners: [],
      visits: [],
      conflicts: []
    };
    const api = {
      pullSync: vi.fn().mockResolvedValueOnce(firstPull).mockResolvedValueOnce(finalPull),
      pushSync: vi.fn().mockResolvedValue(pushResponse)
    };

    const result = await runSync({ database, api, clientId: "client-1", since: null });

    expect(api.pushSync).toHaveBeenCalledWith({
      clientId: "client-1",
      changes: [],
      resolvedConflicts: [resolvedConflict]
    });
    expect(result.pendingChangeCount).toBe(0);
  });

  it("applies a pulled resolved duplicate conflict to local pending state", async () => {
    const localConflict: Conflict = {
      id: "local-conflict",
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
      version: 1
    };
    const pulledResolvedConflict: Conflict = {
      ...localConflict,
      id: "remote-conflict",
      resolvedAt: pushedAt,
      resolution: "remote",
      updatedAt: pushedAt,
      version: 2
    };
    const database = createDatabase({
      changes: [change],
      conflicts: [localConflict],
      points: [{ ...point, ownerId: "owner-1", version: 2 }]
    });
    const firstPull: PullResponse = {
      serverTime: now,
      points: [{ ...point, ownerId: "owner-2", version: 2 }],
      owners: [],
      visits: [],
      conflicts: [pulledResolvedConflict]
    };
    const pushResponse: PushResponse = {
      serverTime: pushedAt,
      applied: [],
      rejected: [],
      conflicts: []
    };
    const finalPull: PullResponse = {
      serverTime: finalTime,
      points: [],
      owners: [],
      visits: [],
      conflicts: []
    };
    const api = {
      pullSync: vi.fn().mockResolvedValueOnce(firstPull).mockResolvedValueOnce(finalPull),
      pushSync: vi.fn().mockResolvedValue(pushResponse)
    };

    await runSync({ database, api, clientId: "client-1", since: null });

    expect((database.points as unknown as FakeTable<Point>).items[0]).toMatchObject({
      id: "point-1",
      ownerId: "owner-2",
      version: 2
    });
    expect((database.changes as unknown as FakeTable<Change>).items[0]).toMatchObject({
      id: "change-1",
      syncedAt: pushedAt
    });
    expect((database.conflicts as unknown as FakeTable<Conflict>).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "local-conflict",
          resolvedAt: pushedAt,
          resolution: "remote"
        }),
        expect.objectContaining({
          id: "remote-conflict",
          resolvedAt: pushedAt,
          resolution: "remote"
        })
      ])
    );
  });
});

describe("refreshOnlineCache", () => {
  it("pulls only when there are no pushable local changes", async () => {
    const database = createDatabase();
    const pulledPoint = { ...point, id: "remote-point", address: "Remote 1" };
    const pullResponse: PullResponse = {
      serverTime: finalTime,
      points: [pulledPoint],
      owners: [],
      visits: [],
      conflicts: []
    };
    const api = {
      pullSync: vi.fn().mockResolvedValue(pullResponse),
      pushSync: vi.fn()
    };

    const result = await refreshOnlineCache({ database, api, since: null });

    expect(result).toMatchObject({ mode: "pull", pulled: pullResponse, synced: null });
    expect(api.pullSync).toHaveBeenCalledOnce();
    expect(api.pullSync).toHaveBeenCalledWith(null);
    expect(api.pushSync).not.toHaveBeenCalled();
    expect((database.points as unknown as FakeTable<Point>).items[0]).toMatchObject({
      id: "remote-point",
      address: "Remote 1"
    });
    expect(await database.meta.get(LAST_PULL_META_KEY)).toMatchObject({
      key: LAST_PULL_META_KEY,
      value: finalTime
    });
  });

  it("runs full sync when pushable local changes exist", async () => {
    const database = createDatabase({ changes: [change] });
    const firstPull: PullResponse = {
      serverTime: now,
      points: [point],
      owners: [],
      visits: [],
      conflicts: []
    };
    const pushResponse: PushResponse = {
      serverTime: pushedAt,
      applied: ["change-1"],
      rejected: [],
      conflicts: [],
      points: [{ ...point, ownerId: "owner-1", version: 2, updatedAt: pushedAt }]
    };
    const finalPull: PullResponse = {
      serverTime: finalTime,
      points: [],
      owners: [],
      visits: [],
      conflicts: []
    };
    const api = {
      pullSync: vi.fn().mockResolvedValueOnce(firstPull).mockResolvedValueOnce(finalPull),
      pushSync: vi.fn().mockResolvedValue(pushResponse)
    };

    const result = await refreshOnlineCache({ database, api, clientId: "client-1", since: null });

    expect(result.mode).toBe("sync");
    expect(result.synced?.pendingChangeCount).toBe(1);
    expect(api.pullSync).toHaveBeenCalledTimes(2);
    expect(api.pushSync).toHaveBeenCalledWith({ clientId: "client-1", changes: [change] });
  });
});

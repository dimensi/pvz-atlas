import { describe, expect, it, vi } from "vitest";
import type { Change, Point } from "@/lib/data-model/types";
import type { PvzDatabase } from "@/lib/indexeddb/db";
import type { PullResponse, PushResponse } from "@/lib/api/types";
import { runSync } from "./engine";

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

function createDatabase(change: Change): PvzDatabase {
  return {
    points: new FakeTable<Point>("id"),
    owners: new FakeTable("id"),
    visits: new FakeTable("id"),
    conflicts: new FakeTable("id"),
    changes: new FakeTable<Change>("id", [change]),
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
    const database = createDatabase(change);
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
});

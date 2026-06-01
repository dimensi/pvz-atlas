import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Point } from "@/lib/data-model/types";
import type { MetaEntry, PvzDatabase } from "@/lib/indexeddb/db";
import type { PullResponse } from "@/lib/api/types";
import { useOnlineCachedSnapshot } from "./use-online-cached-snapshot";

const now = "2026-01-02T03:04:05.000Z";

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

function point(overrides: Partial<Point> = {}): Point {
  return {
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
  };
}

function createDatabase(points: Point[] = []): PvzDatabase {
  return {
    points: new FakeTable<Point>("id", points),
    owners: new FakeTable("id"),
    visits: new FakeTable("id"),
    changes: new FakeTable("id"),
    conflicts: new FakeTable("id"),
    meta: new FakeTable<MetaEntry>("key"),
    transaction: async (...args: unknown[]) => {
      const callback = args.at(-1);
      if (typeof callback !== "function") {
        throw new Error("transaction callback missing");
      }
      return callback();
    }
  } as unknown as PvzDatabase;
}

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}

function pullResponse(points: Point[]): PullResponse {
  return {
    serverTime: "2026-01-03T00:00:00.000Z",
    points,
    owners: [],
    visits: [],
    conflicts: []
  };
}

describe("useOnlineCachedSnapshot", () => {
  it("shows cached rows first and then online refreshed rows", async () => {
    setOnline(true);
    const database = createDatabase([point({ address: "Cached 1" })]);
    const pull = deferred<PullResponse>();
    const api = {
      pullSync: () => pull.promise,
      pushSync: async () => {
        throw new Error("push should not run");
      }
    };

    const { result } = renderHook(() => useOnlineCachedSnapshot({ database, api }));

    await waitFor(() => {
      expect(result.current.snapshot.points[0]?.address).toBe("Cached 1");
      expect(result.current.status).toBe("refreshing");
    });

    await act(async () => {
      pull.resolve(pullResponse([point({ address: "Online 1", version: 2 })]));
      await pull.promise;
    });

    await waitFor(() => {
      expect(result.current.status).toBe("online");
      expect(result.current.snapshot.points[0]).toMatchObject({
        address: "Online 1",
        version: 2
      });
    });
  });

  it("keeps cached rows visible when online refresh fails", async () => {
    setOnline(true);
    const database = createDatabase([point({ address: "Cached 1" })]);
    const api = {
      pullSync: async () => {
        throw new Error("network down");
      },
      pushSync: async () => {
        throw new Error("push should not run");
      }
    };

    const { result } = renderHook(() => useOnlineCachedSnapshot({ database, api }));

    await waitFor(() => {
      expect(result.current.status).toBe("error");
      expect(result.current.error).toBe("network down");
      expect(result.current.snapshot.points[0]?.address).toBe("Cached 1");
    });
  });

  it("moves from empty cache loading to online data", async () => {
    setOnline(true);
    const database = createDatabase();
    const pull = deferred<PullResponse>();
    const api = {
      pullSync: () => pull.promise,
      pushSync: async () => {
        throw new Error("push should not run");
      }
    };

    const { result } = renderHook(() => useOnlineCachedSnapshot({ database, api }));

    await waitFor(() => {
      expect(result.current.status).toBe("refreshing");
      expect(result.current.snapshot.points).toEqual([]);
    });

    await act(async () => {
      pull.resolve(pullResponse([point({ address: "Online 1" })]));
      await pull.promise;
    });

    await waitFor(() => {
      expect(result.current.status).toBe("online");
      expect(result.current.snapshot.points[0]?.address).toBe("Online 1");
    });
  });
});

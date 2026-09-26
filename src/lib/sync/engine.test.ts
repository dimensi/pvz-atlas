import { describe, expect, it, vi } from "vitest";
import type { Change, Conflict, Point } from "@/lib/data-model/types";
import type { MetaEntry, PvzDatabase } from "@/lib/indexeddb/db";
import type { PullResponse, PushResponse } from "@/lib/api/types";
import { ApiError } from "@/lib/api/client";
import { runSync } from "./engine";
import { CACHE_REPLACEMENT_NOTICE_META_KEY, FIRST_OFFLINE_DRAFT_META_KEY, HELD_RECORDS_BACKUP_META_KEY, PREVIOUS_DATA_BACKUPS_META_KEY, STAGED_SNAPSHOT_META_KEY, SYNC_SOURCE_META_KEY } from "./meta";

const now = "2026-01-02T03:04:05.000Z";
const later = "2026-01-02T03:05:00.000Z";

class FakeTable<TItem extends object> {
  items: TItem[];
  constructor(private key: keyof TItem, items: TItem[] = []) {
    this.items = [...items];
  }
  async get(key: string): Promise<TItem | undefined> {
    return this.items.find((item) => item[this.key] === key);
  }
  async put(item: TItem): Promise<void> {
    const index = this.items.findIndex((existing) => existing[this.key] === item[this.key]);
    if (index < 0) this.items.push(item);
    else this.items[index] = item;
  }
  async bulkPut(items: TItem[]): Promise<void> {
    for (const item of items) await this.put(item);
  }
  async bulkGet(keys: string[]): Promise<Array<TItem | undefined>> {
    return Promise.all(keys.map((key) => this.get(key)));
  }
  async bulkDelete(keys: string[]): Promise<void> {
    this.items = this.items.filter((item) => !keys.includes(String(item[this.key])));
  }
  async delete(key: string): Promise<void> {
    await this.bulkDelete([key]);
  }
  async toArray(): Promise<TItem[]> {
    return [...this.items];
  }
  filter(predicate: (item: TItem) => boolean) {
    return {
      toArray: async () => this.items.filter(predicate),
      count: async () => this.items.filter(predicate).length
    };
  }
}

function point(id: string, overrides: Partial<Point> = {}): Point {
  return {
    id,
    sourceKey: `ozon|moscow|${id}`,
    brand: "Ozon",
    city: "Москва",
    address: id,
    normalizedCity: "москва",
    normalizedAddress: id,
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

function change(id: string, entityId: string, overrides: Partial<Change> = {}): Change {
  return {
    id,
    entityName: "point",
    entityId,
    operation: "update",
    baseVersion: 1,
    clientId: "phone",
    sourceId: "source-A",
    baseValues: { comment: null },
    patch: { comment: "локально" },
    syncedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1,
    ...overrides
  };
}

function pull(sourceId: string, points: Point[], conflicts: Conflict[] = []): PullResponse {
  return { sourceId, serverTime: later, points, owners: [], visits: [], conflicts };
}

function database(input: { points?: Point[]; changes?: Change[]; sourceId?: string; freshDraft?: boolean } = {}) {
  const meta: MetaEntry[] = input.sourceId
    ? [{ key: SYNC_SOURCE_META_KEY, value: input.sourceId, updatedAt: now }]
    : [];
  if (input.freshDraft) meta.push({ key: FIRST_OFFLINE_DRAFT_META_KEY, value: true, updatedAt: now });
  return {
    points: new FakeTable("id", input.points ?? []),
    owners: new FakeTable("id"),
    visits: new FakeTable("id"),
    changes: new FakeTable("id", input.changes ?? []),
    conflicts: new FakeTable("id"),
    meta: new FakeTable<MetaEntry>("key", meta),
    transaction: async (...args: unknown[]) => {
      const callback = args.at(-1);
      if (typeof callback !== "function") throw new Error("missing transaction callback");
      return callback();
    }
  } as unknown as PvzDatabase;
}

function table<T extends object>(value: unknown): FakeTable<T> {
  return value as FakeTable<T>;
}

describe("server-authoritative sync", () => {
  it("loads a complete snapshot into an empty cache", async () => {
    const local = database();
    const remote = pull("source-A", [point("one"), point("two")]);
    const api = {
      pullSync: vi.fn().mockResolvedValue(remote),
      pushSync: vi.fn()
    };

    const result = await runSync({ database: local, api });

    expect(result.reviewRequired).toBe(false);
    expect(api.pullSync).toHaveBeenCalledWith(null);
    expect(api.pushSync).not.toHaveBeenCalled();
    expect(table<Point>(local.points).items.map((item) => item.id)).toEqual(["one", "two"]);
    expect((await local.meta.get(SYNC_SOURCE_META_KEY))?.value).toBe("source-A");
  });

  it("replaces stale rows automatically when the table has fewer records", async () => {
    const local = database({
      sourceId: "source-A",
      points: [point("one"), point("two"), point("three")]
    });
    const remote = pull("source-A", [point("one")]);
    const api = { pullSync: vi.fn().mockResolvedValue(remote), pushSync: vi.fn() };

    const first = await runSync({ database: local, api });
    expect(first.reviewRequired).toBe(false);
    expect(api.pushSync).not.toHaveBeenCalled();
    expect(table<Point>(local.points).items.map((item) => item.id)).toEqual(["one"]);
    expect((await local.meta.get(CACHE_REPLACEMENT_NOTICE_META_KEY))?.value).toMatchObject({
      kind: "records-removed", beforePoints: 3, afterPoints: 1
    });
    expect(await local.meta.get(STAGED_SNAPSHOT_META_KEY)).toBeUndefined();
  });

  it("keeps edits to a remotely removed point without showing the stale point", async () => {
    const local = database({
      sourceId: "source-A",
      points: [point("removed", { comment: "локально" })],
      changes: [change("change-removed", "removed")]
    });
    const api = {
      pullSync: vi.fn().mockResolvedValue(pull("source-A", [])),
      pushSync: vi.fn()
    };

    await runSync({ database: local, api });

    expect(table<Point>(local.points).items).toEqual([]);
    expect(table<Change>(local.changes).items[0]).toMatchObject({
      id: "change-removed", sourceId: "held:source-A", syncedAt: null
    });
    expect((await local.meta.get(HELD_RECORDS_BACKUP_META_KEY))?.value).toMatchObject([
      { entityId: "removed", record: expect.objectContaining({ comment: "локально" }) }
    ]);
    expect(api.pushSync).not.toHaveBeenCalled();
  });

  it("does not send old-source changes to a new spreadsheet", async () => {
    const oldChange = change("change-one", "one");
    const local = database({
      sourceId: "source-A",
      points: [point("one", { comment: "локально" })],
      changes: [oldChange]
    });
    const remote = pull("source-B", [point("new")]);
    const api = { pullSync: vi.fn().mockResolvedValue(remote), pushSync: vi.fn() };

    expect((await runSync({ database: local, api })).reviewRequired).toBe(false);
    expect(api.pushSync).not.toHaveBeenCalled();
    expect(table<Point>(local.points).items.map((item) => item.id)).toEqual(["new"]);
    expect((await local.meta.get(CACHE_REPLACEMENT_NOTICE_META_KEY))?.value).toMatchObject({
      kind: "source-changed", beforePoints: 1, afterPoints: 1
    });
    expect(table<Change>(local.changes).items[0]).toMatchObject({
      id: "change-one", sourceId: "source-A", syncedAt: null
    });
    expect((await runSync({ database: local, api })).reviewRequired).toBe(false);
    expect(api.pushSync).not.toHaveBeenCalled();
  });

  it("switches to the new source when it changes between pull and push", async () => {
    const local = database({
      sourceId: "source-A",
      points: [point("one", { comment: "локально" })],
      changes: [change("change-one", "one")]
    });
    const api = {
      pullSync: vi.fn().mockResolvedValueOnce(pull("source-A", [point("one")]))
        .mockResolvedValueOnce(pull("source-B", [point("new")]))
        .mockResolvedValueOnce(pull("source-B", [point("new")])),
      pushSync: vi.fn().mockRejectedValue(new ApiError({
        status: 409, code: "sync_source_mismatch", message: "source changed"
      }))
    };

    const result = await runSync({ database: local, api });
    expect(result.reviewRequired).toBe(false);
    expect(table<Point>(local.points).items.map((item) => item.id)).toEqual(["new"]);
    expect(table<Change>(local.changes).items[0]).toMatchObject({
      id: "change-one", sourceId: "source-A", syncedAt: null
    });
  });

  it("archives a successful old-source push before a final pull switches spreadsheets", async () => {
    const localChange = change("change-one", "one");
    const local = database({
      sourceId: "source-A",
      points: [point("one", { comment: "локально" })],
      changes: [localChange]
    });
    const pushed: PushResponse = {
      sourceId: "source-A", serverTime: later, applied: [localChange.id],
      rejected: [], conflicts: [], points: [point("one", { comment: "локально", version: 2 })]
    };
    const api = {
      pullSync: vi.fn().mockResolvedValueOnce(pull("source-A", [point("one")]))
        .mockResolvedValueOnce(pull("source-B", [point("new")])),
      pushSync: vi.fn().mockResolvedValue(pushed)
    };

    await runSync({ database: local, api });

    expect(table<Change>(local.changes).items[0].syncedAt).toBe(later);
    expect(table<Point>(local.points).items.map((item) => item.id)).toEqual(["new"]);
    expect((await local.meta.get(PREVIOUS_DATA_BACKUPS_META_KEY))?.value).toMatchObject([{
      sourceId: "source-A",
      points: [expect.objectContaining({ id: "one", comment: "локально" })]
    }]);
  });

  it("does not bind edits from an older cache to an unidentified source", async () => {
    const unbound = change("old-change", "one", { sourceId: undefined });
    const local = database({
      points: [point("one", { comment: "локально" })],
      changes: [unbound]
    });
    const remote = pull("source-A", [point("one")]);
    const api = { pullSync: vi.fn().mockResolvedValue(remote), pushSync: vi.fn() };

    expect((await runSync({ database: local, api })).reviewRequired).toBe(false);
    expect(api.pushSync).not.toHaveBeenCalled();
    expect(table<Point>(local.points).items[0].comment).toBeNull();
    expect(table<Change>(local.changes).items[0].syncedAt).toBeNull();
    expect((await local.meta.get(PREVIOUS_DATA_BACKUPS_META_KEY))?.value).toMatchObject([{
      points: [expect.objectContaining({ id: "one", comment: "локально" })]
    }]);
    expect((await runSync({ database: local, api })).reviewRequired).toBe(false);
    expect(api.pushSync).not.toHaveBeenCalled();
  });

  it("does not mistake an offline creation for a remote deletion", async () => {
    const created = point("offline");
    const localChange = change("create-one", "offline", {
      operation: "create",
      baseVersion: 0,
      baseValues: undefined,
      patch: { ...created }
    });
    const local = database({ sourceId: "source-A", points: [created], changes: [localChange] });
    const remote = pull("source-A", []);
    const pushed: PushResponse = {
      sourceId: "source-A", serverTime: later, applied: ["create-one"], rejected: [],
      conflicts: [], points: [point("offline", { version: 2 })]
    };
    const api = {
      pullSync: vi.fn().mockResolvedValueOnce(remote).mockResolvedValueOnce(pull("source-A", pushed.points ?? [])),
      pushSync: vi.fn().mockResolvedValue(pushed)
    };

    const result = await runSync({ database: local, api });
    expect(result.reviewRequired).toBe(false);
    expect(api.pushSync).toHaveBeenCalledWith({
      clientId: "local", sourceId: "source-A", changes: [localChange]
    });
    expect(table<Change>(local.changes).items[0].syncedAt).toBe(later);
  });

  it("sends a point created before the first ever online connection", async () => {
    const created = point("first-offline");
    const localChange = change("first-create", created.id, {
      operation: "create", baseVersion: 0, sourceId: undefined,
      baseValues: undefined, patch: { ...created }
    });
    const local = database({ points: [created], changes: [localChange], freshDraft: true });
    const pushed: PushResponse = {
      sourceId: "source-A", serverTime: later, applied: [localChange.id],
      rejected: [], conflicts: [], points: [created]
    };
    const api = {
      pullSync: vi.fn().mockResolvedValueOnce(pull("source-A", []))
        .mockResolvedValueOnce(pull("source-A", [created])),
      pushSync: vi.fn().mockResolvedValue(pushed)
    };

    expect((await runSync({ database: local, api })).reviewRequired).toBe(false);
    expect(api.pushSync).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: "source-A",
      changes: [expect.objectContaining({ id: localChange.id, sourceId: "source-A" })]
    }));
    expect(table<Point>(local.points).items).toHaveLength(1);
    expect(table<Change>(local.changes).items[0].syncedAt).toBe(later);
  });

  it("does not bind an unmarked old creation to a newly configured spreadsheet", async () => {
    const created = point("old-offline");
    const localChange = change("old-create", created.id, {
      operation: "create", baseVersion: 0, sourceId: undefined,
      baseValues: undefined, patch: { ...created }
    });
    const local = database({ points: [created], changes: [localChange] });
    const api = {
      pullSync: vi.fn().mockResolvedValue(pull("source-B", [])),
      pushSync: vi.fn()
    };

    await runSync({ database: local, api });

    expect(api.pushSync).not.toHaveBeenCalled();
    expect(table<Point>(local.points).items).toEqual([]);
    expect(table<Change>(local.changes).items[0]).toMatchObject({
      id: "old-create", sourceId: undefined, syncedAt: null
    });
    expect((await local.meta.get(HELD_RECORDS_BACKUP_META_KEY))?.value).toMatchObject([
      { entityId: created.id, record: expect.objectContaining({ id: created.id }) }
    ]);
  });

  it("keeps the table value and records a notice when both sides edit one field", async () => {
    const remotePoint = point("one", { comment: "в таблице", version: 2 });
    const local = database({
      sourceId: "source-A",
      points: [point("one", { comment: "локально", version: 2 })],
      changes: [change("change-one", "one")]
    });
    const notice: Conflict = {
      id: "notice-one", entityName: "point", entityId: "one", field: "comment",
      baseVersion: 1, remoteVersion: 2, localValue: "локально", remoteValue: "в таблице",
      resolvedAt: later, resolution: "remote", createdAt: later, updatedAt: later,
      deletedAt: null, version: 1
    };
    const pushed: PushResponse = {
      sourceId: "source-A", serverTime: later, applied: [],
      rejected: [{ changeId: "change-one", reason: "conflict" }],
      conflicts: [notice], points: [remotePoint]
    };
    const api = {
      pullSync: vi.fn().mockResolvedValueOnce(pull("source-A", [remotePoint]))
        .mockResolvedValueOnce(pull("source-A", [remotePoint])),
      pushSync: vi.fn().mockResolvedValue(pushed)
    };

    await runSync({ database: local, api });
    expect(table<Point>(local.points).items[0].comment).toBe("в таблице");
    expect(table<Change>(local.changes).items[0].syncedAt).toBe(later);
    expect(table<Conflict>(local.conflicts).items[0]).toMatchObject({
      field: "comment", resolution: "remote", localNotice: true
    });
  });
});

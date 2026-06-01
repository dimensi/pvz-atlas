import { describe, expect, it } from "vitest";
import type { Change, Point } from "@/lib/data-model/types";
import {
  applyEntityPatch,
  assertNonEmptyPatch,
  createChangeRecord,
  createEntityPatch,
  markChangeRecordsApplied
} from "./changes";

const now = "2026-01-02T03:04:05.000Z";

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
  version: 3
};

describe("sync change helpers", () => {
  it("creates an unsynced change record with baseVersion and patch", () => {
    const change = createChangeRecord(
      {
        entityName: "point",
        entityId: "point-1",
        operation: "update",
        baseVersion: 3,
        patch: { ownerId: "owner-1" }
      },
      {
        idFactory: () => "change-1",
        clock: () => now
      }
    );

    expect(change).toEqual({
      id: "change-1",
      entityName: "point",
      entityId: "point-1",
      operation: "update",
      baseVersion: 3,
      patch: { ownerId: "owner-1" },
      syncedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      version: 1
    });
  });

  it("keeps only changed fields in an update patch", () => {
    const patch = createEntityPatch(point, {
      ownerId: "owner-1",
      status: "new",
      comment: undefined
    });

    expect(patch).toEqual({ ownerId: "owner-1" });
  });

  it("rejects empty patches", () => {
    expect(() => assertNonEmptyPatch({})).toThrow("Patch must include");
  });

  it("applies a local entity patch and increments local version", () => {
    const updated = applyEntityPatch(point, { ownerId: "owner-1" }, "2026-01-03T00:00:00.000Z");

    expect(updated.ownerId).toBe("owner-1");
    expect(updated.version).toBe(4);
    expect(updated.updatedAt).toBe("2026-01-03T00:00:00.000Z");
    expect(updated.createdAt).toBe(point.createdAt);
  });

  it("marks accepted changes as applied", () => {
    const change: Change = createChangeRecord(
      {
        entityName: "point",
        entityId: "point-1",
        operation: "update",
        baseVersion: 3,
        patch: { ownerId: "owner-1" }
      },
      {
        idFactory: () => "change-1",
        clock: () => now
      }
    );

    const [applied] = markChangeRecordsApplied([change], "2026-01-04T00:00:00.000Z");

    expect(applied).toMatchObject({
      id: "change-1",
      syncedAt: "2026-01-04T00:00:00.000Z",
      updatedAt: "2026-01-04T00:00:00.000Z",
      version: 2
    });
  });
});

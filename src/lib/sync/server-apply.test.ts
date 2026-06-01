import { describe, expect, it } from "vitest";
import type { Change, Owner, Point } from "@/lib/data-model/types";
import { applyChangesToSnapshot, type RemoteSnapshot } from "./server-apply";

const now = "2026-01-02T03:04:05.000Z";
const later = "2026-01-03T00:00:00.000Z";

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

const owner: Owner = {
  id: "owner-1",
  name: "Owner One",
  phone: null,
  telegram: null,
  comment: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  version: 2
};

const snapshot = (overrides: Partial<RemoteSnapshot> = {}): RemoteSnapshot => ({
  points: [point],
  owners: [],
  visits: [],
  conflicts: [],
  ...overrides
});

const change = (overrides: Partial<Change> = {}): Change => ({
  id: "change-1",
  entityName: "point",
  entityId: "point-1",
  operation: "update",
  baseVersion: 3,
  clientId: "client-1",
  patch: { ownerId: "owner-1" },
  syncedAt: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  version: 1,
  ...overrides
});

const options = {
  clock: () => later,
  idFactory: () => "conflict-1"
};

describe("server sync application", () => {
  it("applies a direct version match and increments version", () => {
    const result = applyChangesToSnapshot(snapshot(), [change()], options);

    expect(result.acceptedChangeIds).toEqual(["change-1"]);
    expect(result.snapshot.points[0]).toMatchObject({
      ownerId: "owner-1",
      updatedAt: later,
      version: 4
    });
    expect(result.appliedChanges[0]).toMatchObject({
      id: "change-1",
      syncedAt: later,
      version: 2
    });
  });

  it("creates a conflict when remote version changed and patched field differs", () => {
    const remote = { ...point, ownerId: "owner-2", version: 4 };
    const result = applyChangesToSnapshot(snapshot({ points: [remote] }), [change()], options);

    expect(result.acceptedChangeIds).toEqual([]);
    expect(result.conflicts).toEqual([
      expect.objectContaining({
        id: "conflict-1",
        entityName: "point",
        entityId: "point-1",
        field: "ownerId",
        localValue: "owner-1",
        remoteValue: "owner-2",
        baseVersion: 3,
        remoteVersion: 4
      })
    ]);
    expect(result.snapshot.points[0].ownerId).toBe("owner-2");
  });

  it("accepts a version mismatch when the patched field is already applied remotely", () => {
    const remote = { ...point, ownerId: "owner-1", version: 4 };
    const result = applyChangesToSnapshot(snapshot({ points: [remote] }), [change()], options);

    expect(result.acceptedChangeIds).toEqual(["change-1"]);
    expect(result.conflicts).toEqual([]);
    expect(result.snapshot.points[0].version).toBe(4);
  });

  it("creates a new entity from a create change", () => {
    const newPoint = { ...point, id: "point-2", version: 1 };
    const result = applyChangesToSnapshot(
      snapshot({ points: [] }),
      [
        change({
          id: "change-2",
          entityId: "point-2",
          operation: "create",
          baseVersion: 0,
          patch: newPoint
        })
      ],
      options
    );

    expect(result.acceptedChangeIds).toEqual(["change-2"]);
    expect(result.snapshot.points).toEqual([newPoint]);
  });

  it("marks an entity deleted on a delete change", () => {
    const result = applyChangesToSnapshot(
      snapshot(),
      [change({ operation: "delete", patch: {}, baseVersion: 3 })],
      options
    );

    expect(result.acceptedChangeIds).toEqual(["change-1"]);
    expect(result.snapshot.points[0]).toMatchObject({
      deletedAt: later,
      updatedAt: later,
      version: 4
    });
  });

  it("blocks hiding an owner when remote points reference that owner", () => {
    const result = applyChangesToSnapshot(
      snapshot({
        owners: [owner],
        points: [{ ...point, ownerId: "owner-1" }]
      }),
      [
        change({
          entityName: "owner",
          entityId: "owner-1",
          baseVersion: 2,
          patch: { deletedAt: later }
        })
      ],
      options
    );

    expect(result.acceptedChangeIds).toEqual([]);
    expect(result.snapshot.owners[0].deletedAt).toBeNull();
    expect(result.conflicts).toEqual([
      expect.objectContaining({
        entityName: "owner",
        entityId: "owner-1",
        field: "deletedAt",
        remoteValue: "owner_has_assigned_points"
      })
    ]);
  });

  it("blocks deleting an owner when remote points reference that owner", () => {
    const result = applyChangesToSnapshot(
      snapshot({
        owners: [owner],
        points: [{ ...point, ownerId: "owner-1" }]
      }),
      [
        change({
          entityName: "owner",
          entityId: "owner-1",
          operation: "delete",
          baseVersion: 2,
          patch: {}
        })
      ],
      options
    );

    expect(result.acceptedChangeIds).toEqual([]);
    expect(result.snapshot.owners[0].deletedAt).toBeNull();
    expect(result.conflicts).toEqual([
      expect.objectContaining({
        entityName: "owner",
        entityId: "owner-1",
        field: "deletedAt",
        remoteValue: "owner_has_assigned_points"
      })
    ]);
  });
});

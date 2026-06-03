import { conflictSchema, ownerSchema, pointSchema, visitSchema } from "@/lib/data-model/schemas";
import type { Change, Conflict, Owner, Point, Visit } from "@/lib/data-model/types";
import { deterministicConflictId } from "./conflict-identity";

type SyncableEntityName = Change["entityName"];
type SyncableEntity = Point | Owner | Visit;
type SyncableCollections = {
  points: Point[];
  owners: Owner[];
  visits: Visit[];
};

export interface RemoteSnapshot extends SyncableCollections {
  conflicts: Conflict[];
}

export interface ApplyChangesOptions {
  clock: () => string;
  idFactory?: () => string;
}

export interface ApplyChangesResult {
  snapshot: RemoteSnapshot;
  acceptedChangeIds: string[];
  conflicts: Conflict[];
  appliedChanges: Change[];
  warnings: string[];
}

const collectionKeyByEntity = {
  point: "points",
  owner: "owners",
  visit: "visits"
} as const satisfies Record<SyncableEntityName, keyof SyncableCollections>;

const immutablePatchFields = new Set(["id", "createdAt", "version"]);

function entitySchema(entityName: SyncableEntityName) {
  if (entityName === "point") {
    return pointSchema;
  }

  if (entityName === "owner") {
    return ownerSchema;
  }

  return visitSchema;
}

function cloneSnapshot(snapshot: RemoteSnapshot): RemoteSnapshot {
  return {
    points: snapshot.points.map((point) => ({ ...point })),
    owners: snapshot.owners.map((owner) => ({ ...owner })),
    visits: snapshot.visits.map((visit) => ({ ...visit })),
    conflicts: snapshot.conflicts.map((conflict) => ({ ...conflict }))
  };
}

function getCollection(snapshot: RemoteSnapshot, entityName: SyncableEntityName): SyncableEntity[] {
  return snapshot[collectionKeyByEntity[entityName]];
}

function replaceEntity(
  snapshot: RemoteSnapshot,
  entityName: SyncableEntityName,
  entity: SyncableEntity
): void {
  const collection = getCollection(snapshot, entityName);
  const index = collection.findIndex((item) => item.id === entity.id);

  if (index === -1) {
    collection.push(entity);
    return;
  }

  collection[index] = entity;
}

function findEntity(
  snapshot: RemoteSnapshot,
  entityName: SyncableEntityName,
  entityId: string
): SyncableEntity | undefined {
  return getCollection(snapshot, entityName).find((entity) => entity.id === entityId);
}

function createConflict(
  change: Change,
  field: string,
  localValue: unknown,
  remoteValue: unknown,
  now: string,
  remoteVersion: number
): Conflict {
  const conflict = {
    entityName: change.entityName,
    entityId: change.entityId,
    field,
    localValue,
    remoteValue,
    baseVersion: change.baseVersion,
    remoteVersion,
    resolvedAt: null,
    resolution: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1
  };

  return conflictSchema.parse({
    id: deterministicConflictId(conflict),
    ...conflict
  });
}

function markChangeApplied(change: Change, now: string): Change {
  return {
    ...change,
    syncedAt: now,
    updatedAt: now,
    version: change.version + 1
  };
}

function patchEntries(change: Change): Array<[string, unknown]> {
  return Object.entries(change.patch).filter(([field]) => !immutablePatchFields.has(field));
}

function ownerHasActivePoints(snapshot: RemoteSnapshot, ownerId: string): boolean {
  return snapshot.points.some((point) => point.deletedAt === null && point.ownerId === ownerId);
}

function isOwnerHideChange(change: Change): boolean {
  return (
    change.entityName === "owner" &&
    change.patch.deletedAt !== undefined &&
    change.patch.deletedAt !== null
  );
}

function validateEntity(entityName: SyncableEntityName, entity: unknown): SyncableEntity {
  return entitySchema(entityName).parse(entity) as SyncableEntity;
}

function applyCreate(
  snapshot: RemoteSnapshot,
  change: Change,
  now: string
): { accepted: boolean; conflicts: Conflict[] } {
  const existing = findEntity(snapshot, change.entityName, change.entityId);
  if (existing) {
    if (JSON.stringify(existing) === JSON.stringify(change.patch)) {
      return { accepted: true, conflicts: [] };
    }

    return {
      accepted: false,
      conflicts: [
        createConflict(change, "__record__", change.patch, existing, now, existing.version)
      ]
    };
  }

  const created = validateEntity(change.entityName, change.patch);
  replaceEntity(snapshot, change.entityName, created);

  return { accepted: true, conflicts: [] };
}

function applyUpdate(
  snapshot: RemoteSnapshot,
  change: Change,
  now: string
): { accepted: boolean; conflicts: Conflict[] } {
  const current = findEntity(snapshot, change.entityName, change.entityId);
  if (!current) {
    return {
      accepted: false,
      conflicts: [createConflict(change, "__record__", change.patch, null, now, 0)]
    };
  }

  if (isOwnerHideChange(change) && ownerHasActivePoints(snapshot, change.entityId)) {
    return {
      accepted: false,
      conflicts: [
        createConflict(
          change,
          "deletedAt",
          change.patch.deletedAt,
          "owner_has_assigned_points",
          now,
          current.version
        )
      ]
    };
  }

  const entries = patchEntries(change);
  if (current.version !== change.baseVersion) {
    const conflicts = entries
      .filter(
        ([field, localValue]) =>
          !Object.is((current as unknown as Record<string, unknown>)[field], localValue)
      )
      .map(([field, localValue]) =>
        createConflict(
          change,
          field,
          localValue,
          (current as unknown as Record<string, unknown>)[field],
          now,
          current.version
        )
      );

    return { accepted: conflicts.length === 0, conflicts };
  }

  const patched = validateEntity(change.entityName, {
    ...current,
    ...Object.fromEntries(entries),
    updatedAt: now,
    version: current.version + 1
  });
  replaceEntity(snapshot, change.entityName, patched);

  return { accepted: true, conflicts: [] };
}

function applyDelete(
  snapshot: RemoteSnapshot,
  change: Change,
  now: string
): { accepted: boolean; conflicts: Conflict[] } {
  const current = findEntity(snapshot, change.entityName, change.entityId);
  if (!current) {
    return { accepted: true, conflicts: [] };
  }

  if (current.deletedAt) {
    return { accepted: true, conflicts: [] };
  }

  if (change.entityName === "owner" && ownerHasActivePoints(snapshot, change.entityId)) {
    return {
      accepted: false,
      conflicts: [
        createConflict(
          change,
          "deletedAt",
          now,
          "owner_has_assigned_points",
          now,
          current.version
        )
      ]
    };
  }

  if (current.version !== change.baseVersion) {
    return {
      accepted: false,
      conflicts: [
        createConflict(change, "deletedAt", now, current.deletedAt, now, current.version)
      ]
    };
  }

  const deleted = validateEntity(change.entityName, {
    ...current,
    deletedAt: now,
    updatedAt: now,
    version: current.version + 1
  });
  replaceEntity(snapshot, change.entityName, deleted);

  return { accepted: true, conflicts: [] };
}

export function applyChangesToSnapshot(
  snapshot: RemoteSnapshot,
  changes: Change[],
  options: ApplyChangesOptions
): ApplyChangesResult {
  const nextSnapshot = cloneSnapshot(snapshot);
  const now = options.clock();
  const acceptedChangeIds: string[] = [];
  const allConflicts: Conflict[] = [];
  const appliedChanges: Change[] = [];
  const warnings: string[] = [];

  for (const change of changes) {
    try {
      const result =
        change.operation === "create"
          ? applyCreate(nextSnapshot, change, now)
          : change.operation === "update"
            ? applyUpdate(nextSnapshot, change, now)
            : applyDelete(nextSnapshot, change, now);

      if (result.conflicts.length > 0) {
        nextSnapshot.conflicts.push(...result.conflicts);
        allConflicts.push(...result.conflicts);
      }

      if (result.accepted) {
        acceptedChangeIds.push(change.id);
        appliedChanges.push(markChangeApplied(change, now));
      }
    } catch (error) {
      warnings.push(
        `Change ${change.id} could not be applied: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
    }
  }

  return {
    snapshot: nextSnapshot,
    acceptedChangeIds,
    conflicts: allConflicts,
    appliedChanges,
    warnings
  };
}

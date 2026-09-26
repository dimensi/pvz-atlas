import { conflictSchema, ownerSchema, pointSchema, visitSchema } from "@/lib/data-model/schemas";
import type { Change, Conflict, Owner, Point, Visit } from "@/lib/data-model/types";
import { deterministicConflictId } from "./conflict-identity";

type SyncableEntityName = Change["entityName"];
type SyncableEntity = Point | Owner | Visit;
type ChangeWithBaseValues = Change & { baseValues?: Record<string, unknown> };
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
  rejected: Array<{ changeId: string; reason: string }>;
  conflicts: Conflict[];
  appliedChanges: Change[];
  warnings: string[];
}

interface ChangeApplyResult {
  accepted: boolean;
  conflicts: Conflict[];
  appliedPatch?: Record<string, unknown>;
  rejectionReason?: string;
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

function normalizeForComparison(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForComparison);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalizeForComparison(child)])
    );
  }

  return value;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (
    !left ||
    !right ||
    typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return false;
  }

  return JSON.stringify(normalizeForComparison(left)) === JSON.stringify(normalizeForComparison(right));
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
    resolvedAt: now,
    resolution: "remote" as const,
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

function markChangeApplied(change: Change, now: string, patch?: Record<string, unknown>): Change {
  return {
    ...change,
    ...(patch ? { patch } : {}),
    syncedAt: now,
    updatedAt: now,
    version: change.version + 1
  };
}

function patchEntries(change: Change): Array<[string, unknown]> {
  return Object.entries(change.patch).filter(([field]) => !immutablePatchFields.has(field));
}

function getBaseValues(change: Change): Record<string, unknown> | undefined {
  return (change as ChangeWithBaseValues).baseValues;
}

function hasBaseValues(change: Change, fields: string[]): boolean {
  const baseValues = getBaseValues(change);
  return Boolean(
    baseValues && fields.every((field) => Object.prototype.hasOwnProperty.call(baseValues, field))
  );
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

function missingBaseConflicts(
  snapshot: RemoteSnapshot,
  change: Change,
  now: string
): Conflict[] {
  const current = findEntity(snapshot, change.entityName, change.entityId);
  const fields = change.operation === "delete" ? ["deletedAt"] : patchEntries(change).map(([field]) => field);
  const remoteVersion = current?.version ?? 0;

  if (!current) {
    return [createConflict(change, "__record__", change.patch, null, now, remoteVersion)];
  }

  return (fields.length > 0 ? fields : ["__record__"]).map((field) =>
    createConflict(
      change,
      field,
      field === "__record__" ? change.patch : change.operation === "delete" ? now : change.patch[field],
      field === "__record__" ? current : (current as unknown as Record<string, unknown>)[field],
      now,
      remoteVersion
    )
  );
}

function blockedChangeConflicts(
  snapshot: RemoteSnapshot,
  change: Change,
  now: string
): Conflict[] {
  const current = findEntity(snapshot, change.entityName, change.entityId);
  if (!current) {
    return [createConflict(change, "__record__", change.patch, null, now, 0)];
  }

  const fields =
    change.operation === "delete" ? ["deletedAt"] : patchEntries(change).map(([field]) => field);
  if (change.operation === "create" || fields.length === 0) {
    return [createConflict(change, "__record__", change.patch, current, now, current.version)];
  }

  return fields.map((field) =>
      createConflict(
        change,
        field,
        change.operation === "delete" ? now : change.patch[field],
        (current as unknown as Record<string, unknown>)[field],
        now,
        current.version
      )
    );
}

function applyCreate(snapshot: RemoteSnapshot, change: Change, now: string): ChangeApplyResult {
  const existing = findEntity(snapshot, change.entityName, change.entityId);
  if (existing) {
    if (valuesEqual(existing, change.patch)) {
      return { accepted: true, conflicts: [], appliedPatch: change.patch };
    }

    return {
      accepted: false,
      conflicts: [createConflict(change, "__record__", change.patch, existing, now, existing.version)],
      rejectionReason: "conflict"
    };
  }

  const created = validateEntity(change.entityName, change.patch);
  replaceEntity(snapshot, change.entityName, created);

  return { accepted: true, conflicts: [], appliedPatch: change.patch };
}

function applyUpdate(snapshot: RemoteSnapshot, change: Change, now: string): ChangeApplyResult {
  const entries = patchEntries(change);
  if (!hasBaseValues(change, entries.map(([field]) => field))) {
    return {
      accepted: false,
      conflicts: missingBaseConflicts(snapshot, change, now),
      rejectionReason: "legacy_base_unknown"
    };
  }

  const current = findEntity(snapshot, change.entityName, change.entityId);
  if (!current) {
    return {
      accepted: false,
      conflicts: [createConflict(change, "__record__", change.patch, null, now, 0)],
      rejectionReason: "conflict"
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
      ],
      rejectionReason: "conflict"
    };
  }

  const baseValues = getBaseValues(change) ?? {};
  const safeEntries: Array<[string, unknown]> = [];
  const conflicts: Conflict[] = [];

  for (const [field, localValue] of entries) {
    const remoteValue = (current as unknown as Record<string, unknown>)[field];
    if (valuesEqual(localValue, remoteValue)) {
      continue;
    }

    if (valuesEqual(remoteValue, baseValues[field])) {
      safeEntries.push([field, localValue]);
      continue;
    }

    conflicts.push(createConflict(change, field, localValue, remoteValue, now, current.version));
  }

  if (safeEntries.length > 0) {
    const patched = validateEntity(change.entityName, {
      ...current,
      ...Object.fromEntries(safeEntries),
      updatedAt: now,
      version: current.version + 1
    });
    replaceEntity(snapshot, change.entityName, patched);
  }

  return {
    accepted: conflicts.length === 0,
    conflicts,
    appliedPatch: Object.fromEntries(safeEntries),
    ...(conflicts.length > 0 ? { rejectionReason: "conflict" } : {})
  };
}

function applyDelete(snapshot: RemoteSnapshot, change: Change, now: string): ChangeApplyResult {
  if (!hasBaseValues(change, ["deletedAt"])) {
    return {
      accepted: false,
      conflicts: missingBaseConflicts(snapshot, change, now),
      rejectionReason: "legacy_base_unknown"
    };
  }

  const current = findEntity(snapshot, change.entityName, change.entityId);
  if (!current || current.deletedAt) {
    return { accepted: true, conflicts: [], appliedPatch: {} };
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
      ],
      rejectionReason: "conflict"
    };
  }

  const baseValue = getBaseValues(change)?.deletedAt;
  if (!valuesEqual(current.deletedAt, baseValue)) {
    return {
      accepted: false,
      conflicts: [createConflict(change, "deletedAt", now, current.deletedAt, now, current.version)],
      rejectionReason: "conflict"
    };
  }

  const deleted = validateEntity(change.entityName, {
    ...current,
    deletedAt: now,
    updatedAt: now,
    version: current.version + 1
  });
  replaceEntity(snapshot, change.entityName, deleted);

  return { accepted: true, conflicts: [], appliedPatch: {} };
}

export function applyChangesToSnapshot(
  snapshot: RemoteSnapshot,
  changes: Change[],
  options: ApplyChangesOptions
): ApplyChangesResult {
  const nextSnapshot = cloneSnapshot(snapshot);
  const now = options.clock();
  const acceptedChangeIds: string[] = [];
  const rejected: ApplyChangesResult["rejected"] = [];
  const allConflicts: Conflict[] = [];
  const appliedChanges: Change[] = [];
  const warnings: string[] = [];
  const blockedCreates = new Set<string>();

  for (const change of changes) {
    const entityKey = `${change.entityName}:${change.entityId}`;

    if (blockedCreates.has(entityKey)) {
      const conflicts = blockedChangeConflicts(nextSnapshot, change, now);
      nextSnapshot.conflicts.push(...conflicts);
      allConflicts.push(...conflicts);
      rejected.push({ changeId: change.id, reason: "conflict" });
      continue;
    }

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
      } else {
        const reason = result.rejectionReason ?? "not_applied";
        rejected.push({ changeId: change.id, reason });
        if (change.operation === "create") {
          blockedCreates.add(entityKey);
        }

        if (result.appliedPatch && Object.keys(result.appliedPatch).length > 0) {
          appliedChanges.push(markChangeApplied(change, now, result.appliedPatch));
        }
      }
    } catch (error) {
      warnings.push(
        `Change ${change.id} could not be applied: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
      rejected.push({ changeId: change.id, reason: "not_applied" });
      if (change.operation === "create") {
        blockedCreates.add(entityKey);
      }
    }
  }

  return {
    snapshot: nextSnapshot,
    acceptedChangeIds,
    rejected,
    conflicts: allConflicts,
    appliedChanges,
    warnings
  };
}

"use client";

import { createPointSourceKey, normalizeAddressPart } from "@/lib/data-model/source-key";
import type { Change, Owner, Point, PointStatus, Visit } from "@/lib/data-model/types";
import {
  applyEntityPatch,
  assertNonEmptyPatch,
  createChangeRecord,
  createEntityPatch,
  markChangeRecordsApplied,
  type Clock,
  type IdFactory
} from "@/lib/sync/changes";
import { db, type PvzDatabase } from "./db";

const defaultClock = (): string => new Date().toISOString();
const defaultIdFactory = (): string => crypto.randomUUID();

type RepositoryOptions = {
  database?: PvzDatabase;
  clock?: Clock;
  idFactory?: IdFactory;
  clientId?: string;
};

type PointMutableFields = Pick<
  Point,
  | "brand"
  | "city"
  | "address"
  | "normalizedCity"
  | "normalizedAddress"
  | "ownerId"
  | "status"
  | "lat"
  | "lon"
  | "comment"
  | "deletedAt"
>;

type OwnerMutableFields = Pick<Owner, "name" | "phone" | "telegram" | "comment" | "deletedAt">;

type VisitMutableFields = Pick<Visit, "pointId" | "visitedAt" | "status" | "comment" | "deletedAt">;

export interface CreatePointInput {
  brand: string;
  city: string;
  address: string;
  status?: PointStatus;
  ownerId?: string | null;
  lat?: number | null;
  lon?: number | null;
  comment?: string | null;
}

export interface CreateOwnerInput {
  name: string;
  phone?: string | null;
  telegram?: string | null;
  comment?: string | null;
}

export interface MarkPointVisitedInput {
  pointId: string;
  visitedAt?: string;
  status?: Visit["status"];
  comment?: string | null;
}

function repositoryContext(options: RepositoryOptions = {}) {
  return {
    database: options.database ?? db,
    clock: options.clock ?? defaultClock,
    idFactory: options.idFactory ?? defaultIdFactory,
    clientId: options.clientId ?? "local"
  };
}

function enqueueCreateChange<TEntity extends Point | Owner | Visit>(
  entityName: Change["entityName"],
  entity: TEntity,
  idFactory: IdFactory,
  clock: Clock,
  clientId: string
): Change {
  return createChangeRecord(
    {
      entityName,
      entityId: entity.id,
      operation: "create",
      baseVersion: 0,
      clientId,
      patch: entity as unknown as Record<string, unknown>
    },
    { idFactory, clock }
  );
}

export async function createPoint(
  input: CreatePointInput,
  options: RepositoryOptions = {}
): Promise<Point> {
  const { database, clock, idFactory, clientId } = repositoryContext(options);

  return database.transaction("rw", database.points, database.changes, async () => {
    const now = clock();
    const point: Point = {
      id: idFactory(),
      sourceKey: createPointSourceKey(input),
      brand: input.brand,
      city: input.city,
      address: input.address,
      normalizedCity: normalizeAddressPart(input.city),
      normalizedAddress: normalizeAddressPart(input.address),
      ownerId: input.ownerId ?? null,
      status: input.status ?? "new",
      lat: input.lat ?? null,
      lon: input.lon ?? null,
      comment: input.comment ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      version: 1
    };
    const change = enqueueCreateChange("point", point, idFactory, () => now, clientId);

    await database.points.add(point);
    await database.changes.add(change);

    return point;
  });
}

export async function updatePointPatch(
  pointId: string,
  patch: Partial<PointMutableFields>,
  options: RepositoryOptions = {}
): Promise<Point> {
  const { database, clock, idFactory, clientId } = repositoryContext(options);

  return database.transaction("rw", database.points, database.changes, async () => {
    const current = await database.points.get(pointId);
    if (!current || current.deletedAt) {
      throw new Error(`point ${pointId} was not found.`);
    }

    const changedPatch = createEntityPatch(current, patch);
    assertNonEmptyPatch(changedPatch as Record<string, unknown>);

    const now = clock();
    const next = applyEntityPatch(current, changedPatch, now);
    const change = createChangeRecord(
      {
        entityName: "point",
        entityId: pointId,
        operation: "update",
        baseVersion: current.version,
        clientId,
        patch: changedPatch as Record<string, unknown>
      },
      { idFactory, clock: () => now }
    );

    await database.points.put(next);
    await database.changes.add(change);

    return next;
  });
}

export async function assignOwnerToPoint(
  pointId: string,
  ownerId: string | null,
  options: RepositoryOptions = {}
): Promise<Point> {
  return updatePointPatch(pointId, { ownerId }, options);
}

export async function createOwner(
  input: CreateOwnerInput,
  options: RepositoryOptions = {}
): Promise<Owner> {
  const { database, clock, idFactory, clientId } = repositoryContext(options);

  return database.transaction("rw", database.owners, database.changes, async () => {
    const now = clock();
    const owner: Owner = {
      id: idFactory(),
      name: input.name,
      phone: input.phone ?? null,
      telegram: input.telegram ?? null,
      comment: input.comment ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      version: 1
    };
    const change = enqueueCreateChange("owner", owner, idFactory, () => now, clientId);

    await database.owners.add(owner);
    await database.changes.add(change);

    return owner;
  });
}

export async function updateOwnerPatch(
  ownerId: string,
  patch: Partial<OwnerMutableFields>,
  options: RepositoryOptions = {}
): Promise<Owner> {
  const { database, clock, idFactory, clientId } = repositoryContext(options);

  return database.transaction("rw", database.owners, database.changes, async () => {
    const current = await database.owners.get(ownerId);
    if (!current || current.deletedAt) {
      throw new Error(`owner ${ownerId} was not found.`);
    }

    const changedPatch = createEntityPatch(current, patch);
    assertNonEmptyPatch(changedPatch as Record<string, unknown>);

    const now = clock();
    const next = applyEntityPatch(current, changedPatch, now);
    const change = createChangeRecord(
      {
        entityName: "owner",
        entityId: ownerId,
        operation: "update",
        baseVersion: current.version,
        clientId,
        patch: changedPatch as Record<string, unknown>
      },
      { idFactory, clock: () => now }
    );

    await database.owners.put(next);
    await database.changes.add(change);

    return next;
  });
}

export async function markPointVisited(
  input: MarkPointVisitedInput,
  options: RepositoryOptions = {}
): Promise<Visit> {
  const { database, clock, idFactory, clientId } = repositoryContext(options);

  return database.transaction("rw", database.points, database.visits, database.changes, async () => {
    const point = await database.points.get(input.pointId);
    if (!point || point.deletedAt) {
      throw new Error(`point ${input.pointId} was not found.`);
    }

    const now = clock();
    const visit: Visit = {
      id: idFactory(),
      pointId: input.pointId,
      visitedAt: input.visitedAt ?? now,
      status: input.status ?? "completed",
      comment: input.comment ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      version: 1
    };
    const change = enqueueCreateChange("visit", visit, idFactory, () => now, clientId);

    await database.visits.add(visit);
    await database.changes.add(change);

    return visit;
  });
}

export async function updateVisitPatch(
  visitId: string,
  patch: Partial<VisitMutableFields>,
  options: RepositoryOptions = {}
): Promise<Visit> {
  const { database, clock, idFactory, clientId } = repositoryContext(options);

  return database.transaction("rw", database.visits, database.changes, async () => {
    const current = await database.visits.get(visitId);
    if (!current || current.deletedAt) {
      throw new Error(`visit ${visitId} was not found.`);
    }

    const changedPatch = createEntityPatch(current, patch);
    assertNonEmptyPatch(changedPatch as Record<string, unknown>);

    const now = clock();
    const next = applyEntityPatch(current, changedPatch, now);
    const change = createChangeRecord(
      {
        entityName: "visit",
        entityId: visitId,
        operation: "update",
        baseVersion: current.version,
        clientId,
        patch: changedPatch as Record<string, unknown>
      },
      { idFactory, clock: () => now }
    );

    await database.visits.put(next);
    await database.changes.add(change);

    return next;
  });
}

export async function enqueueChange(
  change: Change,
  options: RepositoryOptions = {}
): Promise<string> {
  const { database } = repositoryContext(options);

  return database.changes.add(change);
}

export async function getPendingChanges(options: RepositoryOptions = {}): Promise<Change[]> {
  const { database } = repositoryContext(options);

  return database.changes
    .filter((change) => change.syncedAt === null && change.deletedAt === null)
    .sortBy("createdAt");
}

export async function markChangesApplied(
  changeIds: string[],
  options: RepositoryOptions = {}
): Promise<void> {
  if (changeIds.length === 0) {
    return;
  }

  const { database, clock } = repositoryContext(options);

  await database.transaction("rw", database.changes, async () => {
    const syncedAt = clock();
    const changes = await database.changes.bulkGet(changeIds);
    const existingChanges = changes.filter((change): change is Change => Boolean(change));
    const appliedChanges = markChangeRecordsApplied(existingChanges, syncedAt);

    await database.changes.bulkPut(appliedChanges);
  });
}

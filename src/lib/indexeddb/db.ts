"use client";

import Dexie, { type EntityTable } from "dexie";
import type { Change, Conflict, Owner, Point, Visit } from "@/lib/data-model/types";

export interface MetaEntry {
  key: string;
  value: unknown;
  updatedAt: string;
}

export class PvzDatabase extends Dexie {
  points!: EntityTable<Point, "id">;
  owners!: EntityTable<Owner, "id">;
  visits!: EntityTable<Visit, "id">;
  changes!: EntityTable<Change, "id">;
  conflicts!: EntityTable<Conflict, "id">;
  meta!: EntityTable<MetaEntry, "key">;

  constructor() {
    super("pvz-organizer");

    this.version(1).stores({
      points: "id, sourceKey, ownerId, status, brand, city, updatedAt, deletedAt",
      owners: "id, name, updatedAt, deletedAt",
      visits: "id, pointId, visitedAt, updatedAt, deletedAt",
      changes: "id, entityName, entityId, syncedAt, updatedAt",
      conflicts: "id, entityName, entityId, resolvedAt, updatedAt"
    });

    this.version(2).stores({
      points: "id, sourceKey, ownerId, status, brand, city, updatedAt, deletedAt",
      owners: "id, name, updatedAt, deletedAt",
      visits: "id, pointId, visitedAt, updatedAt, deletedAt",
      changes: "id, entityName, entityId, syncedAt, updatedAt",
      conflicts: "id, entityName, entityId, resolvedAt, updatedAt",
      meta: "key, updatedAt"
    });
  }
}

export const db = new PvzDatabase();

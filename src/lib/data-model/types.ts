export type SyncEntityName = "point" | "owner" | "visit" | "change" | "conflict";

export interface SyncEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export type PointStatus = "new" | "active" | "closed" | "needs_review";

export interface Point extends SyncEntity {
  sourceKey: string;
  brand: string;
  city: string;
  address: string;
  normalizedCity: string;
  normalizedAddress: string;
  ownerId: string | null;
  status: PointStatus;
  lat: number | null;
  lon: number | null;
  comment: string | null;
}

export interface Owner extends SyncEntity {
  name: string;
  phone: string | null;
  telegram: string | null;
  comment: string | null;
}

export interface Visit extends SyncEntity {
  pointId: string;
  visitedAt: string;
  status: "planned" | "completed" | "skipped";
  comment: string | null;
}

export type ChangeOperation = "create" | "update" | "delete";

export interface Change extends SyncEntity {
  entityName: Exclude<SyncEntityName, "change" | "conflict">;
  entityId: string;
  operation: ChangeOperation;
  baseVersion: number;
  patch: Record<string, unknown>;
  syncedAt: string | null;
}

export interface Conflict extends SyncEntity {
  entityName: Exclude<SyncEntityName, "change" | "conflict">;
  entityId: string;
  field: string;
  localValue: unknown;
  remoteValue: unknown;
  baseVersion: number;
  remoteVersion: number;
  resolvedAt: string | null;
  resolution: "local" | "remote" | "manual" | null;
}

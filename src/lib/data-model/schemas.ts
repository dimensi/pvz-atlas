import { z } from "zod";

const isoDate = z.string().datetime();

export const syncEntitySchema = z.object({
  id: z.string().min(1),
  createdAt: isoDate,
  updatedAt: isoDate,
  deletedAt: isoDate.nullable(),
  version: z.number().int().nonnegative()
});

export const pointStatusSchema = z.enum([
  "new",
  "active",
  "closed",
  "needs_review"
]);

export const pointSchema = syncEntitySchema.extend({
  sourceKey: z.string().min(1),
  brand: z.string().min(1),
  city: z.string().min(1),
  address: z.string().min(1),
  normalizedCity: z.string().min(1),
  normalizedAddress: z.string().min(1),
  ownerId: z.string().nullable(),
  status: pointStatusSchema,
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  comment: z.string().nullable()
});

export const ownerSchema = syncEntitySchema.extend({
  name: z.string().min(1),
  phone: z.string().nullable(),
  telegram: z.string().nullable(),
  comment: z.string().nullable()
});

export const visitSchema = syncEntitySchema.extend({
  pointId: z.string().min(1),
  visitedAt: isoDate,
  status: z.enum(["planned", "completed", "skipped"]),
  comment: z.string().nullable()
});

export const changeSchema = syncEntitySchema.extend({
  entityName: z.enum(["point", "owner", "visit"]),
  entityId: z.string().min(1),
  operation: z.enum(["create", "update", "delete"]),
  baseVersion: z.number().int().nonnegative(),
  patch: z.record(z.string(), z.unknown()),
  syncedAt: isoDate.nullable()
});

export const conflictSchema = syncEntitySchema.extend({
  entityName: z.enum(["point", "owner", "visit"]),
  entityId: z.string().min(1),
  field: z.string().min(1),
  localValue: z.unknown(),
  remoteValue: z.unknown(),
  baseVersion: z.number().int().nonnegative(),
  remoteVersion: z.number().int().nonnegative(),
  resolvedAt: isoDate.nullable(),
  resolution: z.enum(["local", "remote", "manual"]).nullable()
});

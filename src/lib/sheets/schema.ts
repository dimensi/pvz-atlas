import { z } from "zod";
import {
  changeSchema,
  conflictSchema,
  ownerSchema,
  pointSchema,
  visitSchema
} from "@/lib/data-model/schemas";
import type { Change, Conflict, Owner, Point, Visit } from "@/lib/data-model/types";

export const SHEET_NAMES = {
  points: "points",
  owners: "owners",
  visits: "visits",
  changesLog: "changes_log",
  conflicts: "conflicts"
} as const;

export type SheetName = (typeof SHEET_NAMES)[keyof typeof SHEET_NAMES];

export const SHEET_COLUMNS = {
  points: [
    "id",
    "source_key",
    "brand",
    "city",
    "address",
    "normalized_city",
    "normalized_address",
    "owner_id",
    "status",
    "lat",
    "lon",
    "comment",
    "created_at",
    "updated_at",
    "deleted_at",
    "version"
  ],
  owners: [
    "id",
    "name",
    "phone",
    "telegram",
    "comment",
    "created_at",
    "updated_at",
    "deleted_at",
    "version"
  ],
  visits: [
    "id",
    "point_id",
    "visited_at",
    "status",
    "comment",
    "created_at",
    "updated_at",
    "deleted_at",
    "version"
  ],
  changesLog: [
    "id",
    "entity_name",
    "entity_id",
    "operation",
    "base_version",
    "patch",
    "synced_at",
    "created_at",
    "updated_at",
    "deleted_at",
    "version"
  ],
  conflicts: [
    "id",
    "entity_name",
    "entity_id",
    "field",
    "local_value",
    "remote_value",
    "base_version",
    "remote_version",
    "resolved_at",
    "resolution",
    "created_at",
    "updated_at",
    "deleted_at",
    "version"
  ]
} as const;

const cell = z.string();

export const pointSheetRowSchema = z.object({
  id: cell,
  source_key: cell,
  brand: cell,
  city: cell,
  address: cell,
  normalized_city: cell,
  normalized_address: cell,
  owner_id: cell,
  status: cell,
  lat: cell,
  lon: cell,
  comment: cell,
  created_at: cell,
  updated_at: cell,
  deleted_at: cell,
  version: cell
});

export const ownerSheetRowSchema = z.object({
  id: cell,
  name: cell,
  phone: cell,
  telegram: cell,
  comment: cell,
  created_at: cell,
  updated_at: cell,
  deleted_at: cell,
  version: cell
});

export const visitSheetRowSchema = z.object({
  id: cell,
  point_id: cell,
  visited_at: cell,
  status: cell,
  comment: cell,
  created_at: cell,
  updated_at: cell,
  deleted_at: cell,
  version: cell
});

export const changeSheetRowSchema = z.object({
  id: cell,
  entity_name: cell,
  entity_id: cell,
  operation: cell,
  base_version: cell,
  patch: cell,
  synced_at: cell,
  created_at: cell,
  updated_at: cell,
  deleted_at: cell,
  version: cell
});

export const conflictSheetRowSchema = z.object({
  id: cell,
  entity_name: cell,
  entity_id: cell,
  field: cell,
  local_value: cell,
  remote_value: cell,
  base_version: cell,
  remote_version: cell,
  resolved_at: cell,
  resolution: cell,
  created_at: cell,
  updated_at: cell,
  deleted_at: cell,
  version: cell
});

export type PointSheetRow = z.infer<typeof pointSheetRowSchema>;
export type OwnerSheetRow = z.infer<typeof ownerSheetRowSchema>;
export type VisitSheetRow = z.infer<typeof visitSheetRowSchema>;
export type ChangeSheetRow = z.infer<typeof changeSheetRowSchema>;
export type ConflictSheetRow = z.infer<typeof conflictSheetRowSchema>;

export type SheetRow =
  | PointSheetRow
  | OwnerSheetRow
  | VisitSheetRow
  | ChangeSheetRow
  | ConflictSheetRow;

export interface SheetRowDiagnostic {
  sheetName: SheetName;
  rowIndex?: number;
  issues: string[];
}

export type SheetParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; diagnostic: SheetRowDiagnostic };

const nullableCell = (value: string): string | null => (value.trim() === "" ? null : value);

const serializeNullableCell = (value: string | null): string => value ?? "";

const parseIntegerCell = (value: string): number => {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    return Number.NaN;
  }

  return Number(value);
};

const parseNullableNumberCell = (value: string): number | null => {
  if (value.trim() === "") {
    return null;
  }

  return Number(value);
};

const parseJsonCell = (value: string): unknown => {
  if (value.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
};

const toIssues = (error: z.ZodError): string[] =>
  error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return `${path}${issue.message}`;
  });

const invalid = (
  sheetName: SheetName,
  rowIndex: number | undefined,
  error: z.ZodError
): SheetParseResult<never> => ({
  ok: false,
  diagnostic: {
    sheetName,
    rowIndex,
    issues: toIssues(error)
  }
});

const parseRow = <TRow, TModel>(
  sheetName: SheetName,
  rowSchema: z.ZodType<TRow>,
  modelSchema: z.ZodType<TModel>,
  row: unknown,
  convert: (row: TRow) => unknown,
  rowIndex?: number
): SheetParseResult<TModel> => {
  const rowResult = rowSchema.safeParse(row);
  if (!rowResult.success) {
    return invalid(sheetName, rowIndex, rowResult.error);
  }

  const modelResult = modelSchema.safeParse(convert(rowResult.data));
  if (!modelResult.success) {
    return invalid(sheetName, rowIndex, modelResult.error);
  }

  return { ok: true, data: modelResult.data };
};

export const parsePointRow = (row: unknown, rowIndex?: number): SheetParseResult<Point> =>
  parseRow(
    SHEET_NAMES.points,
    pointSheetRowSchema,
    pointSchema,
    row,
    (sheetRow) => ({
      id: sheetRow.id,
      sourceKey: sheetRow.source_key,
      brand: sheetRow.brand,
      city: sheetRow.city,
      address: sheetRow.address,
      normalizedCity: sheetRow.normalized_city,
      normalizedAddress: sheetRow.normalized_address,
      ownerId: nullableCell(sheetRow.owner_id),
      status: sheetRow.status,
      lat: parseNullableNumberCell(sheetRow.lat),
      lon: parseNullableNumberCell(sheetRow.lon),
      comment: nullableCell(sheetRow.comment),
      createdAt: sheetRow.created_at,
      updatedAt: sheetRow.updated_at,
      deletedAt: nullableCell(sheetRow.deleted_at),
      version: parseIntegerCell(sheetRow.version)
    }),
    rowIndex
  );

export const parseOwnerRow = (row: unknown, rowIndex?: number): SheetParseResult<Owner> =>
  parseRow(
    SHEET_NAMES.owners,
    ownerSheetRowSchema,
    ownerSchema,
    row,
    (sheetRow) => ({
      id: sheetRow.id,
      name: sheetRow.name,
      phone: nullableCell(sheetRow.phone),
      telegram: nullableCell(sheetRow.telegram),
      comment: nullableCell(sheetRow.comment),
      createdAt: sheetRow.created_at,
      updatedAt: sheetRow.updated_at,
      deletedAt: nullableCell(sheetRow.deleted_at),
      version: parseIntegerCell(sheetRow.version)
    }),
    rowIndex
  );

export const parseVisitRow = (row: unknown, rowIndex?: number): SheetParseResult<Visit> =>
  parseRow(
    SHEET_NAMES.visits,
    visitSheetRowSchema,
    visitSchema,
    row,
    (sheetRow) => ({
      id: sheetRow.id,
      pointId: sheetRow.point_id,
      visitedAt: sheetRow.visited_at,
      status: sheetRow.status,
      comment: nullableCell(sheetRow.comment),
      createdAt: sheetRow.created_at,
      updatedAt: sheetRow.updated_at,
      deletedAt: nullableCell(sheetRow.deleted_at),
      version: parseIntegerCell(sheetRow.version)
    }),
    rowIndex
  );

export const parseChangeRow = (row: unknown, rowIndex?: number): SheetParseResult<Change> =>
  parseRow(
    SHEET_NAMES.changesLog,
    changeSheetRowSchema,
    changeSchema,
    row,
    (sheetRow) => ({
      id: sheetRow.id,
      entityName: sheetRow.entity_name,
      entityId: sheetRow.entity_id,
      operation: sheetRow.operation,
      baseVersion: parseIntegerCell(sheetRow.base_version),
      patch: parseJsonCell(sheetRow.patch),
      syncedAt: nullableCell(sheetRow.synced_at),
      createdAt: sheetRow.created_at,
      updatedAt: sheetRow.updated_at,
      deletedAt: nullableCell(sheetRow.deleted_at),
      version: parseIntegerCell(sheetRow.version)
    }),
    rowIndex
  );

export const parseConflictRow = (
  row: unknown,
  rowIndex?: number
): SheetParseResult<Conflict> =>
  parseRow(
    SHEET_NAMES.conflicts,
    conflictSheetRowSchema,
    conflictSchema,
    row,
    (sheetRow) => ({
      id: sheetRow.id,
      entityName: sheetRow.entity_name,
      entityId: sheetRow.entity_id,
      field: sheetRow.field,
      localValue: parseJsonCell(sheetRow.local_value),
      remoteValue: parseJsonCell(sheetRow.remote_value),
      baseVersion: parseIntegerCell(sheetRow.base_version),
      remoteVersion: parseIntegerCell(sheetRow.remote_version),
      resolvedAt: nullableCell(sheetRow.resolved_at),
      resolution: nullableCell(sheetRow.resolution),
      createdAt: sheetRow.created_at,
      updatedAt: sheetRow.updated_at,
      deletedAt: nullableCell(sheetRow.deleted_at),
      version: parseIntegerCell(sheetRow.version)
    }),
    rowIndex
  );

export const serializePointRow = (point: Point): PointSheetRow => {
  const data = pointSchema.parse(point);

  return {
    id: data.id,
    source_key: data.sourceKey,
    brand: data.brand,
    city: data.city,
    address: data.address,
    normalized_city: data.normalizedCity,
    normalized_address: data.normalizedAddress,
    owner_id: serializeNullableCell(data.ownerId),
    status: data.status,
    lat: data.lat?.toString() ?? "",
    lon: data.lon?.toString() ?? "",
    comment: serializeNullableCell(data.comment),
    created_at: data.createdAt,
    updated_at: data.updatedAt,
    deleted_at: serializeNullableCell(data.deletedAt),
    version: data.version.toString()
  };
};

export const serializeOwnerRow = (owner: Owner): OwnerSheetRow => {
  const data = ownerSchema.parse(owner);

  return {
    id: data.id,
    name: data.name,
    phone: serializeNullableCell(data.phone),
    telegram: serializeNullableCell(data.telegram),
    comment: serializeNullableCell(data.comment),
    created_at: data.createdAt,
    updated_at: data.updatedAt,
    deleted_at: serializeNullableCell(data.deletedAt),
    version: data.version.toString()
  };
};

export const serializeVisitRow = (visit: Visit): VisitSheetRow => {
  const data = visitSchema.parse(visit);

  return {
    id: data.id,
    point_id: data.pointId,
    visited_at: data.visitedAt,
    status: data.status,
    comment: serializeNullableCell(data.comment),
    created_at: data.createdAt,
    updated_at: data.updatedAt,
    deleted_at: serializeNullableCell(data.deletedAt),
    version: data.version.toString()
  };
};

export const serializeChangeRow = (change: Change): ChangeSheetRow => {
  const data = changeSchema.parse(change);

  return {
    id: data.id,
    entity_name: data.entityName,
    entity_id: data.entityId,
    operation: data.operation,
    base_version: data.baseVersion.toString(),
    patch: JSON.stringify(data.patch),
    synced_at: serializeNullableCell(data.syncedAt),
    created_at: data.createdAt,
    updated_at: data.updatedAt,
    deleted_at: serializeNullableCell(data.deletedAt),
    version: data.version.toString()
  };
};

export const serializeConflictRow = (conflict: Conflict): ConflictSheetRow => {
  const data = conflictSchema.parse(conflict);

  return {
    id: data.id,
    entity_name: data.entityName,
    entity_id: data.entityId,
    field: data.field,
    local_value: JSON.stringify(data.localValue),
    remote_value: JSON.stringify(data.remoteValue),
    base_version: data.baseVersion.toString(),
    remote_version: data.remoteVersion.toString(),
    resolved_at: serializeNullableCell(data.resolvedAt),
    resolution: serializeNullableCell(data.resolution),
    created_at: data.createdAt,
    updated_at: data.updatedAt,
    deleted_at: serializeNullableCell(data.deletedAt),
    version: data.version.toString()
  };
};

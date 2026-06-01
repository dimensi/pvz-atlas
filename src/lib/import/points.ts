import { z } from "zod";
import { pointSchema } from "@/lib/data-model/schemas";
import type { Point } from "@/lib/data-model/types";
import {
  createPointSourceKey,
  normalizeAddressPart,
  normalizeText
} from "@/lib/data-model/source-key";

export type ImportMode = "preview" | "apply";

export interface ImportPointRow {
  rowIndex?: number;
  brand: string;
  city: string;
  address: string;
  lat?: number | string | null;
  lon?: number | string | null;
  comment?: string | null;
}

export interface NormalizedImportPoint {
  rowIndex: number;
  brand: string;
  city: string;
  address: string;
  normalizedBrand: string;
  normalizedCity: string;
  normalizedAddress: string;
  sourceKey: string;
  lat: number | null;
  lon: number | null;
  comment: string | null;
}

export interface ImportInvalidItem {
  rowIndex: number;
  issues: string[];
  raw?: unknown;
}

export interface ImportNewItem {
  rowIndex: number;
  sourceKey: string;
  point: Point;
}

export interface ImportUpdateItem {
  rowIndex: number;
  sourceKey: string;
  existingId: string;
  patch: Partial<Pick<Point, "sourceKey" | "brand" | "city" | "address" | "normalizedCity" | "normalizedAddress" | "lat" | "lon">>;
  point: Point;
}

export interface ImportDuplicateItem {
  rowIndex: number;
  sourceKey: string;
  reason: "incoming_duplicate" | "existing_duplicate";
  existingId?: string;
  duplicateOfRowIndex?: number;
}

export interface ImportPreviewResult {
  new: ImportNewItem[];
  update: ImportUpdateItem[];
  duplicate: ImportDuplicateItem[];
  invalid: ImportInvalidItem[];
  warnings: string[];
}

export interface ImportPreviewOptions {
  clock: () => string;
  idFactory: () => string;
  geocode?: GeocodePoint;
}

export interface GeocodeRequest {
  brand: string;
  city: string;
  address: string;
  sourceKey: string;
  rowIndex: number;
}

export interface GeocodeResult {
  lat: number;
  lon: number;
}

export type GeocodePoint = (request: GeocodeRequest) => Promise<GeocodeResult | null>;

const importRowSchema = z.object({
  rowIndex: z.number().int().positive().optional(),
  brand: z.string().trim().min(1),
  city: z.string().trim().min(1),
  address: z.string().trim().min(1),
  lat: z.union([z.number(), z.string(), z.null()]).optional(),
  lon: z.union([z.number(), z.string(), z.null()]).optional(),
  comment: z.union([z.string(), z.null()]).optional()
});

const headerAliases: Record<string, keyof ImportPointRow> = {
  brand: "brand",
  "бренд": "brand",
  city: "city",
  "город": "city",
  address: "address",
  "адрес": "address",
  lat: "lat",
  latitude: "lat",
  "широта": "lat",
  lon: "lon",
  lng: "lon",
  longitude: "lon",
  "долгота": "lon",
  comment: "comment",
  "комментарий": "comment",
  note: "comment",
  notes: "comment"
};

function parseCoordinate(value: number | string | null | undefined, kind: "lat" | "lon"): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = typeof value === "number" ? value : Number(value.replace(",", "."));
  const min = kind === "lat" ? -90 : -180;
  const max = kind === "lat" ? 90 : 180;

  if (!Number.isFinite(numberValue) || numberValue < min || numberValue > max) {
    return Number.NaN;
  }

  return numberValue;
}

function zodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return `${path}${issue.message}`;
  });
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];

    if (character === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      quoted = !quoted;
      continue;
    }

    if (character === "," && !quoted) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current.trim());
  return values;
}

function normalizeHeader(header: string): keyof ImportPointRow | null {
  return headerAliases[normalizeText(header)] ?? null;
}

export function parseCsvImportPoints(csv: string): { rows: ImportPointRow[]; invalid: ImportInvalidItem[] } {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    return {
      rows: [],
      invalid: [{ rowIndex: 1, issues: ["CSV is empty."] }]
    };
  }

  const headers = splitCsvLine(lines[0]).map(normalizeHeader);
  const requiredHeaders: Array<keyof ImportPointRow> = ["brand", "city", "address"];
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));

  if (missingHeaders.length > 0) {
    return {
      rows: [],
      invalid: [
        {
          rowIndex: 1,
          issues: [`Missing required columns: ${missingHeaders.join(", ")}.`]
        }
      ]
    };
  }

  const rows: ImportPointRow[] = [];
  const invalid: ImportInvalidItem[] = [];

  lines.slice(1).forEach((line, index) => {
    const rowIndex = index + 2;
    const values = splitCsvLine(line);
    const row: Partial<Record<keyof ImportPointRow, string>> = {};

    headers.forEach((header, headerIndex) => {
      if (header) {
        row[header] = values[headerIndex] ?? "";
      }
    });

    const parsed = importRowSchema.safeParse(row);
    if (!parsed.success) {
      invalid.push({ rowIndex, issues: zodIssues(parsed.error), raw: row });
      return;
    }

    rows.push({ ...parsed.data, rowIndex });
  });

  return { rows, invalid };
}

export function parseJsonImportPoints(input: unknown): { rows: ImportPointRow[]; invalid: ImportInvalidItem[] } {
  const rowsInput = Array.isArray(input)
    ? input
    : typeof input === "object" && input !== null && Array.isArray((input as { points?: unknown }).points)
      ? (input as { points: unknown[] }).points
      : null;

  if (!rowsInput) {
    return {
      rows: [],
      invalid: [{ rowIndex: 1, issues: ["JSON import must be an array or an object with a points array."] }]
    };
  }

  const rows: ImportPointRow[] = [];
  const invalid: ImportInvalidItem[] = [];

  rowsInput.forEach((row, index) => {
    const rowIndex = index + 1;
    const parsed = importRowSchema.safeParse(row);

    if (!parsed.success) {
      invalid.push({ rowIndex, issues: zodIssues(parsed.error), raw: row });
      return;
    }

    rows.push({ ...parsed.data, rowIndex });
  });

  return { rows, invalid };
}

export function normalizeImportPoint(row: ImportPointRow, rowIndex: number): NormalizedImportPoint | ImportInvalidItem {
  const parsed = importRowSchema.safeParse(row);
  if (!parsed.success) {
    return { rowIndex, issues: zodIssues(parsed.error), raw: row };
  }

  const lat = parseCoordinate(parsed.data.lat, "lat");
  const lon = parseCoordinate(parsed.data.lon, "lon");

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return {
      rowIndex,
      issues: ["Coordinates must be valid latitude/longitude numbers."],
      raw: row
    };
  }

  if ((lat === null) !== (lon === null)) {
    return {
      rowIndex,
      issues: ["lat and lon must be provided together."],
      raw: row
    };
  }

  const brand = parsed.data.brand.trim();
  const city = parsed.data.city.trim();
  const address = parsed.data.address.trim();

  return {
    rowIndex,
    brand,
    city,
    address,
    normalizedBrand: normalizeText(brand),
    normalizedCity: normalizeAddressPart(city),
    normalizedAddress: normalizeAddressPart(address),
    sourceKey: createPointSourceKey({ brand, city, address }),
    lat,
    lon,
    comment: parsed.data.comment?.trim() || null
  };
}

function hasCoordinates(point: Pick<Point, "lat" | "lon">): boolean {
  return point.lat !== null && point.lon !== null;
}

function findExistingPoint(point: NormalizedImportPoint, existingPoints: Point[]): Point | undefined {
  return existingPoints.find(
    (existing) =>
      existing.sourceKey === point.sourceKey ||
      (normalizeText(existing.brand) === point.normalizedBrand &&
        existing.normalizedCity === point.normalizedCity &&
        existing.normalizedAddress === point.normalizedAddress)
  );
}

async function coordinatesForImportPoint(
  point: NormalizedImportPoint,
  existing: Point | undefined,
  geocode: GeocodePoint | undefined,
  warnings: string[]
): Promise<Pick<Point, "lat" | "lon">> {
  if (hasCoordinates(point)) {
    return { lat: point.lat, lon: point.lon };
  }

  if (existing && hasCoordinates(existing)) {
    return { lat: existing.lat, lon: existing.lon };
  }

  if (!geocode) {
    warnings.push(`Row ${point.rowIndex}: coordinates are missing and no server geocoder is configured.`);
    return { lat: null, lon: null };
  }

  const result = await geocode({
    brand: point.brand,
    city: point.city,
    address: point.address,
    sourceKey: point.sourceKey,
    rowIndex: point.rowIndex
  });

  if (!result) {
    warnings.push(`Row ${point.rowIndex}: coordinates are missing and geocoding returned no result.`);
    return { lat: null, lon: null };
  }

  return result;
}

function buildNewPoint(point: NormalizedImportPoint, coordinates: Pick<Point, "lat" | "lon">, now: string, id: string): Point {
  return pointSchema.parse({
    id,
    sourceKey: point.sourceKey,
    brand: point.brand,
    city: point.city,
    address: point.address,
    normalizedCity: point.normalizedCity,
    normalizedAddress: point.normalizedAddress,
    ownerId: null,
    status: "new",
    lat: coordinates.lat,
    lon: coordinates.lon,
    comment: point.comment,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1
  });
}

function buildSafeUpdate(
  existing: Point,
  imported: NormalizedImportPoint,
  coordinates: Pick<Point, "lat" | "lon">
): ImportUpdateItem["patch"] {
  const patch: ImportUpdateItem["patch"] = {};
  const nextLat = existing.lat === null ? coordinates.lat : existing.lat;
  const nextLon = existing.lon === null ? coordinates.lon : existing.lon;

  if (existing.sourceKey !== imported.sourceKey) {
    patch.sourceKey = imported.sourceKey;
  }

  if (existing.brand !== imported.brand) {
    patch.brand = imported.brand;
  }

  if (existing.city !== imported.city) {
    patch.city = imported.city;
  }

  if (existing.address !== imported.address) {
    patch.address = imported.address;
  }

  if (existing.normalizedCity !== imported.normalizedCity) {
    patch.normalizedCity = imported.normalizedCity;
  }

  if (existing.normalizedAddress !== imported.normalizedAddress) {
    patch.normalizedAddress = imported.normalizedAddress;
  }

  if (existing.lat !== nextLat) {
    patch.lat = nextLat;
  }

  if (existing.lon !== nextLon) {
    patch.lon = nextLon;
  }
  return patch;
}

function applyPointPatch(existing: Point, patch: ImportUpdateItem["patch"], now: string): Point {
  return pointSchema.parse({
    ...existing,
    ...patch,
    updatedAt: now,
    version: existing.version + 1
  });
}

export async function buildImportPreview(
  rows: ImportPointRow[],
  existingPoints: Point[],
  options: ImportPreviewOptions
): Promise<ImportPreviewResult> {
  const result: ImportPreviewResult = {
    new: [],
    update: [],
    duplicate: [],
    invalid: [],
    warnings: []
  };
  const firstRowBySourceKey = new Map<string, number>();
  const now = options.clock();

  for (const [index, row] of rows.entries()) {
    const rowIndex = row.rowIndex ?? index + 1;
    const normalized = normalizeImportPoint(row, rowIndex);

    if ("issues" in normalized) {
      result.invalid.push(normalized);
      continue;
    }

    const firstRowIndex = firstRowBySourceKey.get(normalized.sourceKey);
    if (firstRowIndex) {
      result.duplicate.push({
        rowIndex: normalized.rowIndex,
        sourceKey: normalized.sourceKey,
        reason: "incoming_duplicate",
        duplicateOfRowIndex: firstRowIndex
      });
      continue;
    }
    firstRowBySourceKey.set(normalized.sourceKey, normalized.rowIndex);

    const existing = findExistingPoint(normalized, existingPoints);
    const coordinates = await coordinatesForImportPoint(
      normalized,
      existing,
      options.geocode,
      result.warnings
    );

    if (!existing) {
      result.new.push({
        rowIndex: normalized.rowIndex,
        sourceKey: normalized.sourceKey,
        point: buildNewPoint(normalized, coordinates, now, options.idFactory())
      });
      continue;
    }

    const patch = buildSafeUpdate(existing, normalized, coordinates);
    if (Object.keys(patch).length === 0) {
      result.duplicate.push({
        rowIndex: normalized.rowIndex,
        sourceKey: normalized.sourceKey,
        reason: "existing_duplicate",
        existingId: existing.id
      });
      continue;
    }

    result.update.push({
      rowIndex: normalized.rowIndex,
      sourceKey: normalized.sourceKey,
      existingId: existing.id,
      patch,
      point: applyPointPatch(existing, patch, now)
    });
  }

  return result;
}

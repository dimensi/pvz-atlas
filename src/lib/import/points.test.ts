import { describe, expect, it } from "vitest";
import type { Point } from "@/lib/data-model/types";
import {
  ImportValidationError,
  MAX_IMPORT_POINT_ROWS,
  assertImportPointRowCount,
  buildImportPreview,
  normalizeImportPoint,
  parseCsvImportPoints,
  parseJsonImportPoints
} from "./points";

const now = "2026-01-02T03:04:05.000Z";

const existingPoint = (overrides: Partial<Point> = {}): Point => ({
  id: "point-1",
  sourceKey: "ozon|moscow|main street 10",
  brand: "Ozon",
  city: "Moscow",
  address: "Main Street 10",
  normalizedCity: "moscow",
  normalizedAddress: "main street 10",
  ownerId: "owner-1",
  status: "active",
  lat: null,
  lon: null,
  comment: "field note",
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  version: 3,
  ...overrides
});

const options = {
  clock: () => "2026-01-03T00:00:00.000Z",
  idFactory: () => "new-point-1"
};

describe("point import pipeline", () => {
  it("parses JSON arrays and CSV with quoted fields", () => {
    const json = parseJsonImportPoints([
      { brand: "Ozon", city: "Moscow", address: "Main Street 10" }
    ]);
    const csv = parseCsvImportPoints(
      'brand,city,address,comment\n"Ozon","Moscow","Main, Street 10","near ""metro"""'
    );

    expect(json.invalid).toEqual([]);
    expect(json.rows[0]).toMatchObject({ rowIndex: 1, brand: "Ozon" });
    expect(csv.invalid).toEqual([]);
    expect(csv.rows[0]).toMatchObject({
      rowIndex: 2,
      address: "Main, Street 10",
      comment: 'near "metro"'
    });
  });

  it("normalizes source keys across punctuation and whitespace", () => {
    const first = normalizeImportPoint(
      { brand: " Ozon ", city: " Moscow ", address: "Main,   Street 10." },
      1
    );
    const second = normalizeImportPoint(
      { brand: "ozon", city: "Moscow", address: "Main Street 10" },
      2
    );

    expect("sourceKey" in first && first.sourceKey).toBe("ozon|moscow|main street 10");
    expect("sourceKey" in second && second.sourceKey).toBe("ozon|moscow|main street 10");
  });

  it("deduplicates repeated incoming rows by source key", async () => {
    const preview = await buildImportPreview(
      [
        { brand: "Ozon", city: "Moscow", address: "Main Street 10" },
        { brand: "ozon", city: "Moscow", address: "Main, Street 10" }
      ],
      [],
      options
    );

    expect(preview.new).toHaveLength(1);
    expect(preview.duplicate).toEqual([
      expect.objectContaining({
        rowIndex: 2,
        reason: "incoming_duplicate",
        duplicateOfRowIndex: 1
      })
    ]);
  });

  it("marks existing unchanged points as duplicates", async () => {
    const preview = await buildImportPreview(
      [{ brand: "Ozon", city: "Moscow", address: "Main Street 10" }],
      [existingPoint({ lat: 55.75, lon: 37.61 })],
      options
    );

    expect(preview.new).toEqual([]);
    expect(preview.update).toEqual([]);
    expect(preview.duplicate[0]).toMatchObject({
      reason: "existing_duplicate",
      existingId: "point-1"
    });
  });

  it("fills missing coordinates without overwriting field-work data", async () => {
    const preview = await buildImportPreview(
      [{ brand: "Ozon", city: "Moscow", address: "Main Street 10", lat: 55.75, lon: 37.61 }],
      [existingPoint()],
      options
    );

    expect(preview.update).toHaveLength(1);
    expect(preview.update[0].patch).toEqual({ lat: 55.75, lon: 37.61 });
    expect(preview.update[0].point).toMatchObject({
      ownerId: "owner-1",
      status: "active",
      comment: "field note",
      lat: 55.75,
      lon: 37.61,
      version: 4
    });
  });

  it("leaves missing coordinates empty and reports a map visibility warning", async () => {
    const preview = await buildImportPreview(
      [{ brand: "Ozon", city: "Moscow", address: "Main Street 10" }],
      [],
      options
    );

    expect(preview.new[0].point).toMatchObject({ lat: null, lon: null });
    expect(preview.warnings).toEqual([
      "Row 1: coordinates are missing; point will not appear on the map."
    ]);
  });

  it("rejects empty and oversized imports before preview work", () => {
    expect(() => assertImportPointRowCount([], [])).toThrow(ImportValidationError);

    const rows = Array.from({ length: MAX_IMPORT_POINT_ROWS + 1 }, (_, index) => ({
      rowIndex: index + 1,
      brand: "Ozon",
      city: "Moscow",
      address: `Main Street ${index + 1}`
    }));

    expect(() => assertImportPointRowCount(rows, [])).toThrow(
      `Import is limited to ${MAX_IMPORT_POINT_ROWS} point rows.`
    );
  });
});

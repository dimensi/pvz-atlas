import { describe, expect, it } from "vitest";
import type { Change, Conflict, Owner, Point, Visit } from "@/lib/data-model/types";
import {
  parseChangeRow,
  parseConflictRow,
  parseOwnerRow,
  parsePointRow,
  parseVisitRow,
  serializeChangeRow,
  serializeConflictRow,
  serializeOwnerRow,
  serializePointRow,
  serializeVisitRow,
  SHEET_COLUMNS
} from "./schema";

const now = "2026-01-02T03:04:05.000Z";

const point: Point = {
  id: "point-1",
  sourceKey: "ozon|moscow|main-1",
  brand: "Ozon",
  city: "Moscow",
  address: "Main 1",
  normalizedCity: "moscow",
  normalizedAddress: "main 1",
  ownerId: null,
  status: "active",
  lat: 55.751244,
  lon: 37.618423,
  comment: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  version: 3
};

const owner: Owner = {
  id: "owner-1",
  name: "Owner",
  phone: null,
  telegram: "@owner",
  comment: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  version: 1
};

const visit: Visit = {
  id: "visit-1",
  pointId: "point-1",
  visitedAt: now,
  status: "completed",
  comment: "Checked",
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  version: 2
};

const change: Change = {
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
  version: 1
};

const conflict: Conflict = {
  id: "conflict-1",
  entityName: "point",
  entityId: "point-1",
  field: "ownerId",
  localValue: "owner-1",
  remoteValue: "owner-2",
  baseVersion: 3,
  remoteVersion: 4,
  resolvedAt: null,
  resolution: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  version: 1
};

describe("Sheets schema", () => {
  it("defines expected sheet columns", () => {
    expect(SHEET_COLUMNS.points).toContain("source_key");
    expect(SHEET_COLUMNS.owners).toContain("telegram");
    expect(SHEET_COLUMNS.visits).toContain("point_id");
    expect(SHEET_COLUMNS.changesLog).toContain("base_version");
    expect(SHEET_COLUMNS.changesLog).toContain("client_id");
    expect(SHEET_COLUMNS.conflicts).toContain("remote_version");
  });

  it("serializes and parses point rows", () => {
    const row = serializePointRow(point);

    expect(row.source_key).toBe(point.sourceKey);
    expect(row.owner_id).toBe("");
    expect(row.version).toBe("3");

    const parsed = parsePointRow(row);

    expect(parsed).toEqual({ ok: true, data: point });
  });

  it("serializes and parses owner rows", () => {
    const row = serializeOwnerRow(owner);

    expect(row.phone).toBe("");
    expect(row.telegram).toBe("@owner");

    const parsed = parseOwnerRow(row);

    expect(parsed).toEqual({ ok: true, data: owner });
  });

  it("serializes and parses visit rows", () => {
    const row = serializeVisitRow(visit);

    expect(row.point_id).toBe(visit.pointId);
    expect(row.status).toBe("completed");

    const parsed = parseVisitRow(row);

    expect(parsed).toEqual({ ok: true, data: visit });
  });

  it("serializes and parses change rows with JSON patches", () => {
    const row = serializeChangeRow(change);

    expect(row.patch).toBe(JSON.stringify(change.patch));
    expect(row.base_version).toBe("3");
    expect(row.client_id).toBe("client-1");

    const parsed = parseChangeRow(row);

    expect(parsed).toEqual({ ok: true, data: change });
  });

  it("serializes and parses conflict rows with JSON values", () => {
    const row = serializeConflictRow(conflict);

    expect(row.local_value).toBe(JSON.stringify(conflict.localValue));
    expect(row.remote_version).toBe("4");

    const parsed = parseConflictRow(row);

    expect(parsed).toEqual({ ok: true, data: conflict });
  });

  it("reports missing required sheet fields", () => {
    const row: Partial<ReturnType<typeof serializePointRow>> = serializePointRow(point);
    delete row.id;

    const parsed = parsePointRow(row, 12);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.diagnostic.sheetName).toBe("points");
      expect(parsed.diagnostic.rowIndex).toBe(12);
      expect(parsed.diagnostic.issues.join(" ")).toContain("id");
    }
  });

  it("reports invalid versions without throwing", () => {
    const row = { ...serializeOwnerRow(owner), version: "1.5" };

    const parsed = parseOwnerRow(row);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.diagnostic.sheetName).toBe("owners");
      expect(parsed.diagnostic.issues.join(" ")).toContain("version");
    }
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sheets/cache", () => ({ invalidateSheetsSnapshot: vi.fn() }));
vi.mock("@/lib/sheets/adapter", () => ({
  readSheetsSnapshot: vi.fn(),
  writeSheetsChanges: vi.fn()
}));
vi.mock("@/lib/sheets/google-client", () => ({
  createGoogleSheetsValuesClient: vi.fn(),
  GoogleSheetsConfigError: class GoogleSheetsConfigError extends Error {}
}));
vi.mock("@/lib/sheets/source-id", () => ({
  getConfiguredSheetSourceId: vi.fn(() => "server-source-id")
}));

import {
  readSheetsSnapshot,
  writeSheetsChanges,
  type SheetsSnapshot
} from "@/lib/sheets/adapter";
import {
  createGoogleSheetsValuesClient,
  type GoogleSheetsValuesClient
} from "@/lib/sheets/google-client";
import { POST } from "./route";

function pushRequest(sourceId: string): Request {
  return new Request("https://pvz.test/api/sync/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: "client-1", sourceId, changes: [] })
  });
}

describe("POST /api/sync/push source binding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a different spreadsheet before creating a Sheets client or reading data", async () => {
    const response = await POST(pushRequest("cached-source-id"));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "sync_source_mismatch" }
    });
    expect(createGoogleSheetsValuesClient).not.toHaveBeenCalled();
    expect(readSheetsSnapshot).not.toHaveBeenCalled();
    expect(writeSheetsChanges).not.toHaveBeenCalled();
  });

  it("rejects a queued edit bound to another spreadsheet before any Sheets access", async () => {
    const time = "2026-01-02T03:04:05.000Z";
    const request = new Request("https://pvz.test/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: "client-1",
        sourceId: "server-source-id",
        changes: [{
          id: "change-one", entityName: "point", entityId: "point-one",
          operation: "update", baseVersion: 1, clientId: "client-1",
          sourceId: "old-source-id", baseValues: { comment: null },
          patch: { comment: "locally edited" }, syncedAt: null,
          createdAt: time, updatedAt: time, deletedAt: null, version: 1
        }]
      })
    });

    const response = await POST(request);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "sync_change_source_mismatch" }
    });
    expect(createGoogleSheetsValuesClient).not.toHaveBeenCalled();
    expect(readSheetsSnapshot).not.toHaveBeenCalled();
    expect(writeSheetsChanges).not.toHaveBeenCalled();
  });

  it("reads a fresh snapshot and echoes the source ID after a successful push", async () => {
    const sheetsClient: GoogleSheetsValuesClient = {
      batchGet: vi.fn().mockResolvedValue({}),
      batchUpdate: vi.fn().mockResolvedValue(undefined),
      append: vi.fn().mockResolvedValue(undefined)
    };
    const sheetsSnapshot: SheetsSnapshot = {
      points: [],
      owners: [],
      visits: [],
      changesLog: [],
      conflicts: [],
      diagnostics: [],
      rowNumbers: {
        points: new Map(),
        owners: new Map(),
        visits: new Map(),
        conflicts: new Map()
      }
    };
    vi.mocked(createGoogleSheetsValuesClient).mockResolvedValue(sheetsClient);
    vi.mocked(readSheetsSnapshot).mockResolvedValue(sheetsSnapshot);

    const response = await POST(pushRequest("server-source-id"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      sourceId: "server-source-id",
      applied: [],
      rejected: []
    });
    expect(readSheetsSnapshot).toHaveBeenCalledWith(sheetsClient);
    expect(writeSheetsChanges).toHaveBeenCalledWith(sheetsSnapshot, expect.any(Object), sheetsClient);
  });
});

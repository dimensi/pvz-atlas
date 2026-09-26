import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sheets/cache", () => ({
  getSheetsSnapshot: vi.fn(async () => ({
    points: [
      {
        id: "point-1",
        sourceKey: "ozon|moscow|main-1",
        brand: "Ozon",
        city: "Moscow",
        address: "Main 1",
        normalizedCity: "moscow",
        normalizedAddress: "main 1",
        ownerId: null,
        status: "new",
        lat: null,
        lon: null,
        comment: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        deletedAt: null,
        version: 1
      }
    ],
    owners: [],
    visits: [],
    conflicts: [],
    diagnostics: []
  }))
}));
vi.mock("@/lib/sheets/google-client", () => ({
  GoogleSheetsConfigError: class GoogleSheetsConfigError extends Error {}
}));
vi.mock("@/lib/sheets/source-id", () => ({
  getConfiguredSheetSourceId: vi.fn(() => "server-source-id")
}));

import { GET } from "./route";

describe("GET /api/sync/pull", () => {
  it("returns a full snapshot with its source ID even when since is supplied", async () => {
    const response = await GET(
      new Request("https://pvz.test/api/sync/pull?since=2026-06-01T00%3A00%3A00.000Z")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      sourceId: "server-source-id",
      points: [expect.objectContaining({ id: "point-1" })],
      owners: [],
      visits: []
    });
  });
});

import { describe, expect, it } from "vitest";
import { createSheetSourceId } from "./source-id-core";

describe("Google Sheets source ID", () => {
  it("creates a stable fingerprint without exposing the spreadsheet ID", () => {
    const spreadsheetId = "test-sheet-id-for-source-fingerprint";
    const first = createSheetSourceId(spreadsheetId);

    expect(createSheetSourceId(spreadsheetId)).toBe(first);
    expect(createSheetSourceId("another-test-sheet-id")).not.toBe(first);
    expect(first).toMatch(/^sheets-v1_[a-f0-9]{64}$/);
    expect(first).not.toContain(spreadsheetId);
  });

  it("trims the spreadsheet ID before hashing", () => {
    expect(createSheetSourceId("  test-sheet-id  ")).toBe(createSheetSourceId("test-sheet-id"));
  });

  it("rejects an empty spreadsheet ID", () => {
    expect(() => createSheetSourceId("   ")).toThrow("spreadsheet ID is required");
  });
});

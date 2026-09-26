import { describe, expect, it } from "vitest";
import { changedCellUpdates, columnLetter } from "./write-diff";

describe("Google Sheets cell updates", () => {
  it("targets only changed cells and groups adjacent changes", () => {
    expect(
      changedCellUpdates("points", 12, ["id", "old-brand", "old-city", "same", "3"], [
        "id",
        "new-brand",
        "new-city",
        "same",
        "4"
      ])
    ).toEqual([
      { range: "points!B12:C12", values: [["new-brand", "new-city"]] },
      { range: "points!E12:E12", values: [["4"]] }
    ]);
  });

  it("converts one-based column indexes to Sheets letters", () => {
    expect(columnLetter(1)).toBe("A");
    expect(columnLetter(26)).toBe("Z");
    expect(columnLetter(27)).toBe("AA");
  });
});

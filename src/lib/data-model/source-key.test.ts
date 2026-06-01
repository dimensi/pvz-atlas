import { describe, expect, it } from "vitest";
import { createPointSourceKey, normalizeAddressPart } from "./source-key";

describe("source key helpers", () => {
  it("normalizes repeated whitespace and punctuation", () => {
    expect(normalizeAddressPart("  Main,   Street  10. ")).toBe("main street 10");
  });

  it("creates stable keys for equivalent point addresses", () => {
    const first = createPointSourceKey({
      brand: "Ozon",
      city: " Moscow ",
      address: "Main, Street 10"
    });
    const second = createPointSourceKey({
      brand: "ozon",
      city: "Moscow",
      address: "Main Street 10"
    });

    expect(first).toBe(second);
  });
});

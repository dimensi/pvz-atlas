import { describe, expect, it } from "vitest";
import {
  brandMatchesFilter,
  canonicalizeBrand,
  createBrandFilterOptions,
  getBrandLabel
} from "./brands";

describe("brand helpers", () => {
  it("canonicalizes known brand labels and aliases", () => {
    expect(canonicalizeBrand("Ozon")).toBe("ozon");
    expect(canonicalizeBrand("WB")).toBe("wildberries");
    expect(canonicalizeBrand("Яндекс Маркет")).toBe("yandex_market");
    expect(canonicalizeBrand("СДЭК")).toBe("cdek");
    expect(canonicalizeBrand("5Post")).toBe("fivepost");
  });

  it("keeps unknown legacy brands displayable", () => {
    expect(canonicalizeBrand("Boxberry")).toBeNull();
    expect(getBrandLabel("Boxberry")).toBe("Boxberry");
  });

  it("matches legacy labels against canonical filters", () => {
    expect(brandMatchesFilter("Ozon", "ozon")).toBe(true);
    expect(brandMatchesFilter("WB", "wildberries")).toBe(true);
    expect(brandMatchesFilter("Boxberry", "Boxberry")).toBe(true);
    expect(brandMatchesFilter("Boxberry", "ozon")).toBe(false);
  });

  it("deduplicates filter options by canonical id", () => {
    expect(createBrandFilterOptions(["Ozon", "ozon", "Boxberry"])).toEqual([
      { value: "Boxberry", label: "Boxberry" },
      { value: "ozon", label: "Ozon" }
    ]);
  });
});

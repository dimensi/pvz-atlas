export const BRAND_OPTIONS = [
  { id: "ozon", label: "Ozon" },
  { id: "wildberries", label: "Wildberries" },
  { id: "yandex_market", label: "Яндекс Маркет" },
  { id: "cdek", label: "СДЭК" },
  { id: "fivepost", label: "5Post" },
  { id: "other", label: "Другое" }
] as const;

export type BrandId = (typeof BRAND_OPTIONS)[number]["id"];

const BRAND_BY_ID = new Map(BRAND_OPTIONS.map((brand) => [brand.id, brand]));

const BRAND_ALIASES: Record<string, BrandId> = {
  "5 post": "fivepost",
  "5-post": "fivepost",
  "5post": "fivepost",
  fivepost: "fivepost",
  cdek: "cdek",
  "сдек": "cdek",
  "сдэк": "cdek",
  ozon: "ozon",
  wb: "wildberries",
  wildberries: "wildberries",
  "wild berries": "wildberries",
  "яндекс маркет": "yandex_market",
  "яндекс.маркет": "yandex_market",
  "яндекс-market": "yandex_market",
  "yandex market": "yandex_market",
  yandex_market: "yandex_market",
  other: "other",
  "другое": "other"
};

function normalizeBrand(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/[_\s]+/g, " ");
}

export function canonicalizeBrand(value: string | null | undefined): BrandId | null {
  const normalized = normalizeBrand(value ?? "");
  if (!normalized) {
    return null;
  }

  return BRAND_ALIASES[normalized] ?? null;
}

export function getBrandLabel(value: string | null | undefined): string {
  const canonical = canonicalizeBrand(value);
  if (canonical) {
    return BRAND_BY_ID.get(canonical)?.label ?? value ?? "";
  }

  return (value ?? "").trim();
}

export function getBrandPillClassName(value: string | null | undefined): string {
  return `brand-pill brand-pill-${canonicalizeBrand(value) ?? "other"}`;
}

export function getStoredBrand(value: BrandId): string {
  return value;
}

export function brandMatchesFilter(brand: string, filter: string): boolean {
  if (!filter) {
    return true;
  }

  const brandCanonical = canonicalizeBrand(brand);
  const filterCanonical = canonicalizeBrand(filter);

  if (brandCanonical && filterCanonical) {
    return brandCanonical === filterCanonical;
  }

  return normalizeBrand(brand) === normalizeBrand(filter);
}

export function sortBrandValues(left: string, right: string): number {
  return getBrandLabel(left).localeCompare(getBrandLabel(right), "ru-RU", {
    sensitivity: "base"
  });
}

export function createBrandFilterOptions(values: string[]): Array<{ value: string; label: string }> {
  const byValue = new Map<string, string>();

  for (const value of values) {
    const canonical = canonicalizeBrand(value);
    const optionValue = canonical ?? value;
    const label = canonical ? getBrandLabel(canonical) : getBrandLabel(value);
    if (optionValue) {
      byValue.set(optionValue, label);
    }
  }

  return [...byValue.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => sortBrandValues(left.label, right.label));
}

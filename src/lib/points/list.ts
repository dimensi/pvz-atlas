import type { Owner, Point, PointStatus } from "@/lib/data-model/types";
import { brandMatchesFilter, createBrandFilterOptions, sortBrandValues } from "@/lib/brands";

export const POINT_STATUS_LABELS: Record<PointStatus, string> = {
  new: "Новый",
  active: "Активный",
  closed: "Закрыт",
  needs_review: "Проверить"
};

/** Статусы, доступные оператору в UI (closed временно скрыт). */
export const EDITABLE_POINT_STATUSES = [
  "new",
  "active",
  "needs_review"
  // "closed",
] as const satisfies readonly PointStatus[];

export type EditablePointStatus = (typeof EDITABLE_POINT_STATUSES)[number];

export function isEditablePointStatus(value: string): value is EditablePointStatus {
  return (EDITABLE_POINT_STATUSES as readonly string[]).includes(value);
}

export interface PointListFilters {
  search?: string;
  noOwnerOnly?: boolean;
  brand?: string;
  status?: PointStatus;
}

export interface PointListItem {
  point: Point;
  owner: Owner | null;
}

export interface PointGroup {
  key: string;
  ownerId: string | null;
  title: string;
  owner: Owner | null;
  count: number;
  items: PointListItem[];
}

const NO_OWNER_GROUP_KEY = "no-owner";
const NO_OWNER_GROUP_TITLE = "Без владельца";

function normalizeQuery(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("ru-RU");
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "ru-RU", { sensitivity: "base" });
}

function compareItems(left: PointListItem, right: PointListItem): number {
  return (
    compareText(left.point.city, right.point.city) ||
    compareText(left.point.address, right.point.address) ||
    compareText(left.point.brand, right.point.brand)
  );
}

function itemMatchesSearch(item: PointListItem, search: string): boolean {
  if (!search) {
    return true;
  }

  const fields = [
    item.point.address,
    item.point.city,
    item.point.brand,
    item.point.status,
    POINT_STATUS_LABELS[item.point.status],
    item.point.comment,
    item.owner?.name,
    item.owner?.comment
  ];

  return fields.some((field) => normalizeQuery(field).includes(search));
}

export function createPointListItems(points: Point[], owners: Owner[]): PointListItem[] {
  const ownerById = new Map(
    owners
      .filter((owner) => owner.deletedAt === null)
      .map((owner) => [owner.id, owner])
  );

  return points
    .filter((point) => point.deletedAt === null)
    .map((point) => ({
      point,
      owner: point.ownerId ? ownerById.get(point.ownerId) ?? null : null
    }));
}

export function filterPointListItems(
  items: PointListItem[],
  filters: PointListFilters = {}
): PointListItem[] {
  const search = normalizeQuery(filters.search);
  const brand = normalizeQuery(filters.brand);

  return items.filter((item) => {
    if (filters.noOwnerOnly && item.point.ownerId !== null) {
      return false;
    }

    if (brand && !brandMatchesFilter(item.point.brand, brand)) {
      return false;
    }

    if (filters.status && item.point.status !== filters.status) {
      return false;
    }

    return itemMatchesSearch(item, search);
  });
}

export function groupPointListItems(items: PointListItem[]): PointGroup[] {
  const noOwnerItems = items
    .filter((item) => item.point.ownerId === null || item.owner === null)
    .sort(compareItems);

  const groups: PointGroup[] = [];
  if (noOwnerItems.length > 0) {
    groups.push({
      key: NO_OWNER_GROUP_KEY,
      ownerId: null,
      title: NO_OWNER_GROUP_TITLE,
      owner: null,
      count: noOwnerItems.length,
      items: noOwnerItems
    });
  }

  const ownerGroups = new Map<string, PointListItem[]>();
  for (const item of items) {
    if (!item.owner || item.point.ownerId === null) {
      continue;
    }

    const ownerItems = ownerGroups.get(item.owner.id) ?? [];
    ownerItems.push(item);
    ownerGroups.set(item.owner.id, ownerItems);
  }

  const sortedOwnerGroups = [...ownerGroups.entries()].sort(([, left], [, right]) =>
    compareText(left[0].owner?.name ?? "", right[0].owner?.name ?? "")
  );

  for (const [ownerId, ownerItems] of sortedOwnerGroups) {
    const sortedItems = ownerItems.sort(compareItems);
    groups.push({
      key: `owner-${ownerId}`,
      ownerId,
      title: sortedItems[0].owner?.name ?? "Владелец",
      owner: sortedItems[0].owner ?? null,
      count: sortedItems.length,
      items: sortedItems
    });
  }

  return groups;
}

export function getAvailableBrands(items: PointListItem[]): string[] {
  return createBrandFilterOptions(items.map((item) => item.point.brand))
    .map((option) => option.value)
    .sort(sortBrandValues);
}

export function createFilteredPointGroups(
  points: Point[],
  owners: Owner[],
  filters: PointListFilters = {}
): PointGroup[] {
  return groupPointListItems(filterPointListItems(createPointListItems(points, owners), filters));
}

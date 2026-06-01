import { describe, expect, it } from "vitest";
import type { Owner, Point } from "@/lib/data-model/types";
import {
  createFilteredPointGroups,
  createPointListItems,
  filterPointListItems,
  getAvailableBrands,
  groupPointListItems
} from "./list";

const now = "2026-01-01T00:00:00.000Z";

function point(overrides: Partial<Point> & Pick<Point, "id" | "address">): Point {
  const { id, address, ...rest } = overrides;

  return {
    id,
    sourceKey: `source-${id}`,
    brand: "Ozon",
    city: "Москва",
    address,
    normalizedCity: "москва",
    normalizedAddress: address.toLocaleLowerCase("ru-RU"),
    ownerId: null,
    status: "new",
    lat: null,
    lon: null,
    comment: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1,
    ...rest
  };
}

function owner(overrides: Partial<Owner> & Pick<Owner, "id" | "name">): Owner {
  const { id, name, ...rest } = overrides;

  return {
    id,
    name,
    phone: null,
    telegram: null,
    comment: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1,
    ...rest
  };
}

describe("point list helpers", () => {
  const owners = [
    owner({ id: "owner-b", name: "Бета" }),
    owner({ id: "owner-a", name: "Альфа" })
  ];

  const points = [
    point({
      id: "owned-b",
      address: "Тверская 1",
      ownerId: "owner-b",
      brand: "WB",
      status: "active",
      comment: "рядом с метро"
    }),
    point({ id: "no-owner", address: "Арбат 2", brand: "Ozon", status: "needs_review" }),
    point({ id: "owned-a", address: "Ленина 3", ownerId: "owner-a", brand: "Яндекс" })
  ];

  it("groups points without owner first and then by owner name", () => {
    const groups = groupPointListItems(createPointListItems(points, owners));

    expect(groups.map((group) => group.title)).toEqual(["Без владельца", "Альфа", "Бета"]);
    expect(groups.map((group) => group.count)).toEqual([1, 1, 1]);
    expect(groups[0].items[0].point.id).toBe("no-owner");
  });

  it("searches address, owner, brand, status label, and comment", () => {
    const items = createPointListItems(points, owners);

    expect(filterPointListItems(items, { search: "тверская" }).map((item) => item.point.id)).toEqual([
      "owned-b"
    ]);
    expect(filterPointListItems(items, { search: "альфа" }).map((item) => item.point.id)).toEqual([
      "owned-a"
    ]);
    expect(filterPointListItems(items, { search: "проверить" }).map((item) => item.point.id)).toEqual([
      "no-owner"
    ]);
    expect(filterPointListItems(items, { search: "метро" }).map((item) => item.point.id)).toEqual([
      "owned-b"
    ]);
  });

  it("applies no-owner, brand, and status filters", () => {
    const groups = createFilteredPointGroups(points, owners, {
      noOwnerOnly: true,
      brand: "Ozon",
      status: "needs_review"
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe("Без владельца");
    expect(groups[0].items.map((item) => item.point.id)).toEqual(["no-owner"]);
  });

  it("returns available brands from active points", () => {
    const items = createPointListItems(
      [
        ...points,
        point({ id: "deleted", address: "Скрытая 4", brand: "Deleted", deletedAt: now })
      ],
      owners
    );

    expect(getAvailableBrands(items)).toEqual(["Яндекс", "ozon", "wildberries"]);
  });
});

import { describe, expect, it } from "vitest";
import type { Owner, Point } from "@/lib/data-model/types";
import {
  createMapPointItems,
  filterMapMarkers,
  getAvailableMapBrands,
  splitPointCoordinates
} from "./points";

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
    lat: 55.751244,
    lon: 37.618423,
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

describe("map point helpers", () => {
  const owners = [owner({ id: "owner-1", name: "Альфа" })];

  it("separates mappable points from missing or malformed coordinates", () => {
    const items = createMapPointItems(
      [
        point({ id: "valid", address: "Тверская 1" }),
        point({ id: "missing", address: "Арбат 2", lat: null, lon: null }),
        point({ id: "bad-lat", address: "Ленина 3", lat: 100, lon: 37.6 }),
        point({ id: "deleted", address: "Скрытая 4", deletedAt: now })
      ],
      owners
    );
    const split = splitPointCoordinates(items);

    expect(split.withCoordinates.map((item) => item.point.id)).toEqual(["valid"]);
    expect(split.withoutCoordinates.map((item) => item.point.id)).toEqual([
      "missing",
      "bad-lat"
    ]);
  });

  it("filters markers by owner, brand, and status", () => {
    const split = splitPointCoordinates(
      createMapPointItems(
        [
          point({ id: "no-owner-ozon", address: "Тверская 1", brand: "Ozon", status: "active" }),
          point({
            id: "owned-wb",
            address: "Арбат 2",
            brand: "WB",
            ownerId: "owner-1",
            status: "active"
          }),
          point({
            id: "no-owner-review",
            address: "Ленина 3",
            brand: "Ozon",
            status: "needs_review"
          })
        ],
        owners
      )
    );

    const filtered = filterMapMarkers(split.withCoordinates, {
      mode: "no-owner",
      brand: "ozon",
      status: "active"
    });

    expect(filtered.map((item) => item.point.id)).toEqual(["no-owner-ozon"]);
  });

  it("filters nearby markers by user location and radius", () => {
    const split = splitPointCoordinates(
      createMapPointItems(
        [
          point({ id: "near", address: "Рядом", lat: 55.7513, lon: 37.6185 }),
          point({ id: "far", address: "Далеко", lat: 55.9, lon: 37.8 })
        ],
        owners
      )
    );

    const filtered = filterMapMarkers(split.withCoordinates, {
      mode: "nearby",
      userLocation: { lat: 55.751244, lon: 37.618423 },
      nearbyRadiusMeters: 300
    });

    expect(filtered.map((item) => item.point.id)).toEqual(["near"]);
    expect(filtered[0].distanceMeters).not.toBeNull();
  });

  it("returns marker brands", () => {
    const split = splitPointCoordinates(
      createMapPointItems(
        [
          point({ id: "ozon", address: "Тверская 1", brand: "Ozon" }),
          point({ id: "wb", address: "Арбат 2", brand: "WB" })
        ],
        owners
      )
    );

    expect(getAvailableMapBrands(split.withCoordinates)).toEqual(["Ozon", "WB"]);
  });
});

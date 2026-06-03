import type { Owner, Point, PointStatus } from "@/lib/data-model/types";
import { brandMatchesFilter, createBrandFilterOptions, sortBrandValues } from "@/lib/brands";

export const DEFAULT_NEARBY_RADIUS_METERS = 1200;

export type MapQuickFilter = "all" | "no-owner" | "nearby";

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface MapPointItem {
  point: Point;
  owner: Owner | null;
  coordinates: GeoPoint | null;
}

export interface MappablePointItem extends MapPointItem {
  coordinates: GeoPoint;
  distanceMeters: number | null;
}

export interface PointCoordinateSplit {
  withCoordinates: MappablePointItem[];
  withoutCoordinates: MapPointItem[];
}

export interface MapMarkerCluster {
  id: string;
  coordinates: GeoPoint;
  items: MappablePointItem[];
}

export interface MapMarkerFilters {
  mode?: MapQuickFilter;
  brand?: string;
  status?: PointStatus;
  userLocation?: GeoPoint | null;
  nearbyRadiusMeters?: number;
}

function normalizeFilter(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("ru-RU");
}

function isValidLatitude(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -180 && value <= 180;
}

export function getPointCoordinates(point: Point): GeoPoint | null {
  if (!isValidLatitude(point.lat) || !isValidLongitude(point.lon)) {
    return null;
  }

  return { lat: point.lat, lon: point.lon };
}

export function createMapPointItems(points: Point[], owners: Owner[]): MapPointItem[] {
  const ownerById = new Map(
    owners.filter((owner) => owner.deletedAt === null).map((owner) => [owner.id, owner])
  );

  return points
    .filter((point) => point.deletedAt === null)
    .map((point) => ({
      point,
      owner: point.ownerId ? ownerById.get(point.ownerId) ?? null : null,
      coordinates: getPointCoordinates(point)
    }));
}

export function splitPointCoordinates(items: MapPointItem[]): PointCoordinateSplit {
  const withCoordinates: MappablePointItem[] = [];
  const withoutCoordinates: MapPointItem[] = [];

  for (const item of items) {
    if (item.coordinates) {
      withCoordinates.push({ ...item, coordinates: item.coordinates, distanceMeters: null });
      continue;
    }

    withoutCoordinates.push(item);
  }

  return { withCoordinates, withoutCoordinates };
}

export function distanceMeters(from: GeoPoint, to: GeoPoint): number {
  const earthRadiusMeters = 6371000;
  const fromLat = (from.lat * Math.PI) / 180;
  const toLat = (to.lat * Math.PI) / 180;
  const deltaLat = ((to.lat - from.lat) * Math.PI) / 180;
  const deltaLon = ((to.lon - from.lon) * Math.PI) / 180;
  const haversine =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function filterMapMarkers(
  items: MappablePointItem[],
  filters: MapMarkerFilters = {}
): MappablePointItem[] {
  const mode = filters.mode ?? "all";
  const brand = normalizeFilter(filters.brand);
  const nearbyRadiusMeters = filters.nearbyRadiusMeters ?? DEFAULT_NEARBY_RADIUS_METERS;

  return items
    .map((item) => ({
      ...item,
      distanceMeters: filters.userLocation
        ? Math.round(distanceMeters(filters.userLocation, item.coordinates))
        : null
    }))
    .filter((item) => {
      if (mode === "no-owner" && item.point.ownerId !== null) {
        return false;
      }

      if (
        mode === "nearby" &&
        (item.distanceMeters === null || item.distanceMeters > nearbyRadiusMeters)
      ) {
        return false;
      }

      if (brand && !brandMatchesFilter(item.point.brand, brand)) {
        return false;
      }

      if (filters.status && item.point.status !== filters.status) {
        return false;
      }

      return true;
    })
    .sort((left, right) => {
      if (mode === "nearby") {
        return (left.distanceMeters ?? 0) - (right.distanceMeters ?? 0);
      }

      return (
        left.point.city.localeCompare(right.point.city, "ru-RU", { sensitivity: "base" }) ||
        left.point.address.localeCompare(right.point.address, "ru-RU", { sensitivity: "base" })
      );
    });
}

function coordinateClusterKey(coordinates: GeoPoint): string {
  return `${coordinates.lat.toFixed(6)},${coordinates.lon.toFixed(6)}`;
}

export function groupMapMarkersByCoordinates(items: MappablePointItem[]): MapMarkerCluster[] {
  const clustersByCoordinate = new Map<string, MapMarkerCluster>();

  for (const item of items) {
    const id = coordinateClusterKey(item.coordinates);
    const existingCluster = clustersByCoordinate.get(id);

    if (existingCluster) {
      existingCluster.items.push(item);
      continue;
    }

    clustersByCoordinate.set(id, {
      id,
      coordinates: item.coordinates,
      items: [item]
    });
  }

  return Array.from(clustersByCoordinate.values()).map((cluster) => ({
    ...cluster,
    items: [...cluster.items].sort((left, right) =>
      left.point.address.localeCompare(right.point.address, "ru-RU", { sensitivity: "base" })
    )
  }));
}

export function getAvailableMapBrands(items: MappablePointItem[]): string[] {
  return createBrandFilterOptions(items.map((item) => item.point.brand))
    .map((option) => option.value)
    .sort(sortBrandValues);
}

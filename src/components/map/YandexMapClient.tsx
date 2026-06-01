"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Crosshair,
  LocateFixed,
  MapPinned,
  Navigation,
  X
} from "lucide-react";
import type { Change, Conflict, Owner, Point, PointStatus } from "@/lib/data-model/types";
import { db } from "@/lib/indexeddb/db";
import { POINT_STATUS_LABELS } from "@/lib/points/list";
import { buildYandexRouteUrl } from "@/lib/yandex/deeplinks";
import {
  buildYandexMapsScriptUrl,
  createMapPointItems,
  DEFAULT_NEARBY_RADIUS_METERS,
  filterMapMarkers,
  getAvailableMapBrands,
  splitPointCoordinates,
  type GeoPoint,
  type MappablePointItem,
  type MapQuickFilter
} from "@/lib/yandex/map";

type SyncState = "synced" | "pending" | "conflict" | "offline";
type MapStatus = "idle" | "loading" | "ready" | "error";
type YandexCoordinates = [number, number];

interface MapState {
  points: Point[];
  owners: Owner[];
  pendingChanges: Change[];
  conflicts: Conflict[];
}

interface YandexPlacemark {
  events: {
    add: (eventName: "click", handler: () => void) => void;
  };
}

interface YandexMapInstance {
  geoObjects: {
    add: (placemark: YandexPlacemark) => void;
    removeAll: () => void;
  };
  setCenter: (center: YandexCoordinates, zoom?: number, options?: { duration?: number }) => void;
  destroy: () => void;
}

interface YandexMapsNamespace {
  ready: (callback: () => void) => void;
  Map: new (
    element: HTMLElement,
    state: { center: YandexCoordinates; zoom: number; controls: string[] },
    options?: Record<string, unknown>
  ) => YandexMapInstance;
  Placemark: new (
    coordinates: YandexCoordinates,
    properties: Record<string, unknown>,
    options: Record<string, unknown>
  ) => YandexPlacemark;
}

declare global {
  interface Window {
    ymaps?: YandexMapsNamespace;
  }
}

const EMPTY_STATE: MapState = {
  points: [],
  owners: [],
  pendingChanges: [],
  conflicts: []
};

const STATUS_OPTIONS: PointStatus[] = ["new", "active", "needs_review", "closed"];
const DEFAULT_MAP_CENTER: YandexCoordinates = [55.751244, 37.618423];
const MAP_API_KEY = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY ?? "";

const SYNC_LABELS: Record<SyncState, string> = {
  synced: "Синхр.",
  pending: "В очереди",
  conflict: "Конфликт",
  offline: "Офлайн"
};

const STATUS_MARKER_COLORS: Record<PointStatus, string> = {
  new: "#64748b",
  active: "#0f766e",
  needs_review: "#b45309",
  closed: "#475569"
};

let yandexMapsPromise: Promise<YandexMapsNamespace> | null = null;

async function readMapState(): Promise<MapState> {
  const [points, owners, pendingChanges, conflicts] = await Promise.all([
    db.points.filter((point) => point.deletedAt === null).toArray(),
    db.owners.filter((owner) => owner.deletedAt === null).toArray(),
    db.changes
      .filter((change) => change.deletedAt === null && change.syncedAt === null)
      .toArray(),
    db.conflicts
      .filter((conflict) => conflict.deletedAt === null && conflict.resolvedAt === null)
      .toArray()
  ]);

  return { points, owners, pendingChanges, conflicts };
}

function loadYandexMaps(apiKey: string): Promise<YandexMapsNamespace> {
  if (window.ymaps) {
    return Promise.resolve(window.ymaps);
  }

  yandexMapsPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "yandex-maps-api";
    script.src = buildYandexMapsScriptUrl(apiKey);
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (!window.ymaps) {
        reject(new Error("Yandex Maps API did not expose ymaps."));
        return;
      }

      window.ymaps.ready(() => resolve(window.ymaps as YandexMapsNamespace));
    };
    script.onerror = () => reject(new Error("Yandex Maps API script failed to load."));
    document.head.appendChild(script);
  });

  return yandexMapsPromise;
}

function statusClassName(status: PointStatus): string {
  return `point-status point-status-${status.replace("_", "-")}`;
}

function syncIcon(state: SyncState) {
  if (state === "conflict") {
    return <AlertTriangle size={14} aria-hidden="true" />;
  }

  if (state === "pending") {
    return <Clock3 size={14} aria-hidden="true" />;
  }

  return <CheckCircle2 size={14} aria-hidden="true" />;
}

function getGlobalSyncState(state: MapState, isOnline: boolean): SyncState {
  if (!isOnline) {
    return "offline";
  }

  if (state.conflicts.length > 0) {
    return "conflict";
  }

  if (state.pendingChanges.length > 0) {
    return "pending";
  }

  return "synced";
}

function isKnownStatus(value: string): value is PointStatus {
  return STATUS_OPTIONS.includes(value as PointStatus);
}

function markerCenter(items: MappablePointItem[]): YandexCoordinates {
  if (items.length === 0) {
    return DEFAULT_MAP_CENTER;
  }

  const total = items.reduce(
    (sum, item) => ({
      lat: sum.lat + item.coordinates.lat,
      lon: sum.lon + item.coordinates.lon
    }),
    { lat: 0, lon: 0 }
  );

  return [total.lat / items.length, total.lon / items.length];
}

function markerZoom(items: MappablePointItem[]): number {
  return items.length === 1 ? 15 : 11;
}

function formatDistance(value: number | null): string | null {
  if (value === null) {
    return null;
  }

  if (value < 1000) {
    return `${value} м`;
  }

  return `${(value / 1000).toFixed(1)} км`;
}

export default function YandexMapClient() {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<YandexMapInstance | null>(null);
  const [state, setState] = useState<MapState>(EMPTY_STATE);
  const [mode, setMode] = useState<MapQuickFilter>("all");
  const [brand, setBrand] = useState("");
  const [status, setStatus] = useState("");
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<GeoPoint | null>(null);
  const [isLocationSupported, setIsLocationSupported] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [mapStatus, setMapStatus] = useState<MapStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setState(await readMapState());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось прочитать локальные данные.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      setIsOnline(navigator.onLine);
      setIsLocationSupported("geolocation" in navigator);
      void refresh();
    }, 0);

    const updateOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);

    return () => {
      window.clearTimeout(loadTimer);
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, [refresh]);

  const allItems = useMemo(
    () => createMapPointItems(state.points, state.owners),
    [state.owners, state.points]
  );
  const coordinateSplit = useMemo(() => splitPointCoordinates(allItems), [allItems]);
  const brands = useMemo(
    () => getAvailableMapBrands(coordinateSplit.withCoordinates),
    [coordinateSplit.withCoordinates]
  );
  const filteredMarkers = useMemo(
    () =>
      filterMapMarkers(coordinateSplit.withCoordinates, {
        mode,
        brand: brand || undefined,
        status: isKnownStatus(status) ? status : undefined,
        userLocation,
        nearbyRadiusMeters: DEFAULT_NEARBY_RADIUS_METERS
      }),
    [brand, coordinateSplit.withCoordinates, mode, status, userLocation]
  );
  const selectedItem = useMemo(
    () => filteredMarkers.find((item) => item.point.id === selectedPointId) ?? null,
    [filteredMarkers, selectedPointId]
  );
  const globalSyncState = getGlobalSyncState(state, isOnline);

  useEffect(() => {
    if (coordinateSplit.withCoordinates.length === 0 || filteredMarkers.length === 0) {
      mapInstanceRef.current?.geoObjects.removeAll();
      const idleTimer = window.setTimeout(() => setMapStatus("idle"), 0);
      return () => window.clearTimeout(idleTimer);
    }

    if (!MAP_API_KEY) {
      const errorTimer = window.setTimeout(() => {
        setMapStatus("error");
        setMapError("Добавьте NEXT_PUBLIC_YANDEX_MAPS_API_KEY в окружение для загрузки карты.");
      }, 0);
      return () => window.clearTimeout(errorTimer);
    }

    let cancelled = false;
    const loadingTimer = window.setTimeout(() => {
      setMapStatus("loading");
      setMapError(null);
    }, 0);

    loadYandexMaps(MAP_API_KEY)
      .then((ymaps) => {
        if (cancelled || !mapElementRef.current) {
          return;
        }

        const center = markerCenter(filteredMarkers);
        const zoom = markerZoom(filteredMarkers);
        const map =
          mapInstanceRef.current ??
          new ymaps.Map(
            mapElementRef.current,
            { center, zoom, controls: ["zoomControl"] },
            { suppressMapOpenBlock: true }
          );

        mapInstanceRef.current = map;
        map.geoObjects.removeAll();

        for (const item of filteredMarkers) {
          const placemark = new ymaps.Placemark(
            [item.coordinates.lat, item.coordinates.lon],
            {
              hintContent: `${item.point.brand}: ${item.point.address}`
            },
            {
              preset: "islands#circleDotIcon",
              iconColor: STATUS_MARKER_COLORS[item.point.status]
            }
          );
          placemark.events.add("click", () => setSelectedPointId(item.point.id));
          map.geoObjects.add(placemark);
        }

        map.setCenter(center, zoom, { duration: 200 });
        setMapStatus("ready");
      })
      .catch((caught) => {
        if (!cancelled) {
          setMapStatus("error");
          setMapError(
            caught instanceof Error ? caught.message : "Не удалось загрузить Яндекс Карты."
          );
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(loadingTimer);
    };
  }, [coordinateSplit.withCoordinates.length, filteredMarkers]);

  useEffect(
    () => () => {
      mapInstanceRef.current?.destroy();
      mapInstanceRef.current = null;
    },
    []
  );

  const handleNearby = () => {
    if (mode === "nearby") {
      setMode("all");
      return;
    }

    if (!isLocationSupported) {
      setLocationError("Геолокация недоступна в этом браузере.");
      return;
    }

    setIsLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude
        });
        setMode("nearby");
        setIsLocating(false);
      },
      () => {
        setLocationError("Не удалось получить геолокацию. Проверьте разрешение браузера.");
        setMode("all");
        setIsLocating(false);
      },
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 8000 }
    );
  };

  return (
    <div className="page-stack map-page">
      <section className="points-list-header">
        <div>
          <h2 className="page-title">Карта</h2>
          <p className="lead">Маркеры строятся из локальных координат IndexedDB.</p>
        </div>
        <div className={`sync-badge sync-badge-${globalSyncState}`}>
          {syncIcon(globalSyncState)}
          <span>{SYNC_LABELS[globalSyncState]}</span>
          {state.pendingChanges.length > 0 ? <strong>{state.pendingChanges.length}</strong> : null}
        </div>
      </section>

      <section className="list-controls" aria-label="Фильтры карты">
        <div className="toolbar" aria-label="Быстрые фильтры карты">
          <button
            className={`filter-chip ${mode === "all" ? "filter-chip-active" : ""}`}
            type="button"
            onClick={() => setMode("all")}
          >
            Все
          </button>
          <button
            className={`filter-chip ${mode === "no-owner" ? "filter-chip-active" : ""}`}
            type="button"
            onClick={() => setMode("no-owner")}
          >
            Без владельца
          </button>
          <button
            className={`filter-chip ${mode === "nearby" ? "filter-chip-active" : ""}`}
            type="button"
            disabled={isLocating}
            onClick={handleNearby}
          >
            <LocateFixed size={16} aria-hidden="true" />
            {isLocating ? "Ищу..." : "Рядом"}
          </button>
          <label className="filter-select">
            <span>Бренд</span>
            <select value={brand} onChange={(event) => setBrand(event.target.value)}>
              <option value="">Все</option>
              {brands.map((brandOption) => (
                <option key={brandOption} value={brandOption}>
                  {brandOption}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-select">
            <span>Статус</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Все</option>
              {STATUS_OPTIONS.map((statusOption) => (
                <option key={statusOption} value={statusOption}>
                  {POINT_STATUS_LABELS[statusOption]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}
      {locationError ? <div className="error-banner">{locationError}</div> : null}

      <section className="map-panel" aria-label="Карта ПВЗ">
        <div className="map-canvas" ref={mapElementRef} />
        {isLoading ? (
          <div className="map-overlay">
            <Clock3 size={22} aria-hidden="true" />
            <strong>Загрузка локальных данных</strong>
            <span>Читаю IndexedDB на устройстве.</span>
          </div>
        ) : coordinateSplit.withCoordinates.length === 0 ? (
          <div className="map-overlay">
            <MapPinned size={22} aria-hidden="true" />
            <strong>Нет точек с координатами</strong>
            <span>Координаты появятся после импорта, добавления или геокодирования.</span>
          </div>
        ) : filteredMarkers.length === 0 ? (
          <div className="map-overlay">
            <Crosshair size={22} aria-hidden="true" />
            <strong>Нет маркеров по фильтрам</strong>
            <span>Измените быстрый фильтр, бренд или статус.</span>
          </div>
        ) : mapStatus === "error" ? (
          <div className="map-overlay map-overlay-error" role="alert">
            <AlertTriangle size={22} aria-hidden="true" />
            <strong>Карта не загрузилась</strong>
            <span>{mapError ?? "Проверьте ключ и доступность Yandex Maps API."}</span>
          </div>
        ) : mapStatus === "loading" ? (
          <div className="map-overlay">
            <Clock3 size={22} aria-hidden="true" />
            <strong>Загружаю Яндекс Карты</strong>
            <span>Маркеров: {filteredMarkers.length}</span>
          </div>
        ) : null}
      </section>

      <section className="map-summary" aria-label="Сводка карты">
        <div>
          <strong>{filteredMarkers.length}</strong>
          <span>на карте</span>
        </div>
        <div>
          <strong>{coordinateSplit.withoutCoordinates.length}</strong>
          <span>без координат</span>
        </div>
        <div>
          <strong>{state.points.length}</strong>
          <span>в IndexedDB</span>
        </div>
      </section>

      {coordinateSplit.withoutCoordinates.length > 0 ? (
        <section className="section">
          <h3 className="section-title">
            <span>Без координат</span>
            <span>{coordinateSplit.withoutCoordinates.length}</span>
          </h3>
          <div className="missing-coordinate-list">
            {coordinateSplit.withoutCoordinates.slice(0, 6).map((item) => (
              <article className="missing-coordinate-item" key={item.point.id}>
                <span className="brand-pill">{item.point.brand}</span>
                <div>
                  <strong>{item.point.address}</strong>
                  <span>{item.point.city}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {selectedItem ? (
        <div className="map-sheet-backdrop" onClick={() => setSelectedPointId(null)}>
          <aside
            className="map-bottom-sheet"
            aria-label="Детали ПВЗ"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="sheet-close"
              type="button"
              title="Закрыть"
              aria-label="Закрыть"
              onClick={() => setSelectedPointId(null)}
            >
              <X size={20} aria-hidden="true" />
            </button>
            <div className="point-meta-row">
              <span className="brand-pill">{selectedItem.point.brand}</span>
              <span className={statusClassName(selectedItem.point.status)}>
                {POINT_STATUS_LABELS[selectedItem.point.status]}
              </span>
              {formatDistance(selectedItem.distanceMeters) ? (
                <span className="distance-pill">{formatDistance(selectedItem.distanceMeters)}</span>
              ) : null}
            </div>
            <div>
              <h3>{selectedItem.point.address}</h3>
              <p>{selectedItem.point.city}</p>
            </div>
            <div className="point-details">
              <span>{selectedItem.owner?.name ?? "Владелец не назначен"}</span>
              {selectedItem.point.comment ? <span>{selectedItem.point.comment}</span> : null}
            </div>
            <a
              className="button"
              href={buildYandexRouteUrl({
                lat: selectedItem.coordinates.lat,
                lon: selectedItem.coordinates.lon,
                label: `${selectedItem.point.brand}, ${selectedItem.point.address}`
              })}
              target="_blank"
              rel="noreferrer"
            >
              <Navigation size={18} aria-hidden="true" />
              Маршрут
            </a>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

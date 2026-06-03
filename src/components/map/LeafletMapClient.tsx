"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Clock3,
  Crosshair,
  LocateFixed,
  MapPinned
} from "lucide-react";
import { toast } from "sonner";
import { getBrandLabel } from "@/lib/brands";
import type { PointStatus } from "@/lib/data-model/types";
import { BrandBadge } from "@/components/points/PointBadges";
import {
  PointActionDialogs,
  type PointAction,
  type PointActionItem
} from "@/components/points/PointActionDialogs";
import { SyncHealthIndicator } from "@/components/sync/SyncHealthIndicator";
import {
  createMapPointItems,
  DEFAULT_NEARBY_RADIUS_METERS,
  filterMapMarkers,
  getAvailableMapBrands,
  groupMapMarkersByCoordinates,
  splitPointCoordinates,
  type GeoPoint,
  type MapQuickFilter
} from "@/lib/map/points";
import {
  EDITABLE_POINT_STATUSES,
  isEditablePointStatus,
  POINT_STATUS_LABELS
} from "@/lib/points/list";
import { useOnlineCachedSnapshot } from "@/lib/sync/use-online-cached-snapshot";
import { buildYandexRouteUrl } from "@/lib/yandex/deeplinks";

const LeafletMapView = dynamic(() => import("./LeafletMapView"), {
  ssr: false,
  loading: () => <div className="map-canvas map-canvas-loading" />
});

function isKnownStatus(value: string): value is PointStatus {
  return isEditablePointStatus(value);
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

export default function LeafletMapClient() {
  const {
    snapshot: state,
    error: cacheError,
    isOnline,
    isLoadingCache,
    isRefreshing,
    refreshCache,
    refreshOnline
  } = useOnlineCachedSnapshot();
  const [mode, setMode] = useState<MapQuickFilter>("all");
  const [brand, setBrand] = useState("");
  const [status, setStatus] = useState("");
  const [userLocation, setUserLocation] = useState<GeoPoint | null>(null);
  const [isLocationSupported, setIsLocationSupported] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<PointAction | null>(null);
  const [activeItem, setActiveItem] = useState<PointActionItem | null>(null);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      setIsLocationSupported("geolocation" in navigator);
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, []);

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
  const markerClusters = useMemo(
    () => groupMapMarkersByCoordinates(filteredMarkers),
    [filteredMarkers]
  );
  const dialogItem = useMemo(() => {
    if (!activeItem) {
      return null;
    }

    return allItems.find((item) => item.point.id === activeItem.point.id) ?? activeItem;
  }, [activeItem, allItems]);
  const activeMapItem = useMemo(() => {
    if (!activeItem) {
      return null;
    }

    return filteredMarkers.find((item) => item.point.id === activeItem.point.id) ?? null;
  }, [activeItem, filteredMarkers]);
  const activeRouteUrl = activeMapItem
    ? buildYandexRouteUrl({
        lat: activeMapItem.coordinates.lat,
        lon: activeMapItem.coordinates.lon
      })
    : null;
  const hasLocalRows = state.points.length > 0 || state.owners.length > 0 || state.visits.length > 0;
  const isInitialOnlineLoad = isRefreshing && !hasLocalRows;
  const error = mutationError ?? cacheError;

  const availableOwners = useMemo(
    () => state.owners.filter((owner) => owner.deletedAt === null),
    [state.owners]
  );

  const runMutation = async (
    mutation: () => Promise<unknown>,
    successMessage: string
  ): Promise<boolean> => {
    try {
      setMutationError(null);
      await mutation();
      await refreshCache();
      if (isOnline) {
        void refreshOnline();
      } else {
        toast.warning("Будет отправлено при сети.");
      }
      toast.success(successMessage);
      return true;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Не удалось сохранить изменение.";
      setMutationError(message);
      toast.error(message);
      return false;
    }
  };

  const openAction = (action: PointAction, item: PointActionItem) => {
    setActiveItem(item);
    setActiveAction(action);
  };

  const openMarkerDetails = (pointId: string) => {
    const item = filteredMarkers.find((marker) => marker.point.id === pointId);
    if (item) {
      openAction("details", item);
    }
  };

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
          <p className="lead">Маркеры строятся из координат, сохраненных на устройстве.</p>
        </div>
        <SyncHealthIndicator
          pendingChanges={state.pendingChanges}
          conflicts={state.conflicts}
          isOnline={isOnline}
          isRefreshing={isRefreshing}
          error={error}
        />
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
                  {getBrandLabel(brandOption)}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-select">
            <span>Статус</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Все</option>
              {EDITABLE_POINT_STATUSES.map((statusOption) => (
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
      {isRefreshing && hasLocalRows ? <p className="lead">Обновляю онлайн-данные...</p> : null}

      <section className="map-panel" aria-label="Карта ПВЗ">
        <div className="map-canvas">
          {coordinateSplit.withCoordinates.length > 0 && filteredMarkers.length > 0 ? (
            <LeafletMapView
              markerClusters={markerClusters}
              onMarkerSelect={openMarkerDetails}
              onTileError={() => setMapError("Не удалось загрузить тайлы OpenStreetMap.")}
            />
          ) : null}
        </div>
        {isLoadingCache ? (
          <div className="map-overlay">
            <Clock3 size={22} aria-hidden="true" />
            <strong>Загрузка кэша</strong>
            <span>Читаю данные на устройстве.</span>
          </div>
        ) : isInitialOnlineLoad ? (
          <div className="map-overlay">
            <Clock3 size={22} aria-hidden="true" />
            <strong>Загружаю онлайн-данные</strong>
            <span>Обновляю сохраненные ПВЗ.</span>
          </div>
        ) : coordinateSplit.withCoordinates.length === 0 ? (
          <div className="map-overlay">
            <MapPinned size={22} aria-hidden="true" />
            <strong>Нет точек с координатами</strong>
            <span>Добавьте координаты вручную или через импорт.</span>
          </div>
        ) : filteredMarkers.length === 0 ? (
          <div className="map-overlay">
            <Crosshair size={22} aria-hidden="true" />
            <strong>Нет маркеров по фильтрам</strong>
            <span>Измените быстрый фильтр, бренд или статус.</span>
          </div>
        ) : mapError ? (
          <div className="map-overlay map-overlay-error" role="alert">
            <AlertTriangle size={22} aria-hidden="true" />
            <strong>Карта не загрузилась</strong>
            <span>{mapError}</span>
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
                <BrandBadge brand={item.point.brand} />
                <div>
                  <strong>{item.point.address}</strong>
                  <span>{item.point.city}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <PointActionDialogs
        action={activeAction}
        item={dialogItem}
        owners={availableOwners}
        distanceLabel={formatDistance(activeMapItem?.distanceMeters ?? null)}
        routeUrl={activeRouteUrl}
        visibleDetailActions={{ route: true, assignOwner: true }}
        onActionChange={(nextAction) => {
          setActiveAction(nextAction);
          if (nextAction === null) {
            setActiveItem(null);
          }
        }}
        runMutation={runMutation}
      />
    </div>
  );
}

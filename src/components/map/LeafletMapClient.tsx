"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock3,
  Crosshair,
  MessageSquare,
  LocateFixed,
  MapPinned,
  Navigation,
  Pencil,
  UserPlus
} from "lucide-react";
import { toast } from "sonner";
import type { Change, Conflict, PointStatus } from "@/lib/data-model/types";
import { PointActionDialogs, type PointAction, type PointActionItem } from "@/components/points/PointActionDialogs";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle
} from "@/components/ui/drawer";
import {
  createMapPointItems,
  DEFAULT_NEARBY_RADIUS_METERS,
  filterMapMarkers,
  getAvailableMapBrands,
  splitPointCoordinates,
  type GeoPoint,
  type MapQuickFilter
} from "@/lib/map/points";
import { POINT_STATUS_LABELS } from "@/lib/points/list";
import { useOnlineCachedSnapshot } from "@/lib/sync/use-online-cached-snapshot";
import { buildYandexRouteUrl } from "@/lib/yandex/deeplinks";

const LeafletMapView = dynamic(() => import("./LeafletMapView"), {
  ssr: false,
  loading: () => <div className="map-canvas map-canvas-loading" />
});

type SyncState = "synced" | "pending" | "conflict" | "offline" | "refreshing";

const STATUS_OPTIONS: PointStatus[] = ["new", "active", "needs_review", "closed"];

const SYNC_LABELS: Record<SyncState, string> = {
  synced: "Синхр.",
  pending: "В очереди",
  conflict: "Конфликт",
  offline: "Офлайн",
  refreshing: "Обновляю"
};

function statusClassName(status: PointStatus): string {
  return `point-status point-status-${status.replace("_", "-")}`;
}

function syncIcon(state: SyncState) {
  if (state === "conflict") {
    return <AlertTriangle size={14} aria-hidden="true" />;
  }

  if (state === "pending" || state === "refreshing") {
    return <Clock3 size={14} aria-hidden="true" />;
  }

  return <CheckCircle2 size={14} aria-hidden="true" />;
}

function getGlobalSyncState(
  pendingChanges: Change[],
  conflicts: Conflict[],
  isOnline: boolean,
  isRefreshing: boolean
): SyncState {
  if (isRefreshing) {
    return "refreshing";
  }

  if (!isOnline) {
    return "offline";
  }

  if (conflicts.length > 0) {
    return "conflict";
  }

  if (pendingChanges.length > 0) {
    return "pending";
  }

  return "synced";
}

function isKnownStatus(value: string): value is PointStatus {
  return STATUS_OPTIONS.includes(value as PointStatus);
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
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
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
  const selectedItem = useMemo(
    () => filteredMarkers.find((item) => item.point.id === selectedPointId) ?? null,
    [filteredMarkers, selectedPointId]
  );
  const globalSyncState = getGlobalSyncState(
    state.pendingChanges,
    state.conflicts,
    isOnline,
    isRefreshing
  );
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
        toast.warning("Офлайн: изменение дождется синхронизации.");
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
    setSelectedPointId(null);
    setActiveItem(item);
    setActiveAction(action);
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
      {isRefreshing && hasLocalRows ? <p className="lead">Обновляю онлайн-данные...</p> : null}

      <section className="map-panel" aria-label="Карта ПВЗ">
        <div className="map-canvas">
          {coordinateSplit.withCoordinates.length > 0 && filteredMarkers.length > 0 ? (
            <LeafletMapView
              markers={filteredMarkers}
              onMarkerSelect={setSelectedPointId}
              onTileError={() => setMapError("Не удалось загрузить тайлы OpenStreetMap.")}
            />
          ) : null}
        </div>
        {isLoadingCache ? (
          <div className="map-overlay">
            <Clock3 size={22} aria-hidden="true" />
            <strong>Загрузка кэша</strong>
            <span>Читаю IndexedDB на устройстве.</span>
          </div>
        ) : isInitialOnlineLoad ? (
          <div className="map-overlay">
            <Clock3 size={22} aria-hidden="true" />
            <strong>Загружаю онлайн-данные</strong>
            <span>Получаю актуальные ПВЗ и сохраняю их в IndexedDB.</span>
          </div>
        ) : coordinateSplit.withCoordinates.length === 0 ? (
          <div className="map-overlay">
            <MapPinned size={22} aria-hidden="true" />
            <strong>Нет точек с координатами</strong>
            <span>Добавьте lat/lon вручную, через импорт или Google Sheets.</span>
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

      <Drawer
        open={Boolean(selectedItem)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedPointId(null);
          }
        }}
      >
        <DrawerContent className="marker-drawer-content mx-auto h-auto w-full max-w-[720px] overflow-visible border-x data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-80px)]">
          <DrawerHeader>
            <DrawerTitle>Детали ПВЗ</DrawerTitle>
            <DrawerDescription>
              {selectedItem ? `${selectedItem.point.brand}, ${selectedItem.point.address}` : "ПВЗ не выбран"}
            </DrawerDescription>
          </DrawerHeader>
          {selectedItem ? (
            <div className="map-marker-details">
              <div className="point-meta-row">
                <span className="brand-pill">{selectedItem.point.brand}</span>
                <span className={statusClassName(selectedItem.point.status)}>
                  {POINT_STATUS_LABELS[selectedItem.point.status]}
                </span>
                {formatDistance(selectedItem.distanceMeters) ? (
                  <span className="distance-pill">
                    {formatDistance(selectedItem.distanceMeters)}
                  </span>
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
              <div className="map-sheet-actions" aria-label="Действия с ПВЗ на карте">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => openAction("owner", selectedItem)}
                >
                  <UserPlus size={18} aria-hidden="true" />
                  Назначить владельца
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => openAction("status", selectedItem)}
                >
                  <AlertTriangle size={18} aria-hidden="true" />
                  Изменить статус
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => openAction("note", selectedItem)}
                >
                  <MessageSquare size={18} aria-hidden="true" />
                  Заметка
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => openAction("edit", selectedItem)}
                >
                  <Pencil size={18} aria-hidden="true" />
                  Редактировать
                </button>
                <button
                  className="button destructive"
                  type="button"
                  onClick={() => openAction("close", selectedItem)}
                >
                  <Archive size={18} aria-hidden="true" />
                  Закрыть
                </button>
              </div>
            </div>
          ) : null}
        </DrawerContent>
      </Drawer>
      <PointActionDialogs
        action={activeAction}
        item={activeItem}
        owners={availableOwners}
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

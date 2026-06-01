"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  Check,
  CheckCircle2,
  Clock3,
  MapPinned,
  MessageSquare,
  Pencil,
  Search,
  UserPlus,
  WifiOff
} from "lucide-react";
import { toast } from "sonner";
import type { Change, Conflict, PointStatus, Visit } from "@/lib/data-model/types";
import { addVisitLocal } from "@/lib/sync/local-actions";
import { useOnlineCachedSnapshot } from "@/lib/sync/use-online-cached-snapshot";
import { buildYandexRouteUrl } from "@/lib/yandex/deeplinks";
import {
  createPointListItems,
  filterPointListItems,
  getAvailableBrands,
  groupPointListItems,
  POINT_STATUS_LABELS,
  type PointListItem
} from "@/lib/points/list";
import { PointActionDialogs, type PointAction } from "./PointActionDialogs";

type SyncState = "synced" | "pending" | "conflict" | "offline" | "refreshing";

const STATUS_OPTIONS: PointStatus[] = ["new", "active", "needs_review", "closed"];

const SYNC_LABELS: Record<SyncState, string> = {
  synced: "Синхр.",
  pending: "В очереди",
  conflict: "Конфликт",
  offline: "Офлайн",
  refreshing: "Обновляю"
};

function changeTouchesPoint(change: Change, pointId: string): boolean {
  if (change.entityName === "point") {
    return change.entityId === pointId;
  }

  return change.entityName === "visit" && change.patch.pointId === pointId;
}

function getPointSyncState(
  pointId: string,
  pendingChanges: Change[],
  conflicts: Conflict[],
  isOnline: boolean
): SyncState {
  if (!isOnline) {
    return "offline";
  }

  if (
    conflicts.some(
      (conflict) => conflict.entityName === "point" && conflict.entityId === pointId
    )
  ) {
    return "conflict";
  }

  if (pendingChanges.some((change) => changeTouchesPoint(change, pointId))) {
    return "pending";
  }

  return "synced";
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

function getLastVisit(pointId: string, visits: Visit[]): Visit | null {
  return visits
    .filter((visit) => visit.pointId === pointId)
    .sort((left, right) => right.visitedAt.localeCompare(left.visitedAt))[0] ?? null;
}

function formatVisitDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function isKnownStatus(value: string): value is PointStatus {
  return STATUS_OPTIONS.includes(value as PointStatus);
}

function statusClassName(status: PointStatus): string {
  return `point-status point-status-${status.replace("_", "-")}`;
}

function syncIcon(state: SyncState) {
  if (state === "offline") {
    return <WifiOff size={14} aria-hidden="true" />;
  }

  if (state === "conflict") {
    return <AlertTriangle size={14} aria-hidden="true" />;
  }

  if (state === "pending" || state === "refreshing") {
    return <Clock3 size={14} aria-hidden="true" />;
  }

  return <CheckCircle2 size={14} aria-hidden="true" />;
}

export default function PointsListClient() {
  const {
    snapshot: state,
    error: cacheError,
    isOnline,
    isLoadingCache,
    isRefreshing,
    refreshCache,
    refreshOnline
  } = useOnlineCachedSnapshot();
  const [search, setSearch] = useState("");
  const [noOwnerOnly, setNoOwnerOnly] = useState(false);
  const [brand, setBrand] = useState("");
  const [status, setStatus] = useState("");
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<PointAction | null>(null);
  const [activeItem, setActiveItem] = useState<PointListItem | null>(null);

  const items = useMemo(
    () => createPointListItems(state.points, state.owners),
    [state.points, state.owners]
  );
  const brands = useMemo(() => getAvailableBrands(items), [items]);
  const filteredGroups = useMemo(
    () =>
      groupPointListItems(
        filterPointListItems(items, {
          search,
          noOwnerOnly,
          brand: brand || undefined,
          status: isKnownStatus(status) ? status : undefined
        })
      ),
    [brand, items, noOwnerOnly, search, status]
  );
  const availableOwners = useMemo(
    () => state.owners.filter((owner) => owner.deletedAt === null),
    [state.owners]
  );
  const ownerUsageCounts = useMemo(
    () =>
      state.points.reduce<Record<string, number>>((counts, point) => {
        if (point.deletedAt === null && point.ownerId) {
          counts[point.ownerId] = (counts[point.ownerId] ?? 0) + 1;
        }

        return counts;
      }, {}),
    [state.points]
  );
  const dialogItem = useMemo(() => {
    if (!activeItem) {
      return null;
    }

    return items.find((item) => item.point.id === activeItem.point.id) ?? activeItem;
  }, [activeItem, items]);
  const globalSyncState = getGlobalSyncState(
    state.pendingChanges,
    state.conflicts,
    isOnline,
    isRefreshing
  );
  const hasLocalRows = state.points.length > 0 || state.owners.length > 0 || state.visits.length > 0;
  const isInitialOnlineLoad = isRefreshing && !hasLocalRows;
  const error = mutationError ?? cacheError;

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

  const openAction = (action: PointAction, item: PointListItem) => {
    setActiveItem(item);
    setActiveAction(action);
  };

  const handleVisited = (item: PointListItem) => {
    void runMutation(
      () => addVisitLocal({ pointId: item.point.id, status: "completed" }),
      "Визит сохранен локально, изменение добавлено в очередь синхронизации."
    );
  };

  return (
    <div className="page-stack points-list-page">
      <section className="points-list-header">
        <div>
          <h2 className="page-title">Пункты выдачи</h2>
          <p className="lead">Без владельца сверху, затем группы по владельцам.</p>
        </div>
        <div className={`sync-badge sync-badge-${globalSyncState}`}>
          {syncIcon(globalSyncState)}
          <span>{SYNC_LABELS[globalSyncState]}</span>
          {state.pendingChanges.length > 0 ? <strong>{state.pendingChanges.length}</strong> : null}
        </div>
      </section>

      <section className="list-controls" aria-label="Поиск и фильтры">
        <label className="search-field">
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="Поиск ПВЗ"
            placeholder="Адрес, владелец, бренд, статус..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <div className="toolbar" aria-label="Быстрые фильтры">
          <button
            className={`filter-chip ${noOwnerOnly ? "filter-chip-active" : ""}`}
            type="button"
            onClick={() => setNoOwnerOnly((value) => !value)}
          >
            Без владельца
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

      {isRefreshing && hasLocalRows ? <p className="lead">Обновляю онлайн-данные...</p> : null}

      {isLoadingCache ? (
        <section className="card">
          <h3>Загрузка кэша</h3>
          <p>Читаю IndexedDB на устройстве.</p>
        </section>
      ) : isInitialOnlineLoad ? (
        <section className="card">
          <h3>Загружаю онлайн-данные</h3>
          <p>Получаю актуальные ПВЗ и сохраняю их в IndexedDB.</p>
        </section>
      ) : filteredGroups.length === 0 ? (
        <section className="card">
          <h3>ПВЗ не найдены</h3>
          <p>Измените поиск или фильтры, либо добавьте точку вручную.</p>
          <div className="action-row">
            <a className="button" href="/add">
              Добавить ПВЗ
            </a>
            <a className="button secondary" href="/sync">
              Синхронизация
            </a>
          </div>
        </section>
      ) : (
        filteredGroups.map((group) => (
          <section className="section point-group" aria-labelledby={`${group.key}-heading`} key={group.key}>
            <h3 className="section-title" id={`${group.key}-heading`}>
              <span>{group.title}</span>
              <span>{group.count}</span>
            </h3>
            <div className="point-card-list">
              {group.items.map((item) => {
                const pointSyncState = getPointSyncState(
                  item.point.id,
                  state.pendingChanges,
                  state.conflicts,
                  isOnline
                );
                const lastVisit = getLastVisit(item.point.id, state.visits);
                const canRoute = item.point.lat !== null && item.point.lon !== null;

                return (
                  <article className="point-card" key={item.point.id}>
                    <div className="point-card-main">
                      <div>
                        <div className="point-meta-row">
                          <span className="brand-pill">{item.point.brand}</span>
                          <span className={statusClassName(item.point.status)}>
                            {POINT_STATUS_LABELS[item.point.status]}
                          </span>
                        </div>
                        <h4>{item.point.address}</h4>
                        <p>{item.point.city}</p>
                      </div>
                      <div className={`sync-badge sync-badge-${pointSyncState}`}>
                        {syncIcon(pointSyncState)}
                        <span>{SYNC_LABELS[pointSyncState]}</span>
                      </div>
                    </div>

                    <div className="point-details">
                      <span>{item.owner?.name ?? "Владелец не назначен"}</span>
                      <span>
                        {lastVisit ? `Визит ${formatVisitDate(lastVisit.visitedAt)}` : "Визитов нет"}
                      </span>
                      {item.point.comment ? <span>{item.point.comment}</span> : null}
                    </div>

                    <div className="point-actions" aria-label={`Действия для ${item.point.address}`}>
                      {canRoute ? (
                        <a
                          className="card-action primary"
                          href={buildYandexRouteUrl({
                            lat: item.point.lat as number,
                            lon: item.point.lon as number,
                            label: `${item.point.brand}, ${item.point.address}`
                          })}
                          target="_blank"
                          rel="noreferrer"
                          title="Маршрут"
                          aria-label="Маршрут"
                        >
                          <MapPinned size={19} aria-hidden="true" />
                          <span>Маршрут</span>
                        </a>
                      ) : (
                        <button
                          className="card-action"
                          type="button"
                          title="Нет координат"
                          aria-label="Нет координат"
                          disabled
                        >
                          <MapPinned size={19} aria-hidden="true" />
                          <span>Нет координат</span>
                        </button>
                      )}
                      <button
                        className="card-action"
                        type="button"
                        title="Редактировать ПВЗ"
                        aria-label="Редактировать ПВЗ"
                        onClick={() => openAction("edit", item)}
                      >
                        <Pencil size={18} aria-hidden="true" />
                        <span>Редактировать</span>
                      </button>
                      <button
                        className="card-action"
                        type="button"
                        title="Назначить владельца"
                        aria-label="Назначить владельца"
                        onClick={() => openAction("owner", item)}
                      >
                        <UserPlus size={18} aria-hidden="true" />
                        <span>Владелец</span>
                      </button>
                      <button
                        className="card-action"
                        type="button"
                        title="Отметить визит"
                        aria-label="Отметить визит"
                        onClick={() => handleVisited(item)}
                      >
                        <Check size={18} aria-hidden="true" />
                        <span>Визит</span>
                      </button>
                      <button
                        className="card-action"
                        type="button"
                        title="Изменить статус"
                        aria-label="Изменить статус"
                        onClick={() => openAction("status", item)}
                      >
                        <AlertTriangle size={18} aria-hidden="true" />
                        <span>Статус</span>
                      </button>
                      <button
                        className="card-action"
                        type="button"
                        title="Комментарий"
                        aria-label="Комментарий"
                        onClick={() => openAction("note", item)}
                      >
                        <MessageSquare size={18} aria-hidden="true" />
                        <span>Заметка</span>
                      </button>
                      <button
                        className="card-action destructive"
                        type="button"
                        title="Закрыть ПВЗ"
                        aria-label="Закрыть ПВЗ"
                        onClick={() => openAction("close", item)}
                      >
                        <Archive size={18} aria-hidden="true" />
                        <span>Закрыть</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))
      )}
      <PointActionDialogs
        action={activeAction}
        item={dialogItem}
        owners={availableOwners}
        ownerUsageCounts={ownerUsageCounts}
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

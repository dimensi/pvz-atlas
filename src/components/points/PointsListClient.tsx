"use client";

import { useMemo, useState } from "react";
import { ListChecks, MapPinned, Pencil, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { getBrandLabel, getBrandPillClassName } from "@/lib/brands";
import type { PointStatus } from "@/lib/data-model/types";
import { getPointCoordinates } from "@/lib/map/points";
import { useOnlineCachedSnapshot } from "@/lib/sync/use-online-cached-snapshot";
import { buildYandexRouteUrl } from "@/lib/yandex/deeplinks";
import {
  createPointListItems,
  EDITABLE_POINT_STATUSES,
  filterPointListItems,
  getAvailableBrands,
  groupPointListItems,
  isEditablePointStatus,
  POINT_STATUS_LABELS,
  type PointListItem
} from "@/lib/points/list";
import { PointActionDialogs, type PointAction } from "./PointActionDialogs";
import { SyncHealthIndicator } from "@/components/sync/SyncHealthIndicator";

function isKnownStatus(value: string): value is PointStatus {
  return isEditablePointStatus(value);
}

function statusClassName(status: PointStatus): string {
  return `point-status point-status-${status.replace("_", "-")}`;
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
  const dialogItem = useMemo(() => {
    if (!activeItem) {
      return null;
    }

    return items.find((item) => item.point.id === activeItem.point.id) ?? activeItem;
  }, [activeItem, items]);
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

  const openAction = (action: PointAction, item: PointListItem) => {
    setActiveItem(item);
    setActiveAction(action);
  };

  return (
    <div className="page-stack points-list-page">
      <section className="points-list-header">
        <div>
          <h2 className="page-title">Пункты выдачи</h2>
          <p className="lead">Без владельца сверху, затем группы по владельцам.</p>
        </div>
        <SyncHealthIndicator
          pendingChanges={state.pendingChanges}
          conflicts={state.conflicts}
          isOnline={isOnline}
          isRefreshing={isRefreshing}
          error={error}
        />
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

      {isRefreshing && hasLocalRows ? <p className="lead">Обновляю онлайн-данные...</p> : null}

      {isLoadingCache ? (
        <section className="card">
          <h3>Загрузка</h3>
          <p>Читаю данные на устройстве.</p>
        </section>
      ) : isInitialOnlineLoad ? (
        <section className="card">
          <h3>Загружаю онлайн-данные</h3>
          <p>Обновляю сохраненные ПВЗ.</p>
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
                const routeCoordinates = getPointCoordinates(item.point);

                return (
                  <article className="point-card" key={item.point.id}>
                    <div className="point-card-main">
                      <div>
                        <div className="point-meta-row">
                          <span className={getBrandPillClassName(item.point.brand)}>
                            {getBrandLabel(item.point.brand)}
                          </span>
                          {item.point.status !== "new" ? (
                            <span className={statusClassName(item.point.status)}>
                              {POINT_STATUS_LABELS[item.point.status]}
                            </span>
                          ) : null}
                        </div>
                        <h4>{item.point.address}</h4>
                        <p>{item.point.city}</p>
                      </div>
                    </div>

                    <div className="point-details">
                      <span>{item.owner?.name ?? "Без владельца"}</span>
                    </div>
                    {item.point.comment ? (
                      <p className="point-card-note">{item.point.comment}</p>
                    ) : null}

                    <div className="point-actions" aria-label={`Действия для ${item.point.address}`}>
                      {routeCoordinates ? (
                        <a
                          className="card-action primary"
                          href={buildYandexRouteUrl({
                            lat: routeCoordinates.lat,
                            lon: routeCoordinates.lon
                          })}
                          target="_blank"
                          rel="noreferrer"
                          title="Маршрут"
                          aria-label="Маршрут"
                        >
                          <MapPinned size={19} aria-hidden="true" />
                          <span>Маршрут</span>
                        </a>
                      ) : null}
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
                        title="Статус"
                        aria-label="Статус"
                        onClick={() => openAction("details", item)}
                      >
                        <ListChecks size={18} aria-hidden="true" />
                        <span>Статус</span>
                      </button>
                      <button
                        className="card-action"
                        type="button"
                        title="Редактировать"
                        aria-label="Редактировать"
                        onClick={() => openAction("edit", item)}
                      >
                        <Pencil size={18} aria-hidden="true" />
                        <span>Правка</span>
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

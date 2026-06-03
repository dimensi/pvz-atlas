"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Owner, Point } from "@/lib/data-model/types";
import { createOwnerLocal, updateOwnerLocal } from "@/lib/sync/local-actions";
import { useOnlineCachedSnapshot } from "@/lib/sync/use-online-cached-snapshot";
import { getBrandLabel, getBrandPillClassName } from "@/lib/brands";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Drawer,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle
} from "@/components/ui/drawer";
import { DrawerShell } from "@/components/ui/drawer-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SyncHealthIndicator } from "@/components/sync/SyncHealthIndicator";
import { OwnerPhoneInput } from "./OwnerPhoneInput";

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("ru-RU");
}

function sortOwners(owners: Owner[]): Owner[] {
  return [...owners].sort((left, right) =>
    left.name.localeCompare(right.name, "ru-RU", { sensitivity: "base" })
  );
}

function countPointsByOwner(points: Point[]): Record<string, number> {
  return points.reduce<Record<string, number>>((counts, point) => {
    if (point.deletedAt === null && point.ownerId) {
      counts[point.ownerId] = (counts[point.ownerId] ?? 0) + 1;
    }

    return counts;
  }, {});
}

function OwnerFields({
  comment,
  name,
  phone,
  telegram,
  onCommentChange,
  onNameChange,
  onPhoneChange,
  onTelegramChange
}: {
  comment: string;
  name: string;
  phone: string;
  telegram: string;
  onCommentChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onTelegramChange: (value: string) => void;
}) {
  return (
    <>
      <div className="ui-field">
        <Label htmlFor="owner-name">Имя</Label>
        <Input id="owner-name" value={name} onChange={(event) => onNameChange(event.target.value)} />
      </div>
      <div className="ui-field">
        <Label htmlFor="owner-phone">Телефон</Label>
        <OwnerPhoneInput id="owner-phone" value={phone} onValueChange={onPhoneChange} />
      </div>
      <div className="ui-field">
        <Label htmlFor="owner-telegram">Telegram</Label>
        <Input
          id="owner-telegram"
          value={telegram}
          onChange={(event) => onTelegramChange(event.target.value)}
        />
      </div>
      <div className="ui-field">
        <Label htmlFor="owner-comment">Комментарий</Label>
        <Textarea
          id="owner-comment"
          value={comment}
          onChange={(event) => onCommentChange(event.target.value)}
        />
      </div>
    </>
  );
}

export default function OwnersClient() {
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
  const [newOwnerName, setNewOwnerName] = useState("");
  const [newOwnerPhone, setNewOwnerPhone] = useState("");
  const [newOwnerTelegram, setNewOwnerTelegram] = useState("");
  const [newOwnerComment, setNewOwnerComment] = useState("");
  const [activeOwnerId, setActiveOwnerId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editTelegram, setEditTelegram] = useState("");
  const [editComment, setEditComment] = useState("");
  const [archiveCandidate, setArchiveCandidate] = useState<Owner | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const owners = useMemo(
    () => sortOwners(state.owners.filter((owner) => owner.deletedAt === null)),
    [state.owners]
  );
  const points = useMemo(
    () => state.points.filter((point) => point.deletedAt === null),
    [state.points]
  );
  const ownerCounts = useMemo(() => countPointsByOwner(points), [points]);
  const unassignedCount = useMemo(
    () => points.filter((point) => point.ownerId === null).length,
    [points]
  );
  const query = normalize(search);
  const filteredOwners = useMemo(
    () =>
      query
        ? owners.filter((owner) =>
            [owner.name, owner.phone, owner.telegram, owner.comment].some((field) =>
              normalize(field).includes(query)
            )
          )
        : owners,
    [owners, query]
  );
  const activeOwner = useMemo(
    () => owners.find((owner) => owner.id === activeOwnerId) ?? null,
    [activeOwnerId, owners]
  );
  const activeOwnerPoints = useMemo(
    () => points.filter((point) => point.ownerId === activeOwnerId),
    [activeOwnerId, points]
  );
  const error = mutationError ?? cacheError;

  const runMutation = async (
    mutation: () => Promise<unknown>,
    successMessage = "Сохранено на устройстве."
  ): Promise<boolean> => {
    try {
      setMutationError(null);
      setIsSaving(true);
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
      const message = caught instanceof Error ? caught.message : "Не удалось сохранить владельца.";
      setMutationError(message);
      toast.error(message);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newOwnerName.trim();
    if (!name) {
      setMutationError("Введите имя владельца.");
      return;
    }

    const saved = await runMutation(() =>
      createOwnerLocal({
        name,
        phone: newOwnerPhone.trim() || null,
        telegram: newOwnerTelegram.trim() || null,
        comment: newOwnerComment.trim() || null
      })
    );

    if (saved) {
      setNewOwnerName("");
      setNewOwnerPhone("");
      setNewOwnerTelegram("");
      setNewOwnerComment("");
    }
  };

  const openOwner = (owner: Owner) => {
    setActiveOwnerId(owner.id);
    setIsEditing(false);
    setEditName(owner.name);
    setEditPhone(owner.phone ?? "");
    setEditTelegram(owner.telegram ?? "");
    setEditComment(owner.comment ?? "");
  };

  const handleSaveOwner = async () => {
    if (!activeOwner) {
      return;
    }

    const name = editName.trim();
    if (!name) {
      setMutationError("Имя владельца обязательно.");
      return;
    }

    const patch: Partial<Pick<Owner, "name" | "phone" | "telegram" | "comment">> = {};
    if (name !== activeOwner.name) {
      patch.name = name;
    }
    if ((editPhone.trim() || null) !== activeOwner.phone) {
      patch.phone = editPhone.trim() || null;
    }
    if ((editTelegram.trim() || null) !== activeOwner.telegram) {
      patch.telegram = editTelegram.trim() || null;
    }
    if ((editComment.trim() || null) !== activeOwner.comment) {
      patch.comment = editComment.trim() || null;
    }

    if (Object.keys(patch).length === 0) {
      setIsEditing(false);
      return;
    }

    const saved = await runMutation(() => updateOwnerLocal(activeOwner.id, patch));
    if (saved) {
      setIsEditing(false);
    }
  };

  const handleArchive = async () => {
    if (!archiveCandidate || (ownerCounts[archiveCandidate.id] ?? 0) > 0) {
      setArchiveCandidate(null);
      return;
    }

    const saved = await runMutation(() =>
      updateOwnerLocal(archiveCandidate.id, { deletedAt: new Date().toISOString() })
    );
    if (saved) {
      setArchiveCandidate(null);
      setActiveOwnerId(null);
    }
  };

  return (
    <div className="page-stack owners-page">
      <section className="points-list-header">
        <div>
          <h2 className="page-title">Владельцы</h2>
          <p className="lead">Контакты и назначенные ПВЗ.</p>
        </div>
        <SyncHealthIndicator
          pendingChanges={state.pendingChanges}
          conflicts={state.conflicts}
          isOnline={isOnline}
          isRefreshing={isRefreshing}
          error={error}
        />
      </section>

      <section className="owners-summary" aria-label="Сводка владельцев">
        <div>
          <strong>{unassignedCount}</strong>
          <span>Без владельца</span>
        </div>
        <div>
          <strong>{owners.length}</strong>
          <span>Владельцев</span>
        </div>
      </section>

      <section className="list-controls" aria-label="Поиск владельцев">
        <label className="search-field">
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="Поиск владельцев"
            placeholder="Имя, телефон, Telegram..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </section>

      <form className="card form" onSubmit={handleCreate}>
        <h3>Новый владелец</h3>
        <OwnerFields
          name={newOwnerName}
          phone={newOwnerPhone}
          telegram={newOwnerTelegram}
          comment={newOwnerComment}
          onNameChange={setNewOwnerName}
          onPhoneChange={setNewOwnerPhone}
          onTelegramChange={setNewOwnerTelegram}
          onCommentChange={setNewOwnerComment}
        />
        <Button type="submit" disabled={isSaving}>
          <Plus size={18} aria-hidden="true" />
          Создать владельца
        </Button>
      </form>

      {error ? <div className="error-banner">{error}</div> : null}

      {isLoadingCache ? (
        <section className="card">
          <h3>Загрузка</h3>
          <p>Читаю данные на устройстве.</p>
        </section>
      ) : filteredOwners.length === 0 ? (
        <section className="card">
          <h3>Владельцы не найдены</h3>
          <p>Измените поиск или создайте нового владельца.</p>
        </section>
      ) : (
        <section className="section">
          <h3 className="section-title">
            <span>Список</span>
            <span>{filteredOwners.length}</span>
          </h3>
          <div className="owner-list">
            <article className="owner-card owner-card-muted">
              <div>
                <strong>Без владельца</strong>
                <span>{unassignedCount} ПВЗ</span>
              </div>
            </article>
            {filteredOwners.map((owner) => {
              const count = ownerCounts[owner.id] ?? 0;

              return (
                <article className="owner-card" key={owner.id}>
                  <button type="button" onClick={() => openOwner(owner)}>
                    <span>
                      <strong>{owner.name}</strong>
                      <small>{count} ПВЗ</small>
                    </span>
                    <Pencil size={18} aria-hidden="true" />
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <Drawer
        handleOnly
        open={Boolean(activeOwner)}
        onOpenChange={(open) => {
          if (!open) {
            setActiveOwnerId(null);
            setIsEditing(false);
          }
        }}
      >
        {activeOwner ? (
          <DrawerShell
            contentKey={activeOwner.id}
            header={
              <DrawerHeader className="text-left">
                <DrawerTitle>{activeOwner.name}</DrawerTitle>
                <DrawerDescription>
                  {`${ownerCounts[activeOwner.id] ?? 0} назначенных ПВЗ`}
                </DrawerDescription>
              </DrawerHeader>
            }
            footer={
              <DrawerFooter>
                {isEditing ? (
                  <Button type="button" disabled={isSaving} onClick={() => void handleSaveOwner()}>
                    Сохранить
                  </Button>
                ) : (
                  <Button type="button" onClick={() => setIsEditing(true)}>
                    <Pencil size={18} aria-hidden="true" />
                    Редактировать
                  </Button>
                )}
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isSaving || (ownerCounts[activeOwner.id] ?? 0) > 0}
                  onClick={() => setArchiveCandidate(activeOwner)}
                >
                  <Trash2 size={18} aria-hidden="true" />
                  Скрыть
                </Button>
                {(ownerCounts[activeOwner.id] ?? 0) > 0 ? (
                  <p className="ui-empty-note">Скрыть можно только владельца без назначенных ПВЗ.</p>
                ) : null}
              </DrawerFooter>
            }
          >
            <div className="ui-form">
              {isEditing ? (
                <OwnerFields
                  name={editName}
                  phone={editPhone}
                  telegram={editTelegram}
                  comment={editComment}
                  onNameChange={setEditName}
                  onPhoneChange={setEditPhone}
                  onTelegramChange={setEditTelegram}
                  onCommentChange={setEditComment}
                />
              ) : (
                <div className="owner-details">
                  <span>{activeOwner.phone || "Телефон не указан"}</span>
                  <span>{activeOwner.telegram || "Telegram не указан"}</span>
                  {activeOwner.comment ? <p>{activeOwner.comment}</p> : null}
                </div>
              )}

              <section className="section">
                <h3 className="section-title">
                  <span>ПВЗ</span>
                  <span>{activeOwnerPoints.length}</span>
                </h3>
                <div className="owner-point-list">
                  {activeOwnerPoints.length > 0 ? (
                    activeOwnerPoints.map((point) => (
                      <article className="missing-coordinate-item" key={point.id}>
                        <span className={getBrandPillClassName(point.brand)}>
                          {getBrandLabel(point.brand)}
                        </span>
                        <div>
                          <strong>{point.address}</strong>
                          <span>{point.city}</span>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="ui-empty-note">Назначенных ПВЗ нет.</p>
                  )}
                </div>
              </section>
            </div>
          </DrawerShell>
        ) : null}
      </Drawer>

      <AlertDialog
        open={Boolean(archiveCandidate)}
        onOpenChange={(open) => {
          if (!open) {
            setArchiveCandidate(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Скрыть владельца?</AlertDialogTitle>
            <AlertDialogDescription>
              Владелец будет скрыт на устройстве. Назначенные ПВЗ не изменятся.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isSaving}
              onClick={(event) => {
                event.preventDefault();
                void handleArchive();
              }}
            >
              <Trash2 size={18} aria-hidden="true" />
              Скрыть
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

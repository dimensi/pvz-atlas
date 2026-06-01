"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Archive, Check, Pencil, Plus, Save, Search, Trash2, Users, X } from "lucide-react";
import type { Owner, Point, PointStatus } from "@/lib/data-model/types";
import { createOwnerLocal, updateOwnerLocal, updatePointLocal } from "@/lib/sync/local-actions";
import { POINT_STATUS_LABELS } from "@/lib/points/list";
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
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type PointAction = "edit" | "owner" | "note" | "status" | "close";

export interface PointActionItem {
  point: Point;
  owner: Owner | null;
}

interface PointActionDialogsProps {
  action: PointAction | null;
  item: PointActionItem | null;
  owners: Owner[];
  ownerUsageCounts?: Record<string, number>;
  onActionChange: (action: PointAction | null) => void;
  runMutation: (mutation: () => Promise<unknown>, successMessage: string) => Promise<boolean>;
}

interface ActionFormProps {
  item: PointActionItem;
  owners: Owner[];
  ownerUsageCounts?: Record<string, number>;
  close: () => void;
  runMutation: PointActionDialogsProps["runMutation"];
}

const STATUS_OPTIONS: PointStatus[] = ["new", "active", "needs_review", "closed"];
const OWNER_NONE_VALUE = "__none__";

function sortOwners(owners: Owner[]): Owner[] {
  return [...owners].sort((left, right) =>
    left.name.localeCompare(right.name, "ru-RU", { sensitivity: "base" })
  );
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU");
}

function Field({
  children,
  error,
  id,
  label
}: {
  children: ReactNode;
  error?: string | null;
  id: string;
  label: string;
}) {
  return (
    <div className="ui-field">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="ui-field-error">{error}</p> : null}
    </div>
  );
}

function StatusSelect({
  labelledBy,
  value,
  onChange
}: {
  labelledBy?: string;
  value: PointStatus;
  onChange: (value: PointStatus) => void;
}) {
  return (
    <Select value={value} onValueChange={(nextValue) => onChange(nextValue as PointStatus)}>
      <SelectTrigger id={labelledBy} aria-labelledby={labelledBy}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map((status) => (
          <SelectItem key={status} value={status}>
            {POINT_STATUS_LABELS[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function isActionDrawer(action: PointAction | null): boolean {
  return action === "edit" || action === "owner" || action === "note" || action === "status";
}

function drawerTitle(action: PointAction | null): string {
  if (action === "edit") {
    return "Редактировать ПВЗ";
  }

  if (action === "owner") {
    return "Назначить владельца";
  }

  if (action === "note") {
    return "Заметка";
  }

  return "Изменить статус";
}

function EditPointForm({ close, item, owners, runMutation }: ActionFormProps) {
  const [brand, setBrand] = useState(item.point.brand);
  const [city, setCity] = useState(item.point.city);
  const [address, setAddress] = useState(item.point.address);
  const [status, setStatus] = useState<PointStatus>(item.point.status);
  const [ownerId, setOwnerId] = useState(item.point.ownerId ?? OWNER_NONE_VALUE);
  const [comment, setComment] = useState(item.point.comment ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const sortedOwners = useMemo(() => sortOwners(owners), [owners]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextBrand = brand.trim();
    const nextCity = city.trim();
    const nextAddress = address.trim();
    const nextComment = comment.trim() || null;
    const nextOwnerId = ownerId === OWNER_NONE_VALUE ? null : ownerId;

    if (!nextBrand || !nextCity || !nextAddress) {
      setValidationError("Заполните бренд, город и адрес.");
      return;
    }

    const patch: Partial<
      Pick<Point, "brand" | "city" | "address" | "status" | "ownerId" | "comment">
    > = {};
    if (nextBrand !== item.point.brand) {
      patch.brand = nextBrand;
    }
    if (nextCity !== item.point.city) {
      patch.city = nextCity;
    }
    if (nextAddress !== item.point.address) {
      patch.address = nextAddress;
    }
    if (status !== item.point.status) {
      patch.status = status;
    }
    if (nextOwnerId !== item.point.ownerId) {
      patch.ownerId = nextOwnerId;
    }
    if (nextComment !== item.point.comment) {
      patch.comment = nextComment;
    }

    if (Object.keys(patch).length === 0) {
      close();
      return;
    }

    setValidationError(null);
    setIsSaving(true);
    const saved = await runMutation(
      () => updatePointLocal(item.point.id, patch),
      "ПВЗ сохранен локально, изменение добавлено в очередь синхронизации."
    );
    setIsSaving(false);

    if (saved) {
      close();
    }
  };

  return (
    <form className="ui-form" onSubmit={handleSubmit}>
      <Field id="point-brand" label="Бренд">
        <Input id="point-brand" value={brand} onChange={(event) => setBrand(event.target.value)} />
      </Field>
      <Field id="point-city" label="Город">
        <Input id="point-city" value={city} onChange={(event) => setCity(event.target.value)} />
      </Field>
      <Field id="point-address" label="Адрес">
        <Input
          id="point-address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
        />
      </Field>
      <Field id="point-status-edit" label="Статус">
        <StatusSelect labelledBy="point-status-edit" value={status} onChange={setStatus} />
      </Field>
      <Field id="point-owner-edit" label="Владелец">
        <Select value={ownerId} onValueChange={setOwnerId}>
          <SelectTrigger id="point-owner-edit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={OWNER_NONE_VALUE}>Без владельца</SelectItem>
            {sortedOwners.map((owner) => (
              <SelectItem key={owner.id} value={owner.id}>
                {owner.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field id="point-comment-edit" label="Комментарий" error={validationError}>
        <Textarea
          id="point-comment-edit"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
        />
      </Field>
      <DrawerFooter>
        <Button type="submit" disabled={isSaving}>
          <Save size={18} aria-hidden="true" />
          {isSaving ? "Сохраняю..." : "Сохранить"}
        </Button>
        <Button type="button" variant="secondary" onClick={close}>
          Отмена
        </Button>
      </DrawerFooter>
    </form>
  );
}

function OwnerForm({ close, item, owners, ownerUsageCounts = {}, runMutation }: ActionFormProps) {
  const [mode, setMode] = useState<"assign" | "manage">("assign");
  const [ownerSearch, setOwnerSearch] = useState("");
  const [editingOwnerId, setEditingOwnerId] = useState<string | null>(null);
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerTelegram, setOwnerTelegram] = useState("");
  const [ownerComment, setOwnerComment] = useState("");
  const [deleteCandidate, setDeleteCandidate] = useState<Owner | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const sortedOwners = useMemo(() => sortOwners(owners), [owners]);
  const filteredOwners = useMemo(() => {
    const query = normalize(ownerSearch);
    if (!query) {
      return sortedOwners;
    }

    return sortedOwners.filter((owner) => normalize(owner.name).includes(query));
  }, [ownerSearch, sortedOwners]);
  const exactSearchOwner = useMemo(() => {
    const query = normalize(ownerSearch);
    return query ? sortedOwners.find((owner) => normalize(owner.name) === query) ?? null : null;
  }, [ownerSearch, sortedOwners]);
  const editingOwner = editingOwnerId
    ? sortedOwners.find((owner) => owner.id === editingOwnerId) ?? null
    : null;

  const startEditingOwner = (owner: Owner) => {
    setValidationError(null);
    setEditingOwnerId(owner.id);
    setOwnerName(owner.name);
    setOwnerPhone(owner.phone ?? "");
    setOwnerTelegram(owner.telegram ?? "");
    setOwnerComment(owner.comment ?? "");
  };

  const assignOwner = async (ownerId: string | null) => {
    if (ownerId === item.point.ownerId) {
      return;
    }

    setValidationError(null);
    setIsSaving(true);
    const saved = await runMutation(
      () => updatePointLocal(item.point.id, { ownerId }),
      "Владелец назначен локально, изменение добавлено в очередь синхронизации."
    );
    setIsSaving(false);

    return saved;
  };

  const handleCreateAndAssign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = ownerSearch.trim();
    if (!name) {
      setValidationError("Введите имя нового владельца.");
      return;
    }

    if (exactSearchOwner) {
      await assignOwner(exactSearchOwner.id);
      return;
    }

    setValidationError(null);
    setIsSaving(true);
    const saved = await runMutation(async () => {
      const owner = await createOwnerLocal({ name });
      await updatePointLocal(item.point.id, { ownerId: owner.id });
    }, "Владелец создан и назначен локально, изменение добавлено в очередь синхронизации.");
    setIsSaving(false);

    return saved;
  };

  const handleSaveOwner = async () => {
    if (!editingOwner) {
      return;
    }

    const nextName = ownerName.trim();
    const nextPhone = ownerPhone.trim() || null;
    const nextTelegram = ownerTelegram.trim() || null;
    const nextComment = ownerComment.trim() || null;

    if (!nextName) {
      setValidationError("Имя владельца обязательно.");
      return;
    }

    const patch: Partial<Pick<Owner, "name" | "phone" | "telegram" | "comment">> = {};
    if (nextName !== editingOwner.name) {
      patch.name = nextName;
    }
    if (nextPhone !== editingOwner.phone) {
      patch.phone = nextPhone;
    }
    if (nextTelegram !== editingOwner.telegram) {
      patch.telegram = nextTelegram;
    }
    if (nextComment !== editingOwner.comment) {
      patch.comment = nextComment;
    }

    if (Object.keys(patch).length === 0) {
      setEditingOwnerId(null);
      return;
    }

    setValidationError(null);
    setIsSaving(true);
    const saved = await runMutation(
      () => updateOwnerLocal(editingOwner.id, patch),
      "Владелец сохранен локально, изменение добавлено в очередь синхронизации."
    );
    setIsSaving(false);

    if (saved) {
      setEditingOwnerId(null);
    }
  };

  const handleArchiveOwner = async () => {
    if (!deleteCandidate) {
      return;
    }

    const usageCount = ownerUsageCounts[deleteCandidate.id] ?? 0;
    if (usageCount > 0) {
      setDeleteCandidate(null);
      setValidationError("Сначала снимите владельца со всех ПВЗ.");
      return;
    }

    setValidationError(null);
    setIsSaving(true);
    const saved = await runMutation(
      () => updateOwnerLocal(deleteCandidate.id, { deletedAt: new Date().toISOString() }),
      "Владелец скрыт локально, изменение добавлено в очередь синхронизации."
    );
    setIsSaving(false);

    if (saved) {
      setDeleteCandidate(null);
      setEditingOwnerId(null);
    }
  };

  return (
    <div className="ui-form">
      <div className="owner-dialog-tabs" role="tablist" aria-label="Режим владельцев">
        <button
          className={mode === "assign" ? "owner-dialog-tab-active" : ""}
          type="button"
          role="tab"
          aria-selected={mode === "assign"}
          onClick={() => {
            setMode("assign");
            setValidationError(null);
          }}
        >
          <Check size={16} aria-hidden="true" />
          Назначить
        </button>
        <button
          className={mode === "manage" ? "owner-dialog-tab-active" : ""}
          type="button"
          role="tab"
          aria-selected={mode === "manage"}
          onClick={() => {
            setMode("manage");
            setValidationError(null);
          }}
        >
          <Users size={16} aria-hidden="true" />
          Управление
        </button>
      </div>

      <Field id="owner-search" label="Поиск владельца">
        <div className="ui-input-with-icon">
          <Search size={18} aria-hidden="true" />
          <Input
            id="owner-search"
            placeholder="Имя владельца"
            value={ownerSearch}
            onChange={(event) => setOwnerSearch(event.target.value)}
          />
        </div>
      </Field>

      {mode === "assign" ? (
        <form className="ui-form" onSubmit={handleCreateAndAssign}>
          <div className="owner-picker" aria-label="Владелец ПВЗ">
            <button
              className={`owner-option ${item.point.ownerId === null ? "owner-option-active" : ""}`}
              type="button"
              disabled={isSaving}
              onClick={() => void assignOwner(null)}
            >
              <span>Без владельца</span>
              <span className="owner-option-icon">
                {item.point.ownerId === null ? <Check size={18} aria-hidden="true" /> : null}
              </span>
            </button>
            {filteredOwners.map((owner) => (
              <button
                className={`owner-option ${item.point.ownerId === owner.id ? "owner-option-active" : ""}`}
                key={owner.id}
                type="button"
                disabled={isSaving}
                onClick={() => void assignOwner(owner.id)}
              >
                <span>{owner.name}</span>
                <span className="owner-option-icon">
                  {item.point.ownerId === owner.id ? <Check size={18} aria-hidden="true" /> : null}
                </span>
              </button>
            ))}
            {filteredOwners.length === 0 ? (
              <p className="ui-empty-note">Владелец не найден. Создайте и назначьте его ниже.</p>
            ) : null}
          </div>
          {validationError ? <p className="ui-field-error">{validationError}</p> : null}
          <DrawerFooter>
            <Button type="submit" disabled={isSaving || !ownerSearch.trim()}>
              <Plus size={18} aria-hidden="true" />
              {isSaving
                ? "Сохраняю..."
                : exactSearchOwner
                  ? `Назначить ${exactSearchOwner.name}`
                  : "Создать и назначить"}
            </Button>
            <Button type="button" variant="secondary" onClick={close}>
              Готово
            </Button>
          </DrawerFooter>
        </form>
      ) : (
        <div className="ui-form">
          <div className="owner-picker" aria-label="Управление владельцами">
            {filteredOwners.map((owner) => {
              const usageCount = ownerUsageCounts[owner.id] ?? 0;

              return (
                <button
                  className={`owner-option ${editingOwnerId === owner.id ? "owner-option-active" : ""}`}
                  key={owner.id}
                  type="button"
                  aria-label={`${owner.name}, ${usageCount > 0 ? `${usageCount} ПВЗ` : "без ПВЗ"}`}
                  disabled={isSaving}
                  onClick={() => startEditingOwner(owner)}
                >
                  <span>
                    {owner.name}
                    <small>{usageCount > 0 ? `${usageCount} ПВЗ` : "Без ПВЗ"}</small>
                  </span>
                  <Pencil size={18} aria-hidden="true" />
                </button>
              );
            })}
            {filteredOwners.length === 0 ? (
              <p className="ui-empty-note">Владельцы не найдены.</p>
            ) : null}
          </div>

          {editingOwner ? (
            <div className="owner-editor">
              <Field id="owner-manage-name" label="Имя владельца" error={validationError}>
                <Input
                  id="owner-manage-name"
                  value={ownerName}
                  onChange={(event) => setOwnerName(event.target.value)}
                />
              </Field>
              <Field id="owner-manage-phone" label="Телефон">
                <Input
                  id="owner-manage-phone"
                  value={ownerPhone}
                  onChange={(event) => setOwnerPhone(event.target.value)}
                />
              </Field>
              <Field id="owner-manage-telegram" label="Telegram">
                <Input
                  id="owner-manage-telegram"
                  value={ownerTelegram}
                  onChange={(event) => setOwnerTelegram(event.target.value)}
                />
              </Field>
              <Field id="owner-manage-comment" label="Комментарий">
                <Textarea
                  id="owner-manage-comment"
                  value={ownerComment}
                  onChange={(event) => setOwnerComment(event.target.value)}
                />
              </Field>
              <div className="owner-editor-actions">
                <Button type="button" disabled={isSaving} onClick={() => void handleSaveOwner()}>
                  <Save size={18} aria-hidden="true" />
                  {isSaving ? "Сохраняю..." : "Сохранить"}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isSaving || (ownerUsageCounts[editingOwner.id] ?? 0) > 0}
                  onClick={() => setDeleteCandidate(editingOwner)}
                >
                  <Trash2 size={18} aria-hidden="true" />
                  Скрыть
                </Button>
                <Button type="button" variant="secondary" onClick={() => setEditingOwnerId(null)}>
                  <X size={18} aria-hidden="true" />
                  Закрыть
                </Button>
              </div>
              {(ownerUsageCounts[editingOwner.id] ?? 0) > 0 ? (
                <p className="ui-empty-note">Скрыть можно только владельца без назначенных ПВЗ.</p>
              ) : null}
            </div>
          ) : validationError ? (
            <p className="ui-field-error">{validationError}</p>
          ) : null}
          <DrawerFooter>
            <Button type="button" variant="secondary" onClick={close}>
              Готово
            </Button>
          </DrawerFooter>
        </div>
      )}

      <AlertDialog
        open={Boolean(deleteCandidate)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteCandidate(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Скрыть владельца?</AlertDialogTitle>
            <AlertDialogDescription>
              Владелец будет помечен как удаленный локально. Изменение останется в очереди
              синхронизации и не затронет ПВЗ.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isSaving}
              onClick={(event) => {
                event.preventDefault();
                void handleArchiveOwner();
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

function NoteForm({ close, item, runMutation }: Omit<ActionFormProps, "owners">) {
  const [note, setNote] = useState(item.point.comment ?? "");
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextComment = note.trim() || null;
    if (nextComment === item.point.comment) {
      close();
      return;
    }

    setIsSaving(true);
    const saved = await runMutation(
      () => updatePointLocal(item.point.id, { comment: nextComment }),
      "Заметка сохранена локально, изменение добавлено в очередь синхронизации."
    );
    setIsSaving(false);

    if (saved) {
      close();
    }
  };

  return (
    <form className="ui-form" onSubmit={handleSubmit}>
      <Field id="point-note" label="Заметка">
        <Textarea id="point-note" value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <DrawerFooter>
        <Button type="submit" disabled={isSaving}>
          <Save size={18} aria-hidden="true" />
          {isSaving ? "Сохраняю..." : "Сохранить"}
        </Button>
        <Button type="button" variant="secondary" onClick={close}>
          Отмена
        </Button>
      </DrawerFooter>
    </form>
  );
}

function StatusForm({ close, item, runMutation }: Omit<ActionFormProps, "owners">) {
  const [status, setStatus] = useState<PointStatus>(item.point.status);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === item.point.status) {
      close();
      return;
    }

    setIsSaving(true);
    const saved = await runMutation(
      () => updatePointLocal(item.point.id, { status }),
      "Статус сохранен локально, изменение добавлено в очередь синхронизации."
    );
    setIsSaving(false);

    if (saved) {
      close();
    }
  };

  return (
    <form className="ui-form" onSubmit={handleSubmit}>
      <Field id="point-status" label="Статус">
        <StatusSelect labelledBy="point-status" value={status} onChange={setStatus} />
      </Field>
      <div className={`point-status ${`point-status-${status.replace("_", "-")}`}`}>
        {POINT_STATUS_LABELS[status]}
      </div>
      <DrawerFooter>
        <Button type="submit" disabled={isSaving}>
          <Save size={18} aria-hidden="true" />
          {isSaving ? "Сохраняю..." : "Сохранить"}
        </Button>
        <Button type="button" variant="secondary" onClick={close}>
          Отмена
        </Button>
      </DrawerFooter>
    </form>
  );
}

export function PointActionDialogs({
  action,
  item,
  owners,
  ownerUsageCounts,
  onActionChange,
  runMutation
}: PointActionDialogsProps) {
  const [isClosing, setIsClosing] = useState(false);
  const close = () => onActionChange(null);

  const handleClosePoint = async () => {
    if (!item || item.point.status === "closed") {
      close();
      return;
    }

    setIsClosing(true);
    const saved = await runMutation(
      () => updatePointLocal(item.point.id, { status: "closed" }),
      "ПВЗ закрыт локально, изменение добавлено в очередь синхронизации."
    );
    setIsClosing(false);

    if (saved) {
      close();
    }
  };

  return (
    <>
      <Drawer
        open={Boolean(item) && isActionDrawer(action)}
        onOpenChange={(open) => {
          if (!open) {
            close();
          }
        }}
      >
        <DrawerContent className="mx-auto h-auto w-full max-w-[720px] overflow-y-auto border-x data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-80px)]">
          <DrawerHeader>
            <DrawerTitle>{drawerTitle(action)}</DrawerTitle>
            <DrawerDescription>
              {item ? `${item.point.brand}, ${item.point.address}` : "ПВЗ не выбран"}
            </DrawerDescription>
          </DrawerHeader>

          {action === "edit" && item ? (
            <EditPointForm
              key={`${item.point.id}-edit`}
              close={close}
              item={item}
              owners={owners}
              runMutation={runMutation}
            />
          ) : null}

          {action === "owner" && item ? (
            <OwnerForm
              key={`${item.point.id}-owner`}
              close={close}
              item={item}
              owners={owners}
              ownerUsageCounts={ownerUsageCounts}
              runMutation={runMutation}
            />
          ) : null}

          {action === "note" && item ? (
            <NoteForm
              key={`${item.point.id}-note`}
              close={close}
              item={item}
              runMutation={runMutation}
            />
          ) : null}

          {action === "status" && item ? (
            <StatusForm
              key={`${item.point.id}-status`}
              close={close}
              item={item}
              runMutation={runMutation}
            />
          ) : null}
        </DrawerContent>
      </Drawer>

      <AlertDialog
        open={Boolean(item) && action === "close"}
        onOpenChange={(open) => {
          if (!open) {
            close();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Закрыть ПВЗ?</AlertDialogTitle>
            <AlertDialogDescription>
              ПВЗ будет помечен как закрытый локально. Изменение останется в очереди
              синхронизации и может попасть в конфликт, если Google Sheets был изменен вручную.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClosing}>
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isClosing}
              onClick={(event) => {
                event.preventDefault();
                void handleClosePoint();
              }}
            >
              <Archive size={18} aria-hidden="true" />
              Закрыть ПВЗ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

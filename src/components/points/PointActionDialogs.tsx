"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Archive, Check, Plus, Save, Search, X } from "lucide-react";
import type { Owner, Point, PointStatus } from "@/lib/data-model/types";
import { createOwnerLocal, updatePointLocal } from "@/lib/sync/local-actions";
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
  onActionChange: (action: PointAction | null) => void;
  runMutation: (mutation: () => Promise<unknown>, successMessage: string) => Promise<boolean>;
}

interface ActionFormProps {
  item: PointActionItem;
  owners: Owner[];
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

function OwnerForm({ close, item, owners, runMutation }: ActionFormProps) {
  const [ownerSearch, setOwnerSearch] = useState("");
  const [selectedOwnerId, setSelectedOwnerId] = useState(item.point.ownerId ?? OWNER_NONE_VALUE);
  const [newOwnerName, setNewOwnerName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const sortedOwners = useMemo(() => sortOwners(owners), [owners]);
  const filteredOwners = useMemo(() => {
    const query = normalize(ownerSearch);
    if (!query) {
      return sortedOwners;
    }

    return sortedOwners.filter((owner) => normalize(owner.name).includes(query));
  }, [ownerSearch, sortedOwners]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedNewOwnerName = newOwnerName.trim();
    const nextOwnerId = selectedOwnerId === OWNER_NONE_VALUE ? null : selectedOwnerId;

    if (!trimmedNewOwnerName && nextOwnerId === item.point.ownerId) {
      close();
      return;
    }

    setIsSaving(true);
    const saved = await runMutation(async () => {
      if (trimmedNewOwnerName) {
        const owner = await createOwnerLocal({ name: trimmedNewOwnerName });
        await updatePointLocal(item.point.id, { ownerId: owner.id });
        return;
      }

      await updatePointLocal(item.point.id, { ownerId: nextOwnerId });
    }, "Владелец сохранен локально, изменение добавлено в очередь синхронизации.");
    setIsSaving(false);

    if (saved) {
      close();
    }
  };

  return (
    <form className="ui-form" onSubmit={handleSubmit}>
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
      <div className="owner-picker" role="radiogroup" aria-label="Владелец ПВЗ">
        <button
          className={`owner-option ${selectedOwnerId === OWNER_NONE_VALUE ? "owner-option-active" : ""}`}
          type="button"
          role="radio"
          aria-checked={selectedOwnerId === OWNER_NONE_VALUE}
          onClick={() => setSelectedOwnerId(OWNER_NONE_VALUE)}
        >
          <span>Без владельца</span>
          {selectedOwnerId === OWNER_NONE_VALUE ? <Check size={18} aria-hidden="true" /> : null}
        </button>
        {filteredOwners.map((owner) => (
          <button
            className={`owner-option ${selectedOwnerId === owner.id ? "owner-option-active" : ""}`}
            key={owner.id}
            type="button"
            role="radio"
            aria-checked={selectedOwnerId === owner.id}
            onClick={() => setSelectedOwnerId(owner.id)}
          >
            <span>{owner.name}</span>
            {selectedOwnerId === owner.id ? <Check size={18} aria-hidden="true" /> : null}
          </button>
        ))}
        {filteredOwners.length === 0 ? (
          <p className="ui-empty-note">Владелец не найден. Создайте нового ниже.</p>
        ) : null}
      </div>
      <Field id="new-owner-name" label="Новый владелец">
        <Input
          id="new-owner-name"
          placeholder="Создать и назначить"
          value={newOwnerName}
          onChange={(event) => setNewOwnerName(event.target.value)}
        />
      </Field>
      <DrawerFooter>
        <Button type="submit" disabled={isSaving}>
          {newOwnerName.trim() ? (
            <Plus size={18} aria-hidden="true" />
          ) : (
            <Save size={18} aria-hidden="true" />
          )}
          {isSaving ? "Сохраняю..." : "Сохранить"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setSelectedOwnerId(OWNER_NONE_VALUE);
            setNewOwnerName("");
          }}
        >
          <X size={18} aria-hidden="true" />
          Очистить владельца
        </Button>
        <Button type="button" variant="secondary" onClick={close}>
          Отмена
        </Button>
      </DrawerFooter>
    </form>
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

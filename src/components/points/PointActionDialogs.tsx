"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Check, Plus, Save, Search, Trash2, UserMinus } from "lucide-react";
import type { Owner, Point, PointStatus } from "@/lib/data-model/types";
import {
  BRAND_OPTIONS,
  canonicalizeBrand,
  getBrandLabel,
  getStoredBrand,
  type BrandId
} from "@/lib/brands";
import { normalizeAddressPart } from "@/lib/data-model/source-key";
import { createOwnerLocal, updatePointLocal } from "@/lib/sync/local-actions";
import { parsePointCoordinatesText } from "@/lib/points/coordinates";
import {
  PointDetailsContent,
  type PointDetailsVisibleActions
} from "@/components/points/PointDetailsContent";
import { PointStatusPicker } from "@/components/points/PointStatusPicker";
import { OwnerPhoneInput } from "@/components/owners/OwnerPhoneInput";
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

export type PointAction = "details" | "edit" | "owner" | "note";

export interface PointActionItem {
  point: Point;
  owner: Owner | null;
}

export interface PointActionDialogsProps {
  action: PointAction | null;
  item: PointActionItem | null;
  owners: Owner[];
  distanceLabel?: string | null;
  routeUrl?: string | null;
  visibleDetailActions?: PointDetailsVisibleActions;
  onActionChange: (action: PointAction | null) => void;
  runMutation: (mutation: () => Promise<unknown>, successMessage: string) => Promise<boolean>;
}

interface ActionFormProps {
  item: PointActionItem;
  owners: Owner[];
  close: () => void;
  runMutation: PointActionDialogsProps["runMutation"];
}

const OWNER_NONE_VALUE = "__none__";
const COORDINATE_ERROR_ID = "point-coordinates-edit-error";

function sortOwners(owners: Owner[]): Owner[] {
  return [...owners].sort((left, right) =>
    left.name.localeCompare(right.name, "ru-RU", { sensitivity: "base" })
  );
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU");
}

function formatCoordinateInput(point: Pick<Point, "lat" | "lon">): string {
  if (point.lat === null && point.lon === null) {
    return "";
  }

  return `${point.lat ?? ""}, ${point.lon ?? ""}`;
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

function BrandSelect({
  labelledBy,
  value,
  onChange
}: {
  labelledBy?: string;
  value: BrandId;
  onChange: (value: BrandId) => void;
}) {
  return (
    <Select value={value} onValueChange={(nextValue) => onChange(nextValue as BrandId)}>
      <SelectTrigger id={labelledBy} aria-labelledby={labelledBy}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {BRAND_OPTIONS.map((brand) => (
          <SelectItem key={brand.id} value={brand.id}>
            {brand.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function isActionDrawer(action: PointAction | null): boolean {
  return action === "details" || action === "edit" || action === "owner" || action === "note";
}

function drawerTitle(action: PointAction | null): string {
  if (action === "details") {
    return "Действия";
  }

  if (action === "edit") {
    return "Редактировать ПВЗ";
  }

  if (action === "owner") {
    return "Назначить владельца";
  }

  return "Заметка";
}

function EditPointForm({ close, item, owners, runMutation }: ActionFormProps) {
  const initialCanonicalBrand = canonicalizeBrand(item.point.brand);
  const [brand, setBrand] = useState<BrandId>(initialCanonicalBrand ?? "other");
  const [city, setCity] = useState(item.point.city);
  const [address, setAddress] = useState(item.point.address);
  const [status, setStatus] = useState<PointStatus>(item.point.status);
  const [ownerId, setOwnerId] = useState(item.point.ownerId ?? OWNER_NONE_VALUE);
  const [comment, setComment] = useState(item.point.comment ?? "");
  const [coordinates, setCoordinates] = useState(formatCoordinateInput(item.point));
  const [coordinatesTouched, setCoordinatesTouched] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [coordinateValidationError, setCoordinateValidationError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const sortedOwners = useMemo(() => sortOwners(owners), [owners]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextBrand =
      brand === "other" && initialCanonicalBrand === null ? item.point.brand : getStoredBrand(brand);
    const nextCity = city.trim();
    const nextAddress = address.trim();
    const nextComment = comment.trim() || null;
    const nextOwnerId = ownerId === OWNER_NONE_VALUE ? null : ownerId;
    const parsedCoordinates = coordinatesTouched ? parsePointCoordinatesText(coordinates) : null;

    if (!nextBrand || !nextCity || !nextAddress) {
      setValidationError("Заполните бренд, город и адрес.");
      setCoordinateValidationError(false);
      return;
    }

    if (parsedCoordinates && !parsedCoordinates.ok) {
      setValidationError(parsedCoordinates.message);
      setCoordinateValidationError(true);
      return;
    }

    const nextLat = parsedCoordinates?.coordinates?.lat ?? null;
    const nextLon = parsedCoordinates?.coordinates?.lon ?? null;

    const patch: Partial<
      Pick<
        Point,
        | "brand"
        | "city"
        | "address"
        | "normalizedCity"
        | "normalizedAddress"
        | "status"
        | "ownerId"
        | "lat"
        | "lon"
        | "comment"
      >
    > = {};
    if (nextBrand !== item.point.brand) {
      patch.brand = nextBrand;
    }
    if (nextCity !== item.point.city) {
      patch.city = nextCity;
      patch.normalizedCity = normalizeAddressPart(nextCity);
    }
    if (nextAddress !== item.point.address) {
      patch.address = nextAddress;
      patch.normalizedAddress = normalizeAddressPart(nextAddress);
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
    if (coordinatesTouched && nextLat !== item.point.lat) {
      patch.lat = nextLat;
    }
    if (coordinatesTouched && nextLon !== item.point.lon) {
      patch.lon = nextLon;
    }

    if (Object.keys(patch).length === 0) {
      close();
      return;
    }

    setValidationError(null);
    setCoordinateValidationError(false);
    setIsSaving(true);
    const saved = await runMutation(
      () => updatePointLocal(item.point.id, patch),
      "Сохранено на устройстве."
    );
    setIsSaving(false);

    if (saved) {
      close();
    }
  };

  return (
    <form className="ui-form" onSubmit={handleSubmit}>
      <Field id="point-brand" label="Бренд">
        <BrandSelect labelledBy="point-brand" value={brand} onChange={setBrand} />
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
        <PointStatusPicker value={status} onSelect={setStatus} />
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
      <Field id="point-coordinates-edit" label="Координаты">
        <Input
          id="point-coordinates-edit"
          aria-describedby={coordinateValidationError ? COORDINATE_ERROR_ID : undefined}
          aria-invalid={coordinateValidationError}
          autoCapitalize="off"
          autoCorrect="off"
          inputMode="text"
          placeholder="Широта, долгота или ссылка из карт"
          spellCheck={false}
          value={coordinates}
          onChange={(event) => {
            setCoordinatesTouched(true);
            setCoordinates(event.target.value);
          }}
        />
      </Field>
      {validationError ? (
        <p
          className="ui-field-error"
          id={coordinateValidationError ? COORDINATE_ERROR_ID : undefined}
          role="alert"
        >
          {validationError}
        </p>
      ) : null}
      <Field id="point-comment-edit" label="Комментарий">
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
  const [ownerPhone, setOwnerPhone] = useState("");
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

  const assignOwner = async (ownerId: string | null) => {
    if (ownerId === item.point.ownerId) {
      close();
      return;
    }

    setValidationError(null);
    setIsSaving(true);
    const saved = await runMutation(
      () => updatePointLocal(item.point.id, { ownerId }),
      "Сохранено на устройстве."
    );
    setIsSaving(false);

    if (saved) {
      close();
    }
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
      const owner = await createOwnerLocal({ name, phone: ownerPhone.trim() || null });
      await updatePointLocal(item.point.id, { ownerId: owner.id });
    }, "Сохранено на устройстве.");
    setIsSaving(false);

    if (saved) {
      close();
    }
  };

  return (
    <div className="ui-form">
      {item.point.ownerId !== null ? (
        <div className="flex justify-end mb-4">
          <Button
            type="button"
            variant="destructive"
            disabled={isSaving}
            onClick={() => void assignOwner(null)}
          >
            <UserMinus size={18} className="mr-2" aria-hidden="true" />
            Сбросить владельца
          </Button>
        </div>
      ) : null}

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

      {!exactSearchOwner && ownerSearch.trim().length > 0 ? (
        <Field id="owner-phone-new" label="Телефон (опционально)">
          <OwnerPhoneInput id="owner-phone-new" value={ownerPhone} onValueChange={setOwnerPhone} />
        </Field>
      ) : null}

      <form className="ui-form" onSubmit={handleCreateAndAssign}>
        <div className="owner-picker" aria-label="Владелец ПВЗ">
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
            <Plus size={18} className="mr-2" aria-hidden="true" />
            {isSaving
              ? "Сохраняю..."
              : exactSearchOwner
                ? `Назначить ${exactSearchOwner.name}`
                : "Создать и назначить"}
          </Button>
          <Button type="button" variant="secondary" onClick={close}>
            Отмена
          </Button>
        </DrawerFooter>
      </form>
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
      "Сохранено на устройстве."
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

function DetailsForm({
  close,
  distanceLabel,
  item,
  routeUrl,
  runMutation,
  setAction,
  visibleDetailActions
}: ActionFormProps & {
  distanceLabel?: string | null;
  routeUrl?: string | null;
  setAction: (action: PointAction) => void;
  visibleDetailActions: PointDetailsVisibleActions;
}) {
  const [isSavingStatus, setIsSavingStatus] = useState(false);

  const handleStatusSelect = async (nextStatus: PointStatus) => {
    if (nextStatus === item.point.status) {
      return;
    }

    setIsSavingStatus(true);
    await runMutation(
      () => updatePointLocal(item.point.id, { status: nextStatus }),
      "Сохранено на устройстве."
    );
    setIsSavingStatus(false);
  };

  return (
    <PointDetailsContent
      point={item.point}
      owner={item.owner}
      distanceLabel={distanceLabel}
      routeUrl={routeUrl}
      isSavingStatus={isSavingStatus}
      visibleActions={visibleDetailActions}
      onStatusSelect={handleStatusSelect}
      onAssignOwner={() => setAction("owner")}
      onEdit={() => setAction("edit")}
      onNote={() => setAction("note")}
      onClose={close}
    />
  );
}

export function PointActionDialogs({
  action,
  item,
  owners,
  distanceLabel,
  routeUrl,
  visibleDetailActions,
  onActionChange,
  runMutation
}: PointActionDialogsProps) {
  const close = () => onActionChange(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const resolvedDetailActions: PointDetailsVisibleActions = {
    route: false,
    assignOwner: false,
    note: true,
    edit: true,
    ...visibleDetailActions
  };

  const handleDelete = async () => {
    if (!item) return;
    setIsDeleting(true);
    const saved = await runMutation(
      () => updatePointLocal(item.point.id, { deletedAt: new Date().toISOString() }),
      "ПВЗ удален."
    );
    setIsDeleting(false);
    if (saved) {
      setShowDeleteConfirm(false);
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
        <DrawerContent className="point-drawer-content mx-auto h-auto w-full max-w-[720px] border-x data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-80px)]">
          <div className="flex-1 overflow-y-auto">
            <DrawerHeader className="flex flex-row items-start justify-between">
              <div>
                <DrawerTitle>{drawerTitle(action)}</DrawerTitle>
                <DrawerDescription className="sr-only">
                  {item ? `${getBrandLabel(item.point.brand)}, ${item.point.address}` : "ПВЗ не выбран"}
                </DrawerDescription>
              </div>
              {action === "details" && item ? (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                  onClick={() => setShowDeleteConfirm(true)}
                  aria-label="Удалить ПВЗ"
                >
                  <Trash2 size={20} />
                </Button>
              ) : null}
            </DrawerHeader>

            {action === "details" && item ? (
              <DetailsForm
                key={`${item.point.id}-details`}
                close={close}
                item={item}
                owners={owners}
                distanceLabel={distanceLabel}
                routeUrl={routeUrl}
                runMutation={runMutation}
                setAction={onActionChange}
                visibleDetailActions={resolvedDetailActions}
              />
            ) : null}

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
          </div>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить ПВЗ?</AlertDialogTitle>
            <AlertDialogDescription>
              ПВЗ будет скрыт на устройстве. Это действие можно отменить только пересинхронизацией.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

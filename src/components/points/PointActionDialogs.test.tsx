import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Owner, Point } from "@/lib/data-model/types";
import { PointActionDialogs } from "./PointActionDialogs";

vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DrawerFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  AlertDialogAction: ({
    children,
    onClick
  }: {
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
  }) => <button onClick={onClick}>{children}</button>,
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>
}));

const localActionMocks = vi.hoisted(() => ({
  createOwnerLocal: vi.fn(),
  updateOwnerLocal: vi.fn(),
  updatePointLocal: vi.fn()
}));

vi.mock("@/lib/sync/local-actions", () => ({
  createOwnerLocal: (...args: unknown[]) => localActionMocks.createOwnerLocal(...args),
  updateOwnerLocal: (...args: unknown[]) => localActionMocks.updateOwnerLocal(...args),
  updatePointLocal: (...args: unknown[]) => localActionMocks.updatePointLocal(...args)
}));

const point: Point = {
  id: "point-1",
  sourceKey: "ozon|vidnoe|green-9",
  brand: "ozon",
  city: "Видное",
  address: "Зеленые Аллеи, 9",
  normalizedCity: "видное",
  normalizedAddress: "зеленые аллеи 9",
  ownerId: null,
  status: "new",
  lat: null,
  lon: null,
  comment: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  version: 1
};

const owner = (overrides: Partial<Owner> & Pick<Owner, "id" | "name">): Owner => ({
  phone: null,
  telegram: null,
  comment: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  version: 1,
  ...overrides
});

function renderOwnerDialog({
  owners = []
}: {
  owners?: Owner[];
} = {}) {
  const runMutation = vi.fn(async (mutation: () => Promise<unknown>) => {
    await mutation();
    return true;
  });
  const onActionChange = vi.fn();

  render(
    <PointActionDialogs
      action="owner"
      item={{ point, owner: null }}
      owners={owners}
      onActionChange={onActionChange}
      runMutation={runMutation}
    />
  );

  return { onActionChange, runMutation };
}

function renderEditDialog({
  pointOverride = {}
}: {
  pointOverride?: Partial<Point>;
} = {}) {
  const runMutation = vi.fn(async (mutation: () => Promise<unknown>) => {
    await mutation();
    return true;
  });
  const onActionChange = vi.fn();

  render(
    <PointActionDialogs
      action="edit"
      item={{ point: { ...point, ...pointOverride }, owner: null }}
      owners={[]}
      onActionChange={onActionChange}
      runMutation={runMutation}
    />
  );

  return { onActionChange, runMutation };
}

function renderDetailsDialog() {
  const runMutation = vi.fn(async (mutation: () => Promise<unknown>) => {
    await mutation();
    return true;
  });
  const onActionChange = vi.fn();

  render(
    <PointActionDialogs
      action="details"
      item={{ point, owner: null }}
      owners={[]}
      onActionChange={onActionChange}
      runMutation={runMutation}
    />
  );

  return { onActionChange, runMutation };
}

describe("PointActionDialogs details flow", () => {
  beforeEach(() => {
    localActionMocks.updatePointLocal.mockReset();
  });

  it("saves status immediately from the inline picker", async () => {
    localActionMocks.updatePointLocal.mockResolvedValue({ ...point, status: "active" });

    renderDetailsDialog();
    fireEvent.click(screen.getByRole("button", { name: "Активный" }));

    await waitFor(() => {
      expect(localActionMocks.updatePointLocal).toHaveBeenCalledWith("point-1", {
        status: "active"
      });
    });
  });
});

describe("PointActionDialogs owner flow", () => {
  beforeEach(() => {
    localActionMocks.createOwnerLocal.mockReset();
    localActionMocks.updateOwnerLocal.mockReset();
    localActionMocks.updatePointLocal.mockReset();
  });

  it("creates a new owner and assigns it to the point in the same mutation", async () => {
    localActionMocks.createOwnerLocal.mockResolvedValue(owner({ id: "owner-new", name: "Иван" }));
    localActionMocks.updatePointLocal.mockResolvedValue({ ...point, ownerId: "owner-new" });

    const { onActionChange } = renderOwnerDialog();

    fireEvent.change(screen.getByLabelText("Поиск владельца"), {
      target: { value: "Иван" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Создать и назначить" }));

    await waitFor(() => {
      expect(localActionMocks.createOwnerLocal).toHaveBeenCalledWith({ name: "Иван" });
      expect(localActionMocks.updatePointLocal).toHaveBeenCalledWith("point-1", {
        ownerId: "owner-new"
      });
    });
    expect(onActionChange).not.toHaveBeenCalled();
  });

  it("assigns an existing owner immediately when tapped", async () => {
    localActionMocks.updatePointLocal.mockResolvedValue({ ...point, ownerId: "owner-1" });

    const { onActionChange } = renderOwnerDialog({
      owners: [owner({ id: "owner-1", name: "Анна" })]
    });

    fireEvent.click(screen.getByRole("button", { name: "Анна" }));

    await waitFor(() => {
      expect(localActionMocks.updatePointLocal).toHaveBeenCalledWith("point-1", {
        ownerId: "owner-1"
      });
    });
    expect(localActionMocks.createOwnerLocal).not.toHaveBeenCalled();
    expect(onActionChange).not.toHaveBeenCalled();
  });

  it("does not expose owner management from the point owner drawer", () => {
    renderOwnerDialog({
      owners: [owner({ id: "owner-1", name: "Анна" })]
    });

    expect(screen.queryByRole("tab", { name: "Управление" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Скрыть" })).toBeNull();
    expect(localActionMocks.updateOwnerLocal).not.toHaveBeenCalled();
  });
});

describe("PointActionDialogs edit flow", () => {
  beforeEach(() => {
    localActionMocks.createOwnerLocal.mockReset();
    localActionMocks.updateOwnerLocal.mockReset();
    localActionMocks.updatePointLocal.mockReset();
  });

  it("saves pasted coordinates through the local point patch", async () => {
    localActionMocks.updatePointLocal.mockResolvedValue({
      ...point,
      lat: 55.123,
      lon: 37.123
    });

    renderEditDialog();

    fireEvent.change(screen.getByLabelText("Координаты"), {
      target: { value: "https://example.test/maps?ll=37.123,55.123" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => {
      expect(localActionMocks.updatePointLocal).toHaveBeenCalledWith("point-1", {
        lat: 55.123,
        lon: 37.123
      });
    });
  });

  it("saves a manual coordinate pair through the local point patch", async () => {
    localActionMocks.updatePointLocal.mockResolvedValue({
      ...point,
      lat: 55.456,
      lon: 37.456
    });

    renderEditDialog();

    fireEvent.change(screen.getByLabelText("Координаты"), {
      target: { value: "55.456, 37.456" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => {
      expect(localActionMocks.updatePointLocal).toHaveBeenCalledWith("point-1", {
        lat: 55.456,
        lon: 37.456
      });
    });
  });

  it("clears existing coordinates when the coordinate field is emptied", async () => {
    localActionMocks.updatePointLocal.mockResolvedValue({
      ...point,
      lat: null,
      lon: null
    });

    renderEditDialog({ pointOverride: { lat: 55.123, lon: 37.123 } });

    fireEvent.change(screen.getByLabelText("Координаты"), {
      target: { value: "" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => {
      expect(localActionMocks.updatePointLocal).toHaveBeenCalledWith("point-1", {
        lat: null,
        lon: null
      });
    });
  });

  it("does not save an invalid coordinate patch", async () => {
    renderEditDialog();

    fireEvent.change(screen.getByLabelText("Координаты"), {
      target: { value: "100, 37.123" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(
      await screen.findByText(
        "Координаты должны быть числами: широта от -90 до 90, долгота от -180 до 180."
      )
    ).toBeTruthy();
    expect(screen.getByLabelText("Координаты").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("Координаты").getAttribute("aria-describedby")).toBe(
      "point-coordinates-edit-error"
    );
    expect(localActionMocks.updatePointLocal).not.toHaveBeenCalled();
  });

  it("does not include unchanged full coordinates in unrelated edits", async () => {
    localActionMocks.updatePointLocal.mockResolvedValue({
      ...point,
      lat: 55.123,
      lon: 37.123,
      comment: "Новая заметка"
    });

    renderEditDialog({ pointOverride: { lat: 55.123, lon: 37.123 } });

    fireEvent.change(screen.getByLabelText("Комментарий"), {
      target: { value: "Новая заметка" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => {
      expect(localActionMocks.updatePointLocal).toHaveBeenCalledWith("point-1", {
        comment: "Новая заметка"
      });
    });
  });

  it("preserves untouched partial existing coordinates during unrelated edits", async () => {
    localActionMocks.updatePointLocal.mockResolvedValue({
      ...point,
      lat: 55.123,
      lon: null,
      comment: "Новая заметка"
    });

    renderEditDialog({ pointOverride: { lat: 55.123, lon: null } });

    fireEvent.change(screen.getByLabelText("Комментарий"), {
      target: { value: "Новая заметка" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => {
      expect(localActionMocks.updatePointLocal).toHaveBeenCalledWith("point-1", {
        comment: "Новая заметка"
      });
    });
  });

  it("preserves untouched longitude-only partial coordinates during unrelated edits", async () => {
    localActionMocks.updatePointLocal.mockResolvedValue({
      ...point,
      lat: null,
      lon: 37.123,
      comment: "Новая заметка"
    });

    renderEditDialog({ pointOverride: { lat: null, lon: 37.123 } });

    fireEvent.change(screen.getByLabelText("Комментарий"), {
      target: { value: "Новая заметка" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => {
      expect(localActionMocks.updatePointLocal).toHaveBeenCalledWith("point-1", {
        comment: "Новая заметка"
      });
    });
  });
});

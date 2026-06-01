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
  owners = [],
  ownerUsageCounts = {}
}: {
  owners?: Owner[];
  ownerUsageCounts?: Record<string, number>;
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
      ownerUsageCounts={ownerUsageCounts}
      onActionChange={onActionChange}
      runMutation={runMutation}
    />
  );

  return { onActionChange, runMutation };
}

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

  it("edits owners from the manage tab and blocks hiding owners with points", async () => {
    localActionMocks.updateOwnerLocal.mockResolvedValue(
      owner({ id: "owner-1", name: "Анна Петрова" })
    );

    renderOwnerDialog({
      owners: [owner({ id: "owner-1", name: "Анна" })],
      ownerUsageCounts: { "owner-1": 2 }
    });

    fireEvent.click(screen.getByRole("tab", { name: "Управление" }));
    fireEvent.click(screen.getByRole("button", { name: "Анна, 2 ПВЗ" }));
    expect((screen.getByRole("button", { name: "Скрыть" }) as HTMLButtonElement).disabled).toBe(
      true
    );

    fireEvent.change(screen.getByLabelText("Имя владельца"), {
      target: { value: "Анна Петрова" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => {
      expect(localActionMocks.updateOwnerLocal).toHaveBeenCalledWith("owner-1", {
        name: "Анна Петрова"
      });
    });
  });
});

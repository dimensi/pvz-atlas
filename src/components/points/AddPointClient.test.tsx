import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AddPointClient from "./AddPointClient";

const localActionMocks = vi.hoisted(() => ({
  createPointLocal: vi.fn()
}));

vi.mock("@/lib/sync/local-actions", () => ({
  createPointLocal: (...args: unknown[]) => localActionMocks.createPointLocal(...args)
}));

describe("AddPointClient", () => {
  beforeEach(() => {
    localActionMocks.createPointLocal.mockReset();
    localActionMocks.createPointLocal.mockResolvedValue({});
  });

  it("defaults city and saves canonical brand plus pasted coordinates locally", async () => {
    render(<AddPointClient />);

    expect((screen.getByLabelText("Город") as HTMLInputElement).value).toBe("Видное");

    fireEvent.change(screen.getByLabelText("Адрес"), {
      target: { value: "Зеленые Аллеи, 9" }
    });
    fireEvent.change(screen.getByLabelText("Координаты"), {
      target: { value: "https://example.test/maps?ll=37.123,55.123" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => {
      expect(localActionMocks.createPointLocal).toHaveBeenCalledWith({
        brand: "ozon",
        city: "Видное",
        address: "Зеленые Аллеи, 9",
        lat: 55.123,
        lon: 37.123,
        comment: null
      });
    });
    expect(screen.getByText("Сохранено на устройстве.")).toBeTruthy();
  });

  it("keeps free text address input without requesting suggestions", () => {
    render(<AddPointClient />);

    fireEvent.change(screen.getByLabelText("Адрес"), {
      target: { value: "з" }
    });

    expect((screen.getByLabelText("Адрес") as HTMLInputElement).value).toBe("з");
  });
});

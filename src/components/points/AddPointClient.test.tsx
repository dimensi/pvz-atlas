import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AddPointClient from "./AddPointClient";

const localActionMocks = vi.hoisted(() => ({
  createPointLocal: vi.fn(),
  suggestAddresses: vi.fn()
}));

vi.mock("@/lib/sync/local-actions", () => ({
  createPointLocal: (...args: unknown[]) => localActionMocks.createPointLocal(...args)
}));

vi.mock("@/lib/api/address-api", () => ({
  suggestAddresses: (...args: unknown[]) => localActionMocks.suggestAddresses(...args)
}));

describe("AddPointClient", () => {
  beforeEach(() => {
    localActionMocks.createPointLocal.mockReset();
    localActionMocks.createPointLocal.mockResolvedValue({});
    localActionMocks.suggestAddresses.mockReset();
    localActionMocks.suggestAddresses.mockResolvedValue({ suggestions: [] });
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

  it("keeps free text while typing before suggestions are available", () => {
    render(<AddPointClient />);

    fireEvent.change(screen.getByLabelText("Адрес"), {
      target: { value: "з" }
    });

    expect((screen.getByLabelText("Адрес") as HTMLInputElement).value).toBe("з");
    expect(localActionMocks.suggestAddresses).not.toHaveBeenCalled();
  });

  it("fills address, city, and coordinates from a selected DaData suggestion", async () => {
    localActionMocks.suggestAddresses.mockResolvedValue({
      suggestions: [
        {
          value: "г Видное, ул Зеленые Аллеи, д 9",
          unrestrictedValue: "142701, Московская обл, г Видное, ул Зеленые Аллеи, д 9",
          city: "Видное",
          address: "ул Зеленые Аллеи, д 9",
          lat: 55.551,
          lon: 37.708,
          geoQuality: 0
        }
      ]
    });
    render(<AddPointClient />);

    fireEvent.change(screen.getByLabelText("Адрес"), {
      target: { value: "зеленые аллеи 9" }
    });

    await waitFor(() => {
      expect(localActionMocks.suggestAddresses).toHaveBeenCalledWith({
        query: "зеленые аллеи 9",
        city: "Видное"
      });
    });

    fireEvent.click(await screen.findByRole("option", { name: /Зеленые Аллеи/ }));
    expect((screen.getByLabelText("Город") as HTMLInputElement).value).toBe("Видное");
    expect((screen.getByLabelText("Адрес") as HTMLInputElement).value).toBe(
      "ул Зеленые Аллеи, д 9"
    );
    expect((screen.getByLabelText("Координаты") as HTMLInputElement).value).toBe(
      "55.551, 37.708"
    );

    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => {
      expect(localActionMocks.createPointLocal).toHaveBeenCalledWith({
        brand: "ozon",
        city: "Видное",
        address: "ул Зеленые Аллеи, д 9",
        lat: 55.551,
        lon: 37.708,
        comment: null
      });
    });
  });

  it("clears stale coordinates when selected suggestion has no coordinates", async () => {
    localActionMocks.suggestAddresses
      .mockResolvedValueOnce({
        suggestions: [
          {
            value: "г Видное, ул Зеленые Аллеи, д 9",
            unrestrictedValue: "142701, Московская обл, г Видное, ул Зеленые Аллеи, д 9",
            city: "Видное",
            address: "ул Зеленые Аллеи, д 9",
            lat: 55.551,
            lon: 37.708,
            geoQuality: null
          }
        ]
      })
      .mockResolvedValueOnce({
        suggestions: [
          {
            value: "г Видное, ул Без Координат, д 1",
            unrestrictedValue: "142701, Московская обл, г Видное, ул Без Координат, д 1",
            city: "Видное",
            address: "ул Без Координат, д 1",
            lat: null,
            lon: null,
            geoQuality: null
          }
        ]
      });
    render(<AddPointClient />);

    fireEvent.change(screen.getByLabelText("Адрес"), {
      target: { value: "зеленые аллеи 9" }
    });
    fireEvent.click(await screen.findByRole("option", { name: /Зеленые Аллеи/ }));
    expect((screen.getByLabelText("Координаты") as HTMLInputElement).value).toBe(
      "55.551, 37.708"
    );

    fireEvent.change(screen.getByLabelText("Адрес"), {
      target: { value: "без координат 1" }
    });
    fireEvent.click(await screen.findByRole("option", { name: /Без Координат/ }));

    expect((screen.getByLabelText("Координаты") as HTMLInputElement).value).toBe("");
  });
});

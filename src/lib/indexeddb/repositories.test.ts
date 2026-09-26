import { describe, expect, it, vi } from "vitest";
import type { PvzDatabase } from "./db";
import { createPoint } from "./repositories";

describe("local edits while a source review is pending", () => {
  it("marks a genuinely empty device before its first offline creation", async () => {
    const metadata = new Map<string, unknown>();
    const addPoint = vi.fn();
    const addChange = vi.fn();
    const database = {
      points: { count: vi.fn().mockResolvedValue(0), add: addPoint },
      owners: { count: vi.fn().mockResolvedValue(0) },
      visits: { count: vi.fn().mockResolvedValue(0) },
      changes: { count: vi.fn().mockResolvedValue(0), add: addChange },
      meta: {
        get: vi.fn(async (key: string) => metadata.get(key)),
        put: vi.fn(async (entry: { key: string; value: unknown }) => { metadata.set(entry.key, entry); })
      },
      transaction: async (...args: unknown[]) => {
        const callback = args.at(-1);
        if (typeof callback !== "function") throw new Error("missing transaction callback");
        return callback();
      }
    } as unknown as PvzDatabase;

    await createPoint({ brand: "ozon", city: "Москва", address: "Новая, 1" }, { database });

    expect(metadata.get("firstOfflineDraft")).toMatchObject({ value: true });
    expect(addPoint).toHaveBeenCalledOnce();
    expect(addChange.mock.calls[0]?.[0].sourceId).toBeUndefined();
  });

  it("does not create a point in a cache waiting to switch spreadsheets", async () => {
    const addPoint = vi.fn();
    const addChange = vi.fn();
    const database = {
      points: { add: addPoint },
      changes: { add: addChange },
      meta: { get: vi.fn().mockResolvedValue({ key: "stagedServerSnapshot" }) },
      transaction: async (...args: unknown[]) => {
        const callback = args.at(-1);
        if (typeof callback !== "function") throw new Error("missing transaction callback");
        return callback();
      }
    } as unknown as PvzDatabase;

    await expect(createPoint({ brand: "ozon", city: "Москва", address: "Новая, 1" }, {
      database
    })).rejects.toThrow("Сначала обновите данные из таблицы");
    expect(addPoint).not.toHaveBeenCalled();
    expect(addChange).not.toHaveBeenCalled();
  });
});

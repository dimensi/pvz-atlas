import { afterEach, describe, expect, it, vi } from "vitest";

const createPoint = vi.fn();
const updatePointPatch = vi.fn();
const updateVisitPatch = vi.fn();

vi.mock("@/lib/indexeddb/repositories", () => ({
  createPoint,
  updatePointPatch,
  createOwner: vi.fn(),
  updateOwnerPatch: vi.fn(),
  markPointVisited: vi.fn(),
  updateVisitPatch
}));

describe("local mutation actions", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates points through the IndexedDB repository without network access", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    createPoint.mockResolvedValue({ id: "point-1" });

    const { createPointLocal } = await import("./local-actions");
    await createPointLocal({
      brand: "Ozon",
      city: "Moscow",
      address: "Main 1"
    });

    expect(createPoint).toHaveBeenCalledWith({
      brand: "Ozon",
      city: "Moscow",
      address: "Main 1"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("updates points through the local change-queue repository", async () => {
    updatePointPatch.mockResolvedValue({ id: "point-1", ownerId: "owner-1" });

    const { updatePointLocal } = await import("./local-actions");
    await updatePointLocal("point-1", { ownerId: "owner-1" });

    expect(updatePointPatch).toHaveBeenCalledWith("point-1", { ownerId: "owner-1" });
  });

  it("removes visits through the local change-queue repository", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    updateVisitPatch.mockResolvedValue({ id: "visit-1", deletedAt: "2026-01-01T00:00:00.000Z" });

    const { removeVisitLocal } = await import("./local-actions");
    await removeVisitLocal("visit-1");

    expect(updateVisitPatch).toHaveBeenCalledWith("visit-1", {
      deletedAt: "2026-01-01T00:00:00.000Z"
    });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

const createPoint = vi.fn();
const updatePointPatch = vi.fn();

vi.mock("@/lib/indexeddb/repositories", () => ({
  createPoint,
  updatePointPatch,
  createOwner: vi.fn(),
  updateOwnerPatch: vi.fn(),
  markPointVisited: vi.fn()
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
});

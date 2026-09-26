import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { ServiceWorkerRegister } from "./ServiceWorkerRegister";

vi.mock("next/navigation", () => ({ usePathname: () => "/points" }));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("ServiceWorkerRegister", () => {
  it("retries a failed installation when the connection returns", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const register = vi.fn()
      .mockRejectedValueOnce(new Error("temporary install failure"))
      .mockResolvedValueOnce({ active: null });
    const serviceWorker = {
      register,
      getRegistration: vi.fn().mockResolvedValue(undefined),
      ready: new Promise(() => undefined),
      controller: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: serviceWorker });

    render(<ServiceWorkerRegister />);
    await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(register).toHaveBeenCalledTimes(2));
  });
});

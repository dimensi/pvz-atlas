import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authCookieName, createSessionToken } from "@/lib/auth/session";
import { proxy } from "./proxy";

function request(path: string, token?: string, pendingLogout = false): NextRequest {
  const cookies = [token && `${authCookieName}=${token}`, pendingLogout && "pvz_local_logout=1"]
    .filter(Boolean)
    .join("; ");
  return new NextRequest(`https://pvz.example${path}`, {
    headers: cookies ? { Cookie: cookies } : undefined
  });
}

describe("proxy auth gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("redirects unauthenticated page requests to login with next path", async () => {
    vi.stubEnv("PVZ_BASIC_AUTH_USER", "operator");
    vi.stubEnv("PVZ_BASIC_AUTH_PASSWORD", "secret");

    const response = await proxy(request("/map?brand=ozon"));

    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe("https://pvz.example/login?next=%2Fmap%3Fbrand%3Dozon");
  });

  it("returns JSON 401 for unauthenticated API requests", async () => {
    vi.stubEnv("PVZ_BASIC_AUTH_USER", "operator");
    vi.stubEnv("PVZ_BASIC_AUTH_PASSWORD", "secret");

    const response = await proxy(request("/api/sync/pull"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "unauthorized",
        message: "Требуется вход в приложение."
      }
    });
  });

  it("allows authenticated private requests", async () => {
    vi.stubEnv("PVZ_BASIC_AUTH_USER", "operator");
    vi.stubEnv("PVZ_BASIC_AUTH_PASSWORD", "secret");
    const token = await createSessionToken("operator");

    const response = await proxy(request("/points", token));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("blocks a private page when local logout is pending despite an old session cookie", async () => {
    vi.stubEnv("PVZ_BASIC_AUTH_USER", "operator");
    vi.stubEnv("PVZ_BASIC_AUTH_PASSWORD", "secret");
    const token = await createSessionToken("operator");

    const response = await proxy(request("/points", token, true));

    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toContain("/login");
  });

  it("allows public login page, login API, and PWA asset requests", async () => {
    const loginResponse = await proxy(request("/login"));
    const loginApiResponse = await proxy(request("/api/auth/login"));
    const logoutApiResponse = await proxy(request("/api/auth/logout", undefined, true));
    const manifestResponse = await proxy(request("/manifest.webmanifest"));

    expect(loginResponse.headers.get("x-middleware-next")).toBe("1");
    expect(loginApiResponse.headers.get("x-middleware-next")).toBe("1");
    expect(logoutApiResponse.headers.get("x-middleware-next")).toBe("1");
    expect(manifestResponse.headers.get("x-middleware-next")).toBe("1");
  });
});

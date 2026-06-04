import { afterEach, describe, expect, it, vi } from "vitest";
import { authCookieName } from "@/lib/auth/session";
import { POST } from "./route";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("POST /api/auth/login", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sets a session cookie for valid credentials", async () => {
    vi.stubEnv("PVZ_BASIC_AUTH_USER", "operator");
    vi.stubEnv("PVZ_BASIC_AUTH_PASSWORD", "secret");

    const response = await POST(jsonRequest({ username: "operator", password: "secret" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("Set-Cookie")).toContain(`${authCookieName}=`);
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(response.headers.get("Set-Cookie")).toContain("SameSite=lax");
  });

  it("rejects invalid credentials with a structured error", async () => {
    vi.stubEnv("PVZ_BASIC_AUTH_USER", "operator");
    vi.stubEnv("PVZ_BASIC_AUTH_PASSWORD", "secret");

    const response = await POST(jsonRequest({ username: "operator", password: "wrong" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "invalid_credentials",
        message: "Неверный логин или пароль."
      }
    });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthConfigError,
  createSessionToken,
  sessionMaxAgeSeconds,
  validateCredentials,
  verifySessionToken
} from "./session";

describe("auth session", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("validates credentials from server env", async () => {
    vi.stubEnv("PVZ_BASIC_AUTH_USER", "operator");
    vi.stubEnv("PVZ_BASIC_AUTH_PASSWORD", "secret");

    await expect(validateCredentials("operator", "secret")).resolves.toBe(true);
    await expect(validateCredentials("operator", "wrong")).resolves.toBe(false);
  });

  it("throws when auth credentials are missing", async () => {
    vi.stubEnv("PVZ_BASIC_AUTH_USER", "");
    vi.stubEnv("PVZ_BASIC_AUTH_PASSWORD", "");

    await expect(validateCredentials("operator", "secret")).rejects.toBeInstanceOf(AuthConfigError);
  });

  it("creates and verifies a signed token", async () => {
    vi.stubEnv("PVZ_BASIC_AUTH_USER", "operator");
    vi.stubEnv("PVZ_BASIC_AUTH_PASSWORD", "secret");
    const now = Date.UTC(2026, 0, 1);

    const token = await createSessionToken("operator", now);
    const session = await verifySessionToken(token, now + 1000);

    expect(session).toMatchObject({
      sub: "operator",
      iat: Math.floor(now / 1000),
      exp: Math.floor(now / 1000) + sessionMaxAgeSeconds
    });
  });

  it("rejects expired and tampered tokens", async () => {
    vi.stubEnv("PVZ_BASIC_AUTH_USER", "operator");
    vi.stubEnv("PVZ_BASIC_AUTH_PASSWORD", "secret");
    const now = Date.UTC(2026, 0, 1);

    const token = await createSessionToken("operator", now);

    await expect(verifySessionToken(token, now + sessionMaxAgeSeconds * 1000 + 1000)).resolves.toBeNull();
    await expect(verifySessionToken(`${token.slice(0, -1)}x`, now + 1000)).resolves.toBeNull();
  });

  it("rejects malformed tokens without throwing", async () => {
    vi.stubEnv("PVZ_BASIC_AUTH_USER", "operator");
    vi.stubEnv("PVZ_BASIC_AUTH_PASSWORD", "secret");

    await expect(verifySessionToken("not.a.jwt")).resolves.toBeNull();
    await expect(verifySessionToken("header.payload.%")).resolves.toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { authCookieName } from "@/lib/auth/session";
import { POST } from "./route";

describe("POST /api/auth/logout", () => {
  it("clears the session cookie", async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.headers.get("Set-Cookie")).toContain(`${authCookieName}=`);
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });
});

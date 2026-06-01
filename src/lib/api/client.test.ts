import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "./client";

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends JSON headers, stringifies object bodies, and parses JSON responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch<{ ok: boolean }>("/api/example", {
      method: "POST",
      body: { value: 1 }
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/example",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ value: 1 })
      })
    );
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("supports requests without a body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/example");

    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it("throws structured errors for non-2xx responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "invalid_request",
              message: "Bad request",
              details: { field: "city" }
            }
          }),
          { status: 400 }
        )
      )
    );

    await expect(apiFetch("/api/example")).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
      code: "invalid_request",
      message: "Bad request",
      details: { field: "city" }
    } satisfies Partial<ApiError>);
  });

  it("rejects non-relative API paths", async () => {
    await expect(apiFetch("https://example.com/api")).rejects.toMatchObject({
      code: "invalid_api_path"
    });
  });
});

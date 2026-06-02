import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

function jsonRequest(body: unknown): Request {
  return new Request("https://pvz.test/api/address/suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function readJson(response: Response): Promise<unknown> {
  return response.json() as Promise<unknown>;
}

describe("POST /api/address/suggest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns a structured error when DaData is not configured", async () => {
    vi.stubEnv("DADATA_API_KEY", "");

    const response = await POST(jsonRequest({ query: "зеленые аллеи" }));

    expect(response.status).toBe(503);
    expect(await readJson(response)).toMatchObject({
      error: {
        code: "dadata_not_configured"
      }
    });
  });

  it("rejects short queries before calling DaData", async () => {
    vi.stubEnv("DADATA_API_KEY", "test-token");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(jsonRequest({ query: "ул" }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes DaData suggestions and keeps the token server-side", async () => {
    vi.stubEnv("DADATA_API_KEY", "test-token");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          suggestions: [
            {
              value: "г Видное, ул Зеленые Аллеи, д 9",
              unrestricted_value: "142701, Московская обл, г Видное, ул Зеленые Аллеи, д 9",
              data: {
                city: "Видное",
                city_with_type: "г Видное",
                street_with_type: "ул Зеленые Аллеи",
                house_type: "д",
                house: "9",
                geo_lat: "55.551",
                geo_lon: "37.708",
                qc_geo: "0"
              }
            }
          ]
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(jsonRequest({ query: "зеленые аллеи 9", city: "Видное" }));

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
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
    expect(fetchMock).toHaveBeenCalledWith(
      "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Token test-token"
        })
      })
    );
  });

  it("keeps house details from DaData value after removing the city prefix", async () => {
    vi.stubEnv("DADATA_API_KEY", "test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            suggestions: [
              {
                value: "г Видное, ул Зеленые Аллеи, д 9, к 2, стр 1, оф 15",
                unrestricted_value:
                  "142701, Московская обл, г Видное, ул Зеленые Аллеи, д 9, к 2, стр 1, оф 15",
                data: {
                  city: "Видное",
                  city_with_type: "г Видное",
                  street_with_type: "ул Зеленые Аллеи",
                  house_type: "д",
                  house: "9",
                  block_type: "к",
                  block: "2",
                  structure_type: "стр",
                  structure: "1",
                  flat_type: "оф",
                  flat: "15",
                  geo_lat: "55.551",
                  geo_lon: "37.708",
                  qc_geo: "0"
                }
              }
            ]
          }),
          { status: 200 }
        )
      )
    );

    const response = await POST(jsonRequest({ query: "зеленые аллеи 9 к2 стр1", city: "Видное" }));

    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({
      suggestions: [
        {
          address: "ул Зеленые Аллеи, д 9, к 2, стр 1, оф 15"
        }
      ]
    });
  });

  it("falls back to structured parts when DaData value contains only the city", async () => {
    vi.stubEnv("DADATA_API_KEY", "test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            suggestions: [
              {
                value: "г Видное",
                unrestricted_value: "142701, Московская обл, г Видное, ул Зеленые Аллеи, д 9",
                data: {
                  city: "Видное",
                  city_with_type: "г Видное",
                  street_with_type: "ул Зеленые Аллеи",
                  house_type: "д",
                  house: "9",
                  block_type: "к",
                  block: "2"
                }
              }
            ]
          }),
          { status: 200 }
        )
      )
    );

    const response = await POST(jsonRequest({ query: "видное зеленые аллеи 9", city: "Видное" }));

    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({
      suggestions: [
        {
          address: "ул Зеленые Аллеи, д 9, к 2"
        }
      ]
    });
  });

  it("maps DaData auth failures to a sanitized unavailable error", async () => {
    vi.stubEnv("DADATA_API_KEY", "bad-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "secret detail" }), { status: 403 }))
    );

    const response = await POST(jsonRequest({ query: "зеленые аллеи 9" }));

    expect(response.status).toBe(503);
    expect(await readJson(response)).toEqual({
      error: {
        code: "dadata_suggest_failed",
        message: "DaData address suggestions are temporarily unavailable."
      }
    });
  });

  it("maps malformed DaData responses to a sanitized upstream error", async () => {
    vi.stubEnv("DADATA_API_KEY", "test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ suggestions: [{ value: "" }] }), { status: 200 })
      )
    );

    const response = await POST(jsonRequest({ query: "несуществующий адрес 123" }));

    expect(response.status).toBe(502);
    expect(await readJson(response)).toEqual({
      error: {
        code: "dadata_suggest_failed",
        message: "DaData address suggestions are temporarily unavailable."
      }
    });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { suggestAddresses } from "./address-api";

describe("suggestAddresses", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the same-origin address suggestion route and parses suggestions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          suggestions: [
            {
              value: "г Видное, ул Зеленые Аллеи, д 9",
              unrestrictedValue: "142701, Московская обл, г Видное, ул Зеленые Аллеи, д 9",
              city: "г Видное",
              address: "ул Зеленые Аллеи, д 9",
              lat: 55.551,
              lon: 37.708,
              geoQuality: 0
            }
          ]
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await suggestAddresses({ query: "зеленые аллеи 9", city: "Видное" });

    expect(result.suggestions[0]).toMatchObject({
      address: "ул Зеленые Аллеи, д 9",
      lat: 55.551,
      lon: 37.708
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/address/suggest",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ query: "зеленые аллеи 9", city: "Видное" })
      })
    );
  });
});

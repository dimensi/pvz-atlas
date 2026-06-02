import { describe, expect, it } from "vitest";
import { parsePointCoordinateInputs, parsePointCoordinatesText } from "./coordinates";

describe("point coordinate input parsing", () => {
  it("accepts empty optional coordinates", () => {
    expect(parsePointCoordinateInputs("", "  ")).toEqual({ ok: true, coordinates: null });
  });

  it("accepts a valid coordinate pair with comma decimals", () => {
    expect(parsePointCoordinateInputs("55,751244", "37.618423")).toEqual({
      ok: true,
      coordinates: { lat: 55.751244, lon: 37.618423 }
    });
  });

  it("rejects incomplete and out-of-range coordinates", () => {
    expect(parsePointCoordinateInputs("55.75", "")).toMatchObject({ ok: false });
    expect(parsePointCoordinateInputs("100", "37.61")).toMatchObject({ ok: false });
  });

  it("accepts a single pasted coordinate field", () => {
    expect(parsePointCoordinatesText("55.123, 37.123")).toEqual({
      ok: true,
      coordinates: { lat: 55.123, lon: 37.123 }
    });
    expect(parsePointCoordinatesText("55.123 37.123")).toEqual({
      ok: true,
      coordinates: { lat: 55.123, lon: 37.123 }
    });
  });

  it("accepts map urls with known coordinate parameters", () => {
    expect(parsePointCoordinatesText("https://example.test/maps?ll=37.123,55.123&z=16")).toEqual({
      ok: true,
      coordinates: { lat: 55.123, lon: 37.123 }
    });
    expect(parsePointCoordinatesText("https://example.test/maps?pt=37.321,55.321,pm2")).toEqual({
      ok: true,
      coordinates: { lat: 55.321, lon: 37.321 }
    });
    expect(parsePointCoordinatesText("https://example.test/search?q=55.987,37.987")).toEqual({
      ok: true,
      coordinates: { lat: 55.987, lon: 37.987 }
    });
    expect(parsePointCoordinatesText("https://example.test/maps?api=1&query=55.123,37.123")).toEqual({
      ok: true,
      coordinates: { lat: 55.123, lon: 37.123 }
    });
    expect(parsePointCoordinatesText("https://example.test/maps?text=55.123%2C37.123")).toEqual({
      ok: true,
      coordinates: { lat: 55.123, lon: 37.123 }
    });
  });

  it("rejects urls without known coordinate parameters instead of scraping arbitrary numbers", () => {
    expect(parsePointCoordinatesText("https://example.test/maps?api=1&z=55.123")).toMatchObject({
      ok: false
    });
  });
});

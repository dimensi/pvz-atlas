import { describe, expect, it } from "vitest";
import { parsePointCoordinateInputs } from "./coordinates";

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
});

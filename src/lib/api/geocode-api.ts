import { apiFetch } from "./client";
import {
  geocodeResponseSchema,
  type GeocodeRequest,
  type GeocodeResponse
} from "./types";

export async function geocodeAddress(request: GeocodeRequest): Promise<GeocodeResponse> {
  return geocodeResponseSchema.parse(
    await apiFetch<unknown>("/api/geocode", {
      method: "POST",
      body: request
    })
  );
}

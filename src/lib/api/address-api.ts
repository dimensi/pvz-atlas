import { apiFetch } from "./client";
import {
  addressSuggestResponseSchema,
  type AddressSuggestRequest,
  type AddressSuggestResponse
} from "./address-types";

export async function suggestAddresses(
  request: AddressSuggestRequest
): Promise<AddressSuggestResponse> {
  return addressSuggestResponseSchema.parse(
    await apiFetch<unknown>("/api/address/suggest", {
      method: "POST",
      body: request
    })
  );
}

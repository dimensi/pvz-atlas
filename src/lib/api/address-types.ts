import { z } from "zod";

export const addressSuggestRequestSchema = z.object({
  query: z.string().trim().min(3).max(300),
  city: z.string().trim().max(100).optional()
});

export const addressSuggestionSchema = z.object({
  value: z.string().min(1),
  unrestrictedValue: z.string().min(1),
  city: z.string().nullable(),
  address: z.string().min(1),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  geoQuality: z.number().int().nullable()
});

export const addressSuggestResponseSchema = z.object({
  suggestions: z.array(addressSuggestionSchema).max(10)
});

export type AddressSuggestRequest = z.infer<typeof addressSuggestRequestSchema>;
export type AddressSuggestion = z.infer<typeof addressSuggestionSchema>;
export type AddressSuggestResponse = z.infer<typeof addressSuggestResponseSchema>;

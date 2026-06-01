import { z } from "zod";
import {
  changeSchema,
  conflictSchema,
  ownerSchema,
  pointSchema,
  visitSchema
} from "@/lib/data-model/schemas";

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional()
  })
});

export const pullResponseSchema = z.object({
  serverTime: z.string().datetime(),
  points: z.array(pointSchema),
  owners: z.array(ownerSchema),
  visits: z.array(visitSchema),
  conflicts: z.array(conflictSchema).optional(),
  warnings: z.array(z.string()).optional()
});

export const pushRequestSchema = z.object({
  clientId: z.string().min(1),
  changes: z.array(changeSchema).max(500)
});

export const rejectedChangeSchema = z.object({
  changeId: z.string().min(1),
  reason: z.string().min(1)
});

export const pushResponseSchema = z.object({
  serverTime: z.string().datetime(),
  applied: z.array(z.string()),
  rejected: z.array(rejectedChangeSchema),
  conflicts: z.array(conflictSchema),
  points: z.array(pointSchema).optional(),
  owners: z.array(ownerSchema).optional(),
  visits: z.array(visitSchema).optional(),
  warnings: z.array(z.string()).optional()
});

export const geocodeRequestSchema = z.object({
  city: z.string().min(1),
  address: z.string().min(1)
});

export const geocodeResponseSchema = z.object({
  query: z.string(),
  coordinates: z
    .object({
      lat: z.number(),
      lon: z.number()
    })
    .nullable(),
  warnings: z.array(z.string()).optional()
});

export const importPointInputSchema = z.object({
  rowIndex: z.number().int().positive().optional(),
  brand: z.string().min(1),
  city: z.string().min(1),
  address: z.string().min(1),
  lat: z.union([z.number(), z.string(), z.null()]).optional(),
  lon: z.union([z.number(), z.string(), z.null()]).optional(),
  comment: z.union([z.string(), z.null()]).optional()
});

export const importPreviewRequestSchema = z.object({
  points: z.array(importPointInputSchema).min(1).max(1000)
});

export const importApplyRequestSchema = importPreviewRequestSchema;

export const importPointsRouteRequestSchema = importPreviewRequestSchema.extend({
  mode: z.enum(["preview", "apply"]).optional(),
  previewOnly: z.boolean().default(true)
});

export const importInvalidItemSchema = z.object({
  rowIndex: z.number().int().positive(),
  issues: z.array(z.string()),
  raw: z.unknown().optional()
});

export const importNewItemSchema = z.object({
  rowIndex: z.number().int().positive(),
  sourceKey: z.string().min(1),
  point: pointSchema
});

export const importUpdateItemSchema = z.object({
  rowIndex: z.number().int().positive(),
  sourceKey: z.string().min(1),
  existingId: z.string().min(1),
  patch: z.record(z.string(), z.unknown()),
  point: pointSchema
});

export const importDuplicateItemSchema = z.object({
  rowIndex: z.number().int().positive(),
  sourceKey: z.string().min(1),
  reason: z.enum(["incoming_duplicate", "existing_duplicate"]),
  existingId: z.string().min(1).optional(),
  duplicateOfRowIndex: z.number().int().positive().optional()
});

export const importPointsResponseBodySchema = z.object({
  applied: z.boolean(),
  counts: z.object({
    new: z.number().int().nonnegative(),
    update: z.number().int().nonnegative(),
    duplicate: z.number().int().nonnegative(),
    invalid: z.number().int().nonnegative()
  }),
  preview: z.object({
    new: z.array(importNewItemSchema),
    update: z.array(importUpdateItemSchema),
    duplicate: z.array(importDuplicateItemSchema),
    invalid: z.array(importInvalidItemSchema)
  }),
  warnings: z.array(z.string()).optional()
});

export const importPreviewResponseSchema = importPointsResponseBodySchema.extend({
  mode: z.literal("preview"),
  applied: z.literal(false)
});

export const importApplyResponseSchema = importPointsResponseBodySchema.extend({
  mode: z.literal("apply"),
  applied: z.literal(true)
});

export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;
export type PullResponse = z.infer<typeof pullResponseSchema>;
export type PushRequest = z.infer<typeof pushRequestSchema>;
export type PushResponse = z.infer<typeof pushResponseSchema>;
export type RejectedChange = z.infer<typeof rejectedChangeSchema>;
export type GeocodeRequest = z.infer<typeof geocodeRequestSchema>;
export type GeocodeResponse = z.infer<typeof geocodeResponseSchema>;
export type ImportPointInput = z.infer<typeof importPointInputSchema>;
export type ImportPreviewRequest = z.infer<typeof importPreviewRequestSchema>;
export type ImportApplyRequest = z.infer<typeof importApplyRequestSchema>;
export type ImportPreviewResponse = z.infer<typeof importPreviewResponseSchema>;
export type ImportApplyResponse = z.infer<typeof importApplyResponseSchema>;

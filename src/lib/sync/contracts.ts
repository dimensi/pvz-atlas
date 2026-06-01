import { z } from "zod";
import { changeSchema, conflictSchema, ownerSchema, pointSchema, visitSchema } from "@/lib/data-model/schemas";

export const pullResponseSchema = z.object({
  points: z.array(pointSchema),
  owners: z.array(ownerSchema),
  visits: z.array(visitSchema),
  conflicts: z.array(conflictSchema),
  serverTime: z.string().datetime(),
  warnings: z.array(z.string())
});

export const pushRequestSchema = z.object({
  changes: z.array(changeSchema).max(500)
});

export const pushResponseSchema = z.object({
  acceptedChangeIds: z.array(z.string()),
  conflicts: z.array(conflictSchema),
  warnings: z.array(z.string())
});

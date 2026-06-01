import { apiFetch } from "./client";
import {
  importApplyResponseSchema,
  importPreviewResponseSchema,
  type ImportApplyRequest,
  type ImportApplyResponse,
  type ImportPreviewRequest,
  type ImportPreviewResponse
} from "./types";

export async function previewImportPoints(
  request: ImportPreviewRequest
): Promise<ImportPreviewResponse> {
  return importPreviewResponseSchema.parse(
    await apiFetch<unknown>("/api/import/points", {
      method: "POST",
      body: { ...request, mode: "preview", previewOnly: true }
    })
  );
}

export async function applyImportPoints(
  request: ImportApplyRequest
): Promise<ImportApplyResponse> {
  return importApplyResponseSchema.parse(
    await apiFetch<unknown>("/api/import/points", {
      method: "POST",
      body: { ...request, mode: "apply", previewOnly: false }
    })
  );
}

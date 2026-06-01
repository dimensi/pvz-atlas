import { apiFetch } from "./client";
import {
  pullResponseSchema,
  pushResponseSchema,
  type PullResponse,
  type PushRequest,
  type PushResponse
} from "./types";

export async function pullSync(since: string | null): Promise<PullResponse> {
  const params = new URLSearchParams();
  if (since) {
    params.set("since", since);
  }

  const path = params.size > 0 ? `/api/sync/pull?${params.toString()}` : "/api/sync/pull";
  return pullResponseSchema.parse(await apiFetch<unknown>(path));
}

export async function pushSync(request: PushRequest): Promise<PushResponse> {
  return pushResponseSchema.parse(
    await apiFetch<unknown>("/api/sync/push", {
      method: "POST",
      body: request
    })
  );
}

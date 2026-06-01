import { apiErrorBodySchema } from "./types";

export interface ApiErrorDetails {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(error: ApiErrorDetails) {
    super(error.message);
    this.name = "ApiError";
    this.status = error.status;
    this.code = error.code;
    this.details = error.details;
  }
}

type JsonBody = BodyInit | Record<string, unknown> | unknown[] | null;

export type ApiRequestInit = Omit<RequestInit, "body"> & {
  body?: JsonBody;
};

function isBodyInit(body: Exclude<JsonBody, null>): body is BodyInit {
  return (
    typeof body === "string" ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof ReadableStream
  );
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const text = await response.text();
  if (!text) {
    return undefined;
  }

  return JSON.parse(text) as unknown;
}

function normalizeBody(body: JsonBody | undefined): BodyInit | null | undefined {
  if (body === undefined) {
    return undefined;
  }

  if (body === null) {
    return null;
  }

  return isBodyInit(body) ? body : JSON.stringify(body);
}

export async function apiFetch<TResponse>(
  path: string,
  init: ApiRequestInit = {}
): Promise<TResponse> {
  if (!path.startsWith("/")) {
    throw new ApiError({
      status: 0,
      code: "invalid_api_path",
      message: "API requests must use same-origin relative paths."
    });
  }

  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers,
    body: normalizeBody(init.body)
  });
  const payload = await parseResponseBody(response);

  if (!response.ok) {
    const parsedError = apiErrorBodySchema.safeParse(payload);
    throw new ApiError({
      status: response.status,
      code: parsedError.success ? parsedError.data.error.code : "request_failed",
      message: parsedError.success ? parsedError.data.error.message : response.statusText,
      details: parsedError.success ? parsedError.data.error.details : payload
    });
  }

  return payload as TResponse;
}

import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  AuthConfigError,
  createSessionToken,
  setSessionCookie,
  validateCredentials
} from "@/lib/auth/session";
import { jsonError, parseJsonBody } from "@/lib/validation/api";

export const runtime = "nodejs";

const loginRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const payload = await parseJsonBody(request, loginRequestSchema);
    const isValid = await validateCredentials(payload.username, payload.password);

    if (!isValid) {
      return jsonError(401, "invalid_credentials", "Неверный логин или пароль.");
    }

    const response = NextResponse.json({ ok: true });
    setSessionCookie(response, await createSessionToken(payload.username));

    return response;
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(400, "invalid_login_request", error.message);
    }

    if (error instanceof SyntaxError) {
      return jsonError(400, "invalid_json", "Тело запроса должно быть валидным JSON.");
    }

    if (error instanceof AuthConfigError) {
      return jsonError(503, "auth_not_configured", error.message);
    }

    return jsonError(500, "login_failed", "Не удалось выполнить вход.");
  }
}

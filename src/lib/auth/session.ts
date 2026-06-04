import type { NextRequest, NextResponse } from "next/server";

export const authCookieName = "pvz_session";
export const sessionMaxAgeSeconds = 60 * 60 * 24 * 30;

const encoder = new TextEncoder();

interface SessionPayload {
  sub: string;
  iat: number;
  exp: number;
}

export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigError";
  }
}

export function getAuthCredentials() {
  const username = process.env.PVZ_BASIC_AUTH_USER?.trim();
  const password = process.env.PVZ_BASIC_AUTH_PASSWORD?.trim();

  if (!username || !password) {
    throw new AuthConfigError("PVZ auth credentials are not configured.");
  }

  return { username, password };
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlEncodeText(value: string): string {
  return base64UrlEncode(encoder.encode(value));
}

function base64UrlDecodeText(value: string): string {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "="
  );
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

async function importSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function sign(input: string, secret: string): Promise<string> {
  const key = await importSigningKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(input));

  return base64UrlEncode(new Uint8Array(signature));
}

async function verifySignature(input: string, signature: string, secret: string): Promise<boolean> {
  try {
    const key = await importSigningKey(secret);
    const padded = signature.replaceAll("-", "+").replaceAll("_", "/").padEnd(
      Math.ceil(signature.length / 4) * 4,
      "="
    );
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

    return crypto.subtle.verify("HMAC", key, bytes, encoder.encode(input));
  } catch {
    return false;
  }
}

export async function validateCredentials(username: string, password: string): Promise<boolean> {
  const credentials = getAuthCredentials();

  return username === credentials.username && password === credentials.password;
}

export async function createSessionToken(username: string, now = Date.now()): Promise<string> {
  const { password } = getAuthCredentials();
  const issuedAt = Math.floor(now / 1000);
  const payload: SessionPayload = {
    sub: username,
    iat: issuedAt,
    exp: issuedAt + sessionMaxAgeSeconds
  };
  const header = { alg: "HS256", typ: "JWT" };
  const signingInput = `${base64UrlEncodeText(JSON.stringify(header))}.${base64UrlEncodeText(
    JSON.stringify(payload)
  )}`;
  const signature = await sign(signingInput, password);

  return `${signingInput}.${signature}`;
}

export async function verifySessionToken(token: string, now = Date.now()): Promise<SessionPayload | null> {
  const { username, password } = getAuthCredentials();
  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [headerPart, payloadPart, signature] = parts;
  const signingInput = `${headerPart}.${payloadPart}`;
  const isValidSignature = await verifySignature(signingInput, signature, password);

  if (!isValidSignature) {
    return null;
  }

  try {
    const header = JSON.parse(base64UrlDecodeText(headerPart)) as { alg?: unknown; typ?: unknown };
    const payload = JSON.parse(base64UrlDecodeText(payloadPart)) as Partial<SessionPayload>;

    if (header.alg !== "HS256" || header.typ !== "JWT") {
      return null;
    }

    if (payload.sub !== username || typeof payload.exp !== "number" || typeof payload.iat !== "number") {
      return null;
    }

    if (payload.exp <= Math.floor(now / 1000)) {
      return null;
    }

    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: authCookieName,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAgeSeconds
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: authCookieName,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

export async function getSessionFromRequest(request: NextRequest): Promise<SessionPayload | null> {
  const token = request.cookies.get(authCookieName)?.value;

  return token ? verifySessionToken(token) : null;
}

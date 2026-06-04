import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";

const publicPaths = new Set([
  "/favicon.ico",
  "/manifest.webmanifest",
  "/sw.js",
  "/apple-touch-icon.png"
]);

const publicPrefixes = ["/_next/", "/icons/", "/brand/", "/map-pins/"];

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/api/auth/login" ||
    publicPaths.has(pathname) ||
    publicPrefixes.some((prefix) => pathname.startsWith(prefix))
  );
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const session = await getSessionFromRequest(request);
  if (session) {
    return NextResponse.next();
  }

  if (isApiPath(pathname)) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Требуется вход в приложение." } },
      { status: 401 }
    );
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!.*\\..*).*)", "/api/:path*", "/favicon.ico", "/manifest.webmanifest", "/sw.js"]
};

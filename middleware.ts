import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "auth";

async function authToken(): Promise<string> {
  const password = process.env.APP_PASSWORD || "";
  if (!password) return "";
  const hashBuf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(password)
  );
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/login" || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const expected = await authToken();
  const got = req.cookies.get(COOKIE_NAME)?.value;
  if (expected && got === expected) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

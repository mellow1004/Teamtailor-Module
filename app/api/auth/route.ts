import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const COOKIE_NAME = "auth";
const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7;

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

export async function POST(req: NextRequest) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { error: "APP_PASSWORD är inte satt i .env.local" },
      { status: 500 }
    );
  }
  let body: { password?: string } = {};
  try {
    body = await req.json();
  } catch {
    // tom body — hanteras nedan
  }
  if (!body.password || body.password !== expected) {
    return NextResponse.json({ error: "Fel lösenord" }, { status: 401 });
  }

  const token = await authToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SEVEN_DAYS_SECONDS,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}

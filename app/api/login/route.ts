import { NextResponse } from "next/server";
import { isValidCredentials, SESSION_COOKIE, SESSION_VALUE } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    if (typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json({ ok: false, error: "Geçersiz istek." }, { status: 400 });
    }

    if (!isValidCredentials(email, password)) {
      return NextResponse.json(
        { ok: false, error: "E-posta veya şifre hatalı." },
        { status: 401 }
      );
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, SESSION_VALUE, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  } catch {
    return NextResponse.json({ ok: false, error: "Sunucu hatası." }, { status: 500 });
  }
}

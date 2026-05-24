import { NextResponse } from "next/server";
import {
  buildAuthorizeUrl,
  buildRedirectUri,
  generatePKCE,
  generateState,
  getApiKey,
  SCOPES,
} from "@/lib/etsy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/etsy/oauth/start
 *
 * Begins the OAuth 2.0 (PKCE) handshake.
 * - Generates a fresh PKCE verifier + state.
 * - Stores them in short-lived HttpOnly cookies.
 * - Redirects the user to Etsy's consent screen.
 */
export async function GET(req: Request) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return new NextResponse(
      "ETSY_API_KEY ortam değişkeni tanımlı değil. Önce Vercel'e ekleyin.",
      { status: 400 }
    );
  }

  const url = new URL(req.url);
  const redirectUri = buildRedirectUri(url.origin);

  const { verifier, challenge } = generatePKCE();
  const state = generateState();

  const authorizeUrl = buildAuthorizeUrl({
    clientId: apiKey,
    redirectUri,
    challenge,
    state,
  });

  const res = NextResponse.redirect(authorizeUrl);

  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/etsy/oauth",
    maxAge: 60 * 10, // 10 minutes
  };
  res.cookies.set("etsy_pkce_verifier", verifier, cookieOpts);
  res.cookies.set("etsy_pkce_state", state, cookieOpts);
  res.cookies.set("etsy_pkce_redirect", redirectUri, cookieOpts);

  // Echo a header for debugging (visible only on the redirect response).
  res.headers.set("x-etsy-scopes", SCOPES.join(","));
  return res;
}

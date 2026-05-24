import { NextResponse } from "next/server";
import {
  exchangeCode,
  fetchUserShop,
  getApiKey,
  parseUserIdFromToken,
  saveCredentials,
  SCOPES,
} from "@/lib/etsy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/etsy/oauth/callback
 *
 * Receives the redirect from Etsy after consent.
 * - Verifies the state cookie.
 * - Exchanges the authorization code for access + refresh tokens.
 * - Persists tokens (and shop_id) to public.etsy_credentials via the
 *   server-role Supabase client.
 * - Redirects back to /dashboard/siparisler with a result flag.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  const back = new URL("/dashboard/siparisler", url.origin);

  function redirectWithStatus(status: string, message?: string) {
    back.searchParams.set("etsy", status);
    if (message) back.searchParams.set("msg", message);
    const res = NextResponse.redirect(back);
    res.cookies.delete("etsy_pkce_verifier");
    res.cookies.delete("etsy_pkce_state");
    res.cookies.delete("etsy_pkce_redirect");
    return res;
  }

  if (err) {
    return redirectWithStatus("error", err);
  }

  if (!code || !state) {
    return redirectWithStatus("error", "missing_code_or_state");
  }

  const verifier = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("etsy_pkce_verifier="))
    ?.split("=")[1];
  const cookieState = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("etsy_pkce_state="))
    ?.split("=")[1];
  const cookieRedirect = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("etsy_pkce_redirect="))
    ?.split("=")[1];

  if (!verifier || !cookieState || !cookieRedirect) {
    return redirectWithStatus("error", "session_lost");
  }
  if (cookieState !== state) {
    return redirectWithStatus("error", "state_mismatch");
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return redirectWithStatus("error", "missing_api_key");
  }

  let tokens;
  try {
    tokens = await exchangeCode({
      clientId: apiKey,
      redirectUri: decodeURIComponent(cookieRedirect),
      code,
      verifier: decodeURIComponent(verifier),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "exchange_failed";
    return redirectWithStatus("error", encodeURIComponent(msg).slice(0, 200));
  }

  const userId = parseUserIdFromToken(tokens.access_token);
  let shopId: string | null = null;
  let shopName: string | null = null;
  if (userId) {
    const shop = await fetchUserShop(apiKey, tokens.access_token, userId).catch(
      () => null
    );
    if (shop) {
      shopId = shop.shopId;
      shopName = shop.shopName ?? null;
    }
  }

  try {
    await saveCredentials({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      shopId,
      shopName,
      userId,
      scope: SCOPES.join(" "),
    });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "credential_save_failed";
    return redirectWithStatus("error", encodeURIComponent(msg).slice(0, 200));
  }

  return redirectWithStatus("connected");
}

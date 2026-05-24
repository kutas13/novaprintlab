// Server-only Etsy OAuth 2.0 (PKCE) helper.
// Handles the full handshake, secure storage of refresh tokens in Supabase,
// auto-refresh of expired access tokens, and shop discovery.

import crypto from "node:crypto";
import { getSupabaseServer } from "./supabase-server";

const ETSY_AUTHORIZE_URL = "https://www.etsy.com/oauth/connect";
const ETSY_TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";
const ETSY_API_BASE = "https://openapi.etsy.com/v3/application";

// Scopes we need: read receipts (sales) + read listing details (images).
export const SCOPES = ["transactions_r", "listings_r"];

// ------------------------------------------------------------
// PKCE
// ------------------------------------------------------------

function b64url(bytes: Buffer): string {
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function generateState(): string {
  return b64url(crypto.randomBytes(16));
}

// ------------------------------------------------------------
// Config
// ------------------------------------------------------------

export function getApiKey(): string | null {
  const v = process.env.ETSY_API_KEY?.trim();
  return v ? v : null;
}

/**
 * Builds the canonical redirect_uri that we register with Etsy and that the
 * /api/etsy/oauth/callback route advertises. Derived from the incoming
 * request so localhost and Vercel work without separate config — the only
 * caveat is the Etsy app must register every origin you actually use.
 */
export function buildRedirectUri(origin: string): string {
  const trimmed = origin.replace(/\/+$/, "");
  return `${trimmed}/api/etsy/oauth/callback`;
}

// ------------------------------------------------------------
// Authorize URL
// ------------------------------------------------------------

export function buildAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    scope: SCOPES.join(" "),
    state: opts.state,
    code_challenge: opts.challenge,
    code_challenge_method: "S256",
  });
  return `${ETSY_AUTHORIZE_URL}?${params.toString()}`;
}

// ------------------------------------------------------------
// Token exchange + refresh
// ------------------------------------------------------------

interface EtsyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
}

export async function exchangeCode(opts: {
  clientId: string;
  redirectUri: string;
  code: string;
  verifier: string;
}): Promise<EtsyTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    code: opts.code,
    code_verifier: opts.verifier,
  });
  const res = await fetch(ETSY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Etsy token exchange failed (${res.status}): ${text}`);
  }
  return (await res.json()) as EtsyTokenResponse;
}

export async function refreshAccessToken(opts: {
  clientId: string;
  refreshToken: string;
}): Promise<EtsyTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: opts.clientId,
    refresh_token: opts.refreshToken,
  });
  const res = await fetch(ETSY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Etsy token refresh failed (${res.status}): ${text}`);
  }
  return (await res.json()) as EtsyTokenResponse;
}

// ------------------------------------------------------------
// Shop discovery
// ------------------------------------------------------------

/**
 * Etsy access tokens are formatted as `<user_id>.<random>`. This is the
 * documented way to discover the authenticated user's id.
 */
export function parseUserIdFromToken(accessToken: string): string | null {
  const dot = accessToken.indexOf(".");
  if (dot <= 0) return null;
  const userId = accessToken.slice(0, dot);
  return /^\d+$/.test(userId) ? userId : null;
}

export async function fetchUserShop(
  apiKey: string,
  accessToken: string,
  userId: string
): Promise<{ shopId: string; shopName?: string } | null> {
  const res = await fetch(`${ETSY_API_BASE}/users/${userId}/shops`, {
    headers: {
      "x-api-key": apiKey,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as {
    shop_id?: number | string;
    shop_name?: string;
    results?: Array<{ shop_id?: number | string; shop_name?: string }>;
  } | null;
  if (!json) return null;
  const single = json.shop_id ?? json.results?.[0]?.shop_id;
  const name = json.shop_name ?? json.results?.[0]?.shop_name;
  if (single === undefined || single === null) return null;
  return { shopId: String(single), shopName: name };
}

// ------------------------------------------------------------
// Persistence
// ------------------------------------------------------------

export interface StoredCredentials {
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
  shop_id: string | null;
  shop_name: string | null;
  user_id: string | null;
  scope: string | null;
  updated_at: string;
}

export async function readCredentials(): Promise<StoredCredentials | null> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("etsy_credentials")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return null;
  return data as StoredCredentials;
}

export async function saveCredentials(input: {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  shopId: string | null;
  shopName: string | null;
  userId: string | null;
  scope: string | null;
}): Promise<void> {
  const supabase = getSupabaseServer();
  const { error } = await supabase.from("etsy_credentials").upsert({
    id: 1,
    access_token: input.accessToken,
    refresh_token: input.refreshToken,
    access_token_expires_at: input.expiresAt.toISOString(),
    shop_id: input.shopId,
    shop_name: input.shopName,
    user_id: input.userId,
    scope: input.scope,
  });
  if (error) throw new Error(`Supabase credential save failed: ${error.message}`);
}

export async function clearCredentials(): Promise<void> {
  const supabase = getSupabaseServer();
  await supabase.from("etsy_credentials").delete().eq("id", 1);
}

// ------------------------------------------------------------
// High-level resolver
// ------------------------------------------------------------

export interface ResolvedAuth {
  apiKey: string;
  accessToken: string;
  shopId: string;
  shopName?: string;
}

export type AuthResolutionError = {
  error: string;
  /** True when the missing piece is config the user has to set (env var or
   *  OAuth connection). False when it's a transient/server error. */
  setupRequired: boolean;
};

/**
 * Returns a fresh-enough access token + shop id, refreshing automatically if
 * the stored access token expires within the next 60 seconds. Falls back to
 * the legacy env-var triple (ETSY_API_KEY/ETSY_SHOP_ID/ETSY_ACCESS_TOKEN) so
 * existing setups keep working.
 */
export async function resolveEtsyAuth(): Promise<ResolvedAuth | AuthResolutionError> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      error: "ETSY_API_KEY ortam değişkeni eksik.",
      setupRequired: true,
    };
  }

  // Try DB-stored OAuth credentials first.
  const stored = await readCredentials().catch(() => null);
  if (stored) {
    let accessToken = stored.access_token;
    const expiresAt = new Date(stored.access_token_expires_at);
    const willExpire = expiresAt.getTime() - Date.now() < 60_000;
    if (willExpire) {
      try {
        const refreshed = await refreshAccessToken({
          clientId: apiKey,
          refreshToken: stored.refresh_token,
        });
        accessToken = refreshed.access_token;
        const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000);
        await saveCredentials({
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token,
          expiresAt: newExpiry,
          shopId: stored.shop_id,
          shopName: stored.shop_name,
          userId: stored.user_id,
          scope: stored.scope,
        });
      } catch (err) {
        return {
          error:
            err instanceof Error
              ? `Etsy token yenilenemedi: ${err.message}. Lütfen yeniden bağlanın.`
              : "Etsy token yenilenemedi. Lütfen yeniden bağlanın.",
          setupRequired: true,
        };
      }
    }

    let shopId = stored.shop_id;
    let shopName = stored.shop_name ?? undefined;
    if (!shopId) {
      const userId = stored.user_id || parseUserIdFromToken(accessToken);
      if (userId) {
        const shop = await fetchUserShop(apiKey, accessToken, userId).catch(
          () => null
        );
        if (shop) {
          shopId = shop.shopId;
          shopName = shop.shopName;
          await saveCredentials({
            accessToken,
            refreshToken: stored.refresh_token,
            expiresAt: new Date(stored.access_token_expires_at),
            shopId: shop.shopId,
            shopName: shop.shopName ?? null,
            userId: stored.user_id ?? userId,
            scope: stored.scope,
          });
        }
      }
    }
    if (!shopId) {
      return {
        error: "Etsy mağazası bulunamadı. Lütfen yeniden bağlanın.",
        setupRequired: true,
      };
    }

    return { apiKey, accessToken, shopId, shopName };
  }

  // Legacy env-var fallback.
  const envShopId = process.env.ETSY_SHOP_ID?.trim();
  const envAccessToken = process.env.ETSY_ACCESS_TOKEN?.trim();
  if (envShopId && envAccessToken) {
    return { apiKey, accessToken: envAccessToken, shopId: envShopId };
  }

  return {
    error:
      "Etsy hesabı bağlı değil. Siparişler sayfasındaki 'Etsy ile Bağlan' butonuna tıklayın.",
    setupRequired: true,
  };
}

// ------------------------------------------------------------
// Status (for the UI card)
// ------------------------------------------------------------

export interface ConnectionStatus {
  apiKeyConfigured: boolean;
  connected: boolean;
  shopId?: string;
  shopName?: string;
  expiresAt?: string;
  updatedAt?: string;
}

export async function getConnectionStatus(): Promise<ConnectionStatus> {
  const apiKeyConfigured = !!getApiKey();
  const stored = await readCredentials().catch(() => null);
  if (!stored) return { apiKeyConfigured, connected: false };
  return {
    apiKeyConfigured,
    connected: true,
    shopId: stored.shop_id ?? undefined,
    shopName: stored.shop_name ?? undefined,
    expiresAt: stored.access_token_expires_at,
    updatedAt: stored.updated_at,
  };
}

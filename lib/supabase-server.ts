// Server-only Supabase client (no "use client" pragma).
// Used by route handlers for usage tracking and other server-side queries.
// The anon key is used (same as the browser client) because this app is
// single-tenant private; if you add multi-user auth later, swap to the
// service role here and lock the table down with stricter RLS.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseServer =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      })
    : null;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

// Lazy accessor used by callers that prefer a function over a possibly-null
// constant (e.g. etsy-auth, sync route). Throws if env is missing so callers
// that depend on Supabase (Etsy sync, credentials, orders) fail loudly
// instead of silently noop'ing.
export function getSupabaseServer() {
  if (!supabaseServer) {
    throw new Error(
      "Supabase env vars missing (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)."
    );
  }
  return supabaseServer;
}

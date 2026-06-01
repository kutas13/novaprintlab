-- ─── NOVAPRINTLAB — DAILY OPENAI USAGE LIMITER ─────────────────────────────
-- Run this ONCE in your Supabase project SQL editor.
-- Adds a per-day usage tracker so the API can enforce a $5/day cap.

CREATE TABLE IF NOT EXISTS public.api_usage (
  day date PRIMARY KEY,
  mockup_count integer NOT NULL DEFAULT 0,
  design_count integer NOT NULL DEFAULT 0,
  cost_usd numeric(10,4) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Single-tenant private app: allow anon to read/write its own usage.
-- (If you later add multi-user auth, replace this with a per-user table.)
ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "api_usage_read" ON public.api_usage;
DROP POLICY IF EXISTS "api_usage_write" ON public.api_usage;
CREATE POLICY "api_usage_read" ON public.api_usage FOR SELECT TO anon USING (true);
CREATE POLICY "api_usage_write" ON public.api_usage FOR ALL TO anon USING (true) WITH CHECK (true);

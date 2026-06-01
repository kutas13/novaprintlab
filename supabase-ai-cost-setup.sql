-- NovaPrintLab: AI cost tracking per design.
-- Adds an `ai_cost_usd` numeric column to `designs` so the profit calculator
-- can subtract real AI generation expenses (design + mockups) from net profit.
--
-- Safe to re-run.

ALTER TABLE public.designs
  ADD COLUMN IF NOT EXISTS ai_cost_usd numeric(10,4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.designs.ai_cost_usd IS
  'Accumulated OpenAI generation cost for this design (design gen + all mockup gens). USD.';

-- Make sure any existing rows have a sane value.
UPDATE public.designs
SET ai_cost_usd = COALESCE(ai_cost_usd, 0)
WHERE ai_cost_usd IS NULL;

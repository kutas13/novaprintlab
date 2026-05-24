-- Etsy listing attributes (Clothing style / Occasion / Holiday / Graphic)
-- Stored as a single JSONB blob to stay additive and future-proof.
-- Safe to re-run.

alter table public.designs
  add column if not exists seo_attributes jsonb;

-- Backfill nothing — null means "AI hasn't suggested attributes yet".

-- Make sure realtime publishes this column (no-op if already part of the
-- publication, which it should be since the table is already published).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'designs'
  ) then
    alter publication supabase_realtime add table public.designs;
  end if;
end $$;

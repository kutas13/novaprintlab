-- ============================================================
-- NovaPrintLab — Designs table: add SKU column + Taslak status
-- Safe additive migration. Does NOT drop or recreate the table.
-- Run this in Supabase Dashboard → SQL Editor.
-- ============================================================

-- 1) Add sku column (nullable) if it's missing
alter table public.designs
  add column if not exists sku text;

-- 2) Index for sku lookups (used by Etsy order matching)
create index if not exists designs_sku_idx on public.designs(sku);

-- 3) Update status check constraint to allow 'Taslak'.
--    Postgres doesn't have ALTER CONSTRAINT for CHECK; we drop + recreate.
do $$
declare
  cname text;
begin
  select conname
    into cname
  from pg_constraint
  where conrelid = 'public.designs'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%';

  if cname is not null then
    execute format('alter table public.designs drop constraint %I', cname);
  end if;
end $$;

alter table public.designs
  add constraint designs_status_check
  check (status in (
    'SEO Bekliyor',
    'Mockup ve Yayınlama Bekliyor',
    'Taslak',
    'Aktif Mağaza'
  ));

-- 4) (Sanity) make sure RLS + open anon policy still exist for the table.
--    No-op if already set up.
alter table public.designs enable row level security;

drop policy if exists "designs anon all" on public.designs;
create policy "designs anon all"
  on public.designs for all
  to anon
  using (true) with check (true);

-- 5) (Sanity) make sure designs storage bucket is public and writable.
insert into storage.buckets (id, name, public)
values ('designs', 'designs', true)
on conflict (id) do update set public = true;

drop policy if exists "designs bucket read"   on storage.objects;
drop policy if exists "designs bucket insert" on storage.objects;
drop policy if exists "designs bucket update" on storage.objects;
drop policy if exists "designs bucket delete" on storage.objects;

create policy "designs bucket read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'designs');

create policy "designs bucket insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'designs');

create policy "designs bucket update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'designs')
  with check (bucket_id = 'designs');

create policy "designs bucket delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'designs');

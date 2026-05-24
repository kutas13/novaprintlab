-- ============================================================
-- NovaPrintLab — Supabase Schema
-- Supabase Dashboard → SQL Editor → New Query → paste & Run
-- ============================================================

-- 1) Extensions ------------------------------------------------
create extension if not exists "pgcrypto";

-- 2) Clean slate: drop old designs table if it exists ----------
-- Safe because we own the schema; storage objects are managed separately.
drop table if exists public.designs cascade;

-- 3) designs table ---------------------------------------------
create table public.designs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'SEO Bekliyor'
    check (status in ('SEO Bekliyor', 'Mockup ve Yayınlama Bekliyor', 'Aktif Mağaza')),

  original_image_path text not null,
  mockup_image_paths  text[] not null default '{}',

  seo_title       text,
  seo_description text,
  seo_tags        text[],

  pricing_printify_cost numeric(10,2),
  pricing_shipping_cost numeric(10,2),
  pricing_target_profit numeric(10,2),
  pricing_final_price   numeric(10,2),

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  published_at timestamptz
);

create index designs_status_idx       on public.designs(status);
create index designs_published_at_idx on public.designs(published_at);
create index designs_created_at_idx   on public.designs(created_at desc);

-- auto-update updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists designs_touch_updated_at on public.designs;
create trigger designs_touch_updated_at
  before update on public.designs
  for each row execute function public.touch_updated_at();

-- 3) RLS — open for anon (app is gatekept by Next.js middleware)
alter table public.designs enable row level security;

drop policy if exists "designs anon all" on public.designs;
create policy "designs anon all"
  on public.designs for all
  to anon
  using (true) with check (true);

-- 5) Storage bucket (PUBLIC) -----------------------------------
insert into storage.buckets (id, name, public)
values ('designs', 'designs', true)
on conflict (id) do update set public = true;

-- Storage RLS policies — anon read+write to 'designs' bucket
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

-- 6) Realtime --------------------------------------------------
-- Replication for public.designs so all 3 partners see changes live.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'designs'
  ) then
    alter publication supabase_realtime add table public.designs;
  end if;
end $$;

-- ============================================================
-- Done. You should now see the 'designs' table and the 'designs'
-- storage bucket in the Supabase Dashboard.
-- ============================================================

-- ============================================================
-- NovaPrintLab — Orders migration (Etsy siparişleri)
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- Safe to run multiple times. Does NOT touch existing tables.
-- ============================================================

-- 1) orders table ---------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),

  etsy_receipt_id     text not null,
  etsy_transaction_id text,
  order_number        text,

  customer_name    text,
  customer_country text,

  order_date timestamptz,

  status text not null default 'paid'
    check (status in ('paid','processing','shipped','completed','canceled','refunded')),

  product_title     text,
  product_sku       text,
  product_image_url text,
  listing_id        text,
  quantity          integer not null default 1,

  total_price numeric(10,2),
  currency    text default 'USD',

  raw_payload jsonb,

  design_id uuid references public.designs(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (etsy_receipt_id, etsy_transaction_id)
);

create index if not exists orders_status_idx     on public.orders(status);
create index if not exists orders_sku_idx        on public.orders(product_sku);
create index if not exists orders_order_date_idx on public.orders(order_date desc);
create index if not exists orders_design_idx     on public.orders(design_id);

-- 2) Reuse the existing touch_updated_at() trigger function
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'touch_updated_at') then
    create or replace function public.touch_updated_at()
    returns trigger language plpgsql as $body$
    begin
      new.updated_at = now();
      return new;
    end;
    $body$;
  end if;
end $$;

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute function public.touch_updated_at();

-- 3) RLS open for anon (gatekept by Next.js middleware) -------
alter table public.orders enable row level security;
drop policy if exists "orders anon all" on public.orders;
create policy "orders anon all"
  on public.orders for all
  to anon
  using (true) with check (true);

-- 4) Realtime --------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

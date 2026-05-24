-- ============================================================
-- NovaPrintLab — Etsy OAuth credentials storage
-- Single-row table for OAuth access/refresh tokens.
-- Server-only access: RLS enabled with NO policies, so anon
-- cannot read or write. Only routes using SUPABASE_SERVICE_ROLE_KEY
-- (which bypasses RLS) can touch this table.
-- ============================================================

create table if not exists public.etsy_credentials (
  id integer primary key default 1 check (id = 1),

  access_token  text not null,
  refresh_token text not null,
  access_token_expires_at timestamptz not null,

  shop_id   text,
  shop_name text,
  user_id   text,
  scope     text,

  updated_at timestamptz not null default now()
);

-- Reuse touch_updated_at trigger function (created in main schema)
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

drop trigger if exists etsy_credentials_touch_updated_at on public.etsy_credentials;
create trigger etsy_credentials_touch_updated_at
  before update on public.etsy_credentials
  for each row execute function public.touch_updated_at();

-- RLS on, no policies → only service_role can read/write
alter table public.etsy_credentials enable row level security;

-- Explicitly drop any old open policies if a previous version of this
-- file granted anon access by accident.
drop policy if exists "etsy_credentials anon all" on public.etsy_credentials;

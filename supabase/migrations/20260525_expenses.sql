-- Expenses table — team can log one-time spends and recurring subscriptions.
-- Safe to re-run.

create table if not exists public.expenses (
  id              uuid primary key default gen_random_uuid(),
  name            text        not null,
  amount          numeric(10,2) not null,
  currency        text        not null check (currency in ('USD','TRY')),
  is_subscription boolean     not null default false,
  -- Day-of-month the card is charged for the subscription (1-31).
  -- Only meaningful when is_subscription = true.
  subscription_day smallint    check (subscription_day between 1 and 31),
  card_last4      text        check (card_last4 ~ '^[0-9]{4}$'),
  card_owner      text        not null check (card_owner in ('Yusuf','Kerim','Taha')),
  -- expense_date is the user-picked date for non-subscriptions, OR the
  -- start date for subscriptions (the first charge date).
  expense_date    date        not null default (now() at time zone 'utc')::date,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_expenses_expense_date on public.expenses (expense_date desc);
create index if not exists idx_expenses_card_owner on public.expenses (card_owner);
create index if not exists idx_expenses_is_subscription on public.expenses (is_subscription);

-- Auto-update updated_at
create or replace function public.touch_expenses_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_expenses_touch on public.expenses;
create trigger trg_expenses_touch
  before update on public.expenses
  for each row execute function public.touch_expenses_updated_at();

-- RLS: same model as designs/orders — open to anon since the app
-- middleware gates access via the session cookie.
alter table public.expenses enable row level security;

drop policy if exists "expenses anon all" on public.expenses;
create policy "expenses anon all"
  on public.expenses for all
  to anon
  using (true) with check (true);

-- Realtime publication
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'expenses'
  ) then
    alter publication supabase_realtime add table public.expenses;
  end if;
end $$;

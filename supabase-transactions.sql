-- ============================================================================
-- Flux — transactions (history) table
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query).
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE / DROP-then-CREATE.
-- ============================================================================

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  wallet_id uuid not null,
  wallet_name text not null,
  amount numeric not null,
  direction text not null check (direction in ('credit', 'debit')),
  balance_after numeric not null,
  source text not null default 'sms' check (source in ('sms', 'notification', 'manual')),
  created_at timestamptz not null default now()
);

-- Fast "latest N for this user" queries.
create index if not exists transactions_user_created_idx
  on public.transactions (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security: each user can only see/write their own rows.
-- ---------------------------------------------------------------------------
alter table public.transactions enable row level security;

drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own" on public.transactions
  for select using (auth.uid() = user_id);

drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own" on public.transactions
  for insert with check (auth.uid() = user_id);

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own" on public.transactions
  for update using (auth.uid() = user_id);

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own" on public.transactions
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Keep only the newest 50 transactions PER USER. Runs after every insert and
-- deletes that user's oldest rows beyond the cap, so the table never grows
-- unbounded — no app-side cleanup needed.
-- ---------------------------------------------------------------------------
create or replace function public.trim_transactions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.transactions
  where id in (
    select id
    from public.transactions
    where user_id = new.user_id
    order by created_at desc
    offset 50
  );
  return null; -- AFTER trigger; return value ignored
end;
$$;

drop trigger if exists trim_transactions_trigger on public.transactions;
create trigger trim_transactions_trigger
  after insert on public.transactions
  for each row
  execute function public.trim_transactions();

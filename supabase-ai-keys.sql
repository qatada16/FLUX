-- ============================================================================
-- Flux — per-user AI API keys + usage counters
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- RLS restricts every operation to auth.uid() = user_id, so a signed-in user
-- can only ever read or write their OWN keys. No user can reach another
-- user's keys, even though all rows live in one table.
-- ============================================================================

create table if not exists public.ai_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,

  cerebras_key text,
  mistral_key  text,
  gemini_key   text,
  groq_key     text,

  cerebras_usage integer not null default 0,
  mistral_usage  integer not null default 0,
  gemini_usage   integer not null default 0,
  groq_usage     integer not null default 0,

  updated_at timestamptz not null default now()
);

alter table public.ai_keys enable row level security;

drop policy if exists "ai_keys_select_own" on public.ai_keys;
create policy "ai_keys_select_own" on public.ai_keys
  for select using (auth.uid() = user_id);

drop policy if exists "ai_keys_insert_own" on public.ai_keys;
create policy "ai_keys_insert_own" on public.ai_keys
  for insert with check (auth.uid() = user_id);

drop policy if exists "ai_keys_update_own" on public.ai_keys;
create policy "ai_keys_update_own" on public.ai_keys
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "ai_keys_delete_own" on public.ai_keys;
create policy "ai_keys_delete_own" on public.ai_keys
  for delete using (auth.uid() = user_id);

-- Keep updated_at fresh on every write.
create or replace function public.touch_ai_keys()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_ai_keys_trigger on public.ai_keys;
create trigger touch_ai_keys_trigger
  before update on public.ai_keys
  for each row
  execute function public.touch_ai_keys();

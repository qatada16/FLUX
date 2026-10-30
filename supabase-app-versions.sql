-- ============================================================================
-- Flux — published app versions (drives the in-app "Update available" prompt)
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query).
-- Safe to re-run.
--
-- Rows are written by `npm run release` (scripts/release.mjs) using the
-- service-role key, which bypasses RLS. Devices only ever read, and only
-- through the anon/authenticated roles — nobody can publish from the app.
-- ============================================================================

create table if not exists public.app_versions (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'android' check (platform in ('android')),
  -- Android versionCode. Strictly increasing; the app compares against this.
  version_code integer not null,
  -- Human version shown to users, e.g. "1.0.3".
  version_name text not null,
  release_notes text not null default '',
  -- Direct download link to the APK.
  apk_url text not null,
  apk_size_bytes bigint,
  -- When true, the prompt has no "Later" button. Also forces devices that
  -- skipped this release, even if a newer optional one exists.
  mandatory boolean not null default false,
  -- Set to false to withdraw a bad release; devices stop being offered it.
  is_active boolean not null default true,
  eas_build_id text,
  created_at timestamptz not null default now(),
  unique (platform, version_code)
);

create index if not exists app_versions_latest_idx
  on public.app_versions (platform, is_active, version_code desc);

alter table public.app_versions enable row level security;

-- Anyone running the app may see what has been released (signed in or not).
drop policy if exists "app_versions_read" on public.app_versions;
create policy "app_versions_read" on public.app_versions
  for select to anon, authenticated
  using (true);

-- No insert/update/delete policies: only the service role (release script)
-- can change this table.

-- To withdraw a release:
--   update public.app_versions set is_active = false where version_code = <n>;
-- To make an already-published release mandatory:
--   update public.app_versions set mandatory = true where version_code = <n>;

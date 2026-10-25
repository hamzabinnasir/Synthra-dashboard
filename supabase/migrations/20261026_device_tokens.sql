-- Push-notification device tokens for the Flutter mobile app.
-- Run once in the Supabase SQL Editor (project used by the dashboard's default `supabase` client).

create table if not exists public.device_tokens (
  id bigint generated always as identity primary key,
  admin_user_id text not null,
  token text not null unique,
  platform text not null default 'android' check (platform in ('android', 'ios')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists device_tokens_admin_user_id_idx on public.device_tokens (admin_user_id);

-- Only the server (service role) reads/writes this table; no public policies on purpose.
alter table public.device_tokens enable row level security;

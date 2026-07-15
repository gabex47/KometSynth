-- SynthNet custom-auth schema.
-- All application access uses a server-only Supabase service role. RLS intentionally
-- denies direct browser access because SynthNet does not use Supabase Auth identities.

create extension if not exists pgcrypto;

do $$ begin
  create type public.account_type as enum ('normal', 'admin', 'owner');
exception when duplicate_object then null;
end $$;

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (username = lower(username) and username ~ '^[a-z0-9_-]{3,32}$'),
  pin_hash text not null check (length(pin_hash) >= 50),
  account_type public.account_type not null default 'normal',
  created_at timestamptz not null default now(),
  created_by uuid references public.accounts(id) on delete set null,
  last_login timestamptz,
  login_attempts integer not null default 0 check (login_attempts >= 0),
  locked_until timestamptz,
  notes text check (length(notes) <= 2000),
  disabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  "user" text not null,
  action text not null check (length(action) between 1 and 160),
  ip text not null default 'unknown' check (length(ip) <= 64),
  timestamp timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider text not null check (provider in ('openai', 'anthropic', 'gemini')),
  encrypted_key text not null,
  key_hint text not null check (length(key_hint) <= 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, provider)
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  token_hash text not null unique check (length(token_hash) = 64),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  ip text not null default 'unknown' check (length(ip) <= 64),
  user_agent text check (length(user_agent) <= 512)
);

create table if not exists public.website_settings (
  key text primary key check (key ~ '^[a-z0-9_.-]{2,80}$'),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.accounts(id) on delete set null
);

create table if not exists public.feature_flags (
  key text primary key check (key ~ '^[a-z0-9_.-]{2,80}$'),
  enabled boolean not null default true,
  description text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.accounts(id) on delete set null
);

create index if not exists accounts_username_idx on public.accounts (username);
create index if not exists accounts_role_idx on public.accounts (account_type) where disabled = false;
create index if not exists activity_logs_timestamp_idx on public.activity_logs (timestamp desc);
create index if not exists activity_logs_user_idx on public.activity_logs ("user", timestamp desc);
create index if not exists sessions_account_idx on public.sessions (account_id, expires_at desc);
create index if not exists sessions_active_idx on public.sessions (expires_at) where revoked_at is null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists accounts_set_updated_at on public.accounts;
create trigger accounts_set_updated_at before update on public.accounts
for each row execute function public.set_updated_at();

drop trigger if exists api_keys_set_updated_at on public.api_keys;
create trigger api_keys_set_updated_at before update on public.api_keys
for each row execute function public.set_updated_at();

drop trigger if exists website_settings_set_updated_at on public.website_settings;
create trigger website_settings_set_updated_at before update on public.website_settings
for each row execute function public.set_updated_at();

drop trigger if exists feature_flags_set_updated_at on public.feature_flags;
create trigger feature_flags_set_updated_at before update on public.feature_flags
for each row execute function public.set_updated_at();

alter table public.accounts enable row level security;
alter table public.activity_logs enable row level security;
alter table public.api_keys enable row level security;
alter table public.sessions enable row level security;
alter table public.website_settings enable row level security;
alter table public.feature_flags enable row level security;

-- No anon/authenticated policies are created. The service-role client is isolated
-- to the Next.js server, which applies custom-session authorization on every route.
revoke all on public.accounts from anon, authenticated;
revoke all on public.activity_logs from anon, authenticated;
revoke all on public.api_keys from anon, authenticated;
revoke all on public.sessions from anon, authenticated;
revoke all on public.website_settings from anon, authenticated;
revoke all on public.feature_flags from anon, authenticated;

insert into public.website_settings (key, value)
values ('maintenance_mode', '{"enabled": false, "message": ""}'::jsonb)
on conflict (key) do nothing;

insert into public.feature_flags (key, enabled, description) values
  ('ai_sandbox', true, 'Bring-your-own-key AI workspace'),
  ('developer_tools', true, 'Developer tool catalog'),
  ('network_tools', true, 'Defensive network diagnostics'),
  ('security_tools', true, 'Defensive security utilities'),
  ('utilities', true, 'General productivity utilities')
on conflict (key) do nothing;

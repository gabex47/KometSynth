-- Secure invite registration, editable profiles, session controls, and a
-- complete administrative account lifecycle. Browser roles remain deny-all.

create table public.account_profiles (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  display_name text not null default '' check (length(display_name) <= 80),
  bio text not null default '' check (length(bio) <= 500),
  theme text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  updated_at timestamptz not null default now()
);

create table public.registration_invites (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  label text not null default '' check (length(label) <= 80),
  account_type public.account_type not null default 'normal'
    check (account_type in ('normal', 'admin')),
  max_uses integer not null default 1 check (max_uses between 1 and 100),
  use_count integer not null default 0 check (use_count between 0 and max_uses),
  expires_at timestamptz not null,
  disabled boolean not null default false,
  created_by uuid references public.accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  check (expires_at > created_at),
  check (last_used_at is null or last_used_at >= created_at)
);

create index registration_invites_created_idx
  on public.registration_invites (created_at desc);
create index registration_invites_created_by_idx
  on public.registration_invites (created_by)
  where created_by is not null;
create index sessions_account_created_idx
  on public.sessions (account_id, created_at desc);

create trigger account_profiles_set_updated_at before update on public.account_profiles
for each row execute function public.set_updated_at();

create or replace function public.create_account_profile()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.account_profiles (account_id)
  values (new.id)
  on conflict (account_id) do nothing;
  return new;
end;
$$;

create trigger accounts_create_profile after insert on public.accounts
for each row execute function public.create_account_profile();

insert into public.account_profiles (account_id)
select accounts.id from public.accounts
on conflict (account_id) do nothing;

alter table public.account_profiles enable row level security;
alter table public.registration_invites enable row level security;

revoke all on table public.account_profiles from public, anon, authenticated;
revoke all on table public.registration_invites from public, anon, authenticated;
grant select, insert, update, delete on table public.account_profiles to service_role;
grant select, insert, update, delete on table public.registration_invites to service_role;

create or replace function public.register_account(
  p_username text,
  p_pin_hash text,
  p_invite_hash text,
  p_ip text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invite public.registration_invites%rowtype;
  v_account_id uuid;
begin
  if p_username !~ '^[a-z0-9_-]{3,32}$'
     or length(p_pin_hash) < 50
     or p_invite_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid registration parameters' using errcode = '22023';
  end if;

  select * into v_invite
  from public.registration_invites
  where registration_invites.code_hash = p_invite_hash
  for update;

  if not found
     or v_invite.disabled
     or v_invite.expires_at <= clock_timestamp()
     or v_invite.use_count >= v_invite.max_uses then
    raise exception 'registration invite unavailable' using errcode = '28000';
  end if;

  insert into public.accounts (username, pin_hash, account_type, created_by, notes)
  values (
    p_username,
    p_pin_hash,
    v_invite.account_type,
    v_invite.created_by,
    nullif('Invitation: ' || trim(v_invite.label), 'Invitation: ')
  )
  returning accounts.id into v_account_id;

  update public.registration_invites
  set use_count = registration_invites.use_count + 1,
      last_used_at = clock_timestamp(),
      disabled = registration_invites.use_count + 1 >= registration_invites.max_uses
  where registration_invites.id = v_invite.id;

  insert into public.activity_logs ("user", action, ip, metadata)
  values (
    p_username,
    'account_registered',
    left(coalesce(p_ip, 'unknown'), 64),
    jsonb_build_object('account_id', v_account_id, 'invite_id', v_invite.id)
  );

  return v_account_id;
end;
$$;

create or replace function public.create_registration_invite(
  p_actor_session_hash text,
  p_code_hash text,
  p_label text,
  p_account_type public.account_type,
  p_max_uses integer,
  p_expires_at timestamptz,
  p_ip text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor public.accounts%rowtype;
  v_invite_id uuid;
begin
  v_actor := private.require_actor(p_actor_session_hash, 2);
  if p_code_hash !~ '^[a-f0-9]{64}$'
     or p_account_type not in ('normal', 'admin')
     or (p_account_type = 'admin' and v_actor.account_type <> 'owner')
     or p_max_uses not between 1 and 100
     or p_expires_at <= now()
     or p_expires_at > now() + interval '90 days' then
    raise exception 'invalid invite parameters' using errcode = '22023';
  end if;

  insert into public.registration_invites (
    code_hash, label, account_type, max_uses, expires_at, created_by
  ) values (
    p_code_hash, left(trim(p_label), 80), p_account_type, p_max_uses, p_expires_at, v_actor.id
  ) returning registration_invites.id into v_invite_id;

  insert into public.activity_logs ("user", action, ip, metadata)
  values (
    v_actor.username,
    'registration_invite_created',
    left(coalesce(p_ip, 'unknown'), 64),
    jsonb_build_object('invite_id', v_invite_id, 'account_type', p_account_type)
  );
  return v_invite_id;
end;
$$;

create or replace function public.get_registration_invites(p_actor_session_hash text)
returns table(
  id uuid,
  label text,
  account_type public.account_type,
  max_uses integer,
  use_count integer,
  expires_at timestamptz,
  disabled boolean,
  created_at timestamptz,
  last_used_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform private.require_actor(p_actor_session_hash, 2);
  return query
  select
    registration_invites.id,
    registration_invites.label,
    registration_invites.account_type,
    registration_invites.max_uses,
    registration_invites.use_count,
    registration_invites.expires_at,
    registration_invites.disabled,
    registration_invites.created_at,
    registration_invites.last_used_at
  from public.registration_invites
  order by registration_invites.created_at desc
  limit 200;
end;
$$;

create or replace function public.revoke_registration_invite(
  p_actor_session_hash text,
  p_invite_id uuid,
  p_ip text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor public.accounts%rowtype;
  v_changed boolean;
begin
  v_actor := private.require_actor(p_actor_session_hash, 2);
  update public.registration_invites
  set disabled = true
  where registration_invites.id = p_invite_id
    and registration_invites.disabled = false;
  v_changed := found;
  if v_changed then
    insert into public.activity_logs ("user", action, ip, metadata)
    values (
      v_actor.username,
      'registration_invite_revoked',
      left(coalesce(p_ip, 'unknown'), 64),
      jsonb_build_object('invite_id', p_invite_id)
    );
  end if;
  return v_changed;
end;
$$;

create or replace function public.get_own_profile(p_actor_session_hash text)
returns table(display_name text, bio text, theme text)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_actor public.accounts%rowtype;
begin
  v_actor := private.require_actor(p_actor_session_hash, 1);
  return query
  select account_profiles.display_name, account_profiles.bio, account_profiles.theme
  from public.account_profiles
  where account_profiles.account_id = v_actor.id;
end;
$$;

create or replace function public.update_own_profile(
  p_actor_session_hash text,
  p_display_name text,
  p_bio text,
  p_theme text,
  p_ip text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor public.accounts%rowtype;
begin
  v_actor := private.require_actor(p_actor_session_hash, 1);
  if length(trim(p_display_name)) > 80
     or length(trim(p_bio)) > 500
     or p_theme not in ('dark', 'light', 'system') then
    raise exception 'invalid profile parameters' using errcode = '22023';
  end if;

  insert into public.account_profiles (account_id, display_name, bio, theme)
  values (v_actor.id, trim(p_display_name), trim(p_bio), p_theme)
  on conflict (account_id) do update
  set display_name = excluded.display_name,
      bio = excluded.bio,
      theme = excluded.theme;

  insert into public.activity_logs ("user", action, ip)
  values (v_actor.username, 'profile_updated', left(coalesce(p_ip, 'unknown'), 64));
end;
$$;

create or replace function public.change_own_pin(
  p_actor_session_hash text,
  p_pin_hash text,
  p_ip text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor public.accounts%rowtype;
begin
  v_actor := private.require_actor(p_actor_session_hash, 1);
  if length(p_pin_hash) < 50 then
    raise exception 'invalid PIN hash' using errcode = '22023';
  end if;

  update public.accounts set pin_hash = p_pin_hash where accounts.id = v_actor.id;
  update public.sessions
  set revoked_at = clock_timestamp()
  where sessions.account_id = v_actor.id
    and sessions.token_hash <> p_actor_session_hash
    and sessions.revoked_at is null;

  insert into public.activity_logs ("user", action, ip)
  values (v_actor.username, 'pin_changed', left(coalesce(p_ip, 'unknown'), 64));
end;
$$;

create or replace function public.get_own_sessions(p_actor_session_hash text)
returns table(
  id uuid,
  created_at timestamptz,
  expires_at timestamptz,
  ip text,
  user_agent text,
  is_current boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_actor public.accounts%rowtype;
begin
  v_actor := private.require_actor(p_actor_session_hash, 1);
  return query
  select
    sessions.id,
    sessions.created_at,
    sessions.expires_at,
    sessions.ip,
    coalesce(sessions.user_agent, 'Unknown client'),
    sessions.token_hash = p_actor_session_hash
  from public.sessions
  where sessions.account_id = v_actor.id
    and sessions.revoked_at is null
    and sessions.expires_at > now()
  order by sessions.created_at desc;
end;
$$;

create or replace function public.revoke_own_session(
  p_actor_session_hash text,
  p_session_id uuid,
  p_ip text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor public.accounts%rowtype;
  v_changed boolean;
begin
  v_actor := private.require_actor(p_actor_session_hash, 1);
  update public.sessions
  set revoked_at = clock_timestamp()
  where sessions.id = p_session_id
    and sessions.account_id = v_actor.id
    and sessions.token_hash <> p_actor_session_hash
    and sessions.revoked_at is null;
  v_changed := found;
  if v_changed then
    insert into public.activity_logs ("user", action, ip, metadata)
    values (
      v_actor.username,
      'session_revoked',
      left(coalesce(p_ip, 'unknown'), 64),
      jsonb_build_object('session_id', p_session_id)
    );
  end if;
  return v_changed;
end;
$$;

create or replace function public.revoke_other_sessions(
  p_actor_session_hash text,
  p_ip text
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor public.accounts%rowtype;
  v_count bigint;
begin
  v_actor := private.require_actor(p_actor_session_hash, 1);
  update public.sessions
  set revoked_at = clock_timestamp()
  where sessions.account_id = v_actor.id
    and sessions.token_hash <> p_actor_session_hash
    and sessions.revoked_at is null;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    insert into public.activity_logs ("user", action, ip, metadata)
    values (
      v_actor.username,
      'other_sessions_revoked',
      left(coalesce(p_ip, 'unknown'), 64),
      jsonb_build_object('count', v_count)
    );
  end if;
  return v_count;
end;
$$;

create or replace function public.update_managed_account(
  p_actor_session_hash text,
  p_account_id uuid,
  p_action text,
  p_pin_hash text,
  p_account_type public.account_type,
  p_ip text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor public.accounts%rowtype;
  v_target public.accounts%rowtype;
  v_removes_owner boolean;
begin
  if p_action not in (
    'lock', 'unlock', 'disable', 'enable', 'reset_pin', 'set_role',
    'force_logout', 'delete'
  ) then
    raise exception 'invalid account action' using errcode = '22023';
  end if;

  v_actor := private.require_actor(p_actor_session_hash, 2);
  select * into v_target from public.accounts
  where accounts.id = p_account_id for update;
  if not found then
    raise exception 'account not found' using errcode = 'P0002';
  end if;

  if v_target.account_type = 'owner' and v_actor.account_type <> 'owner' then
    raise exception 'owner accounts are protected' using errcode = '42501';
  end if;
  if p_action = 'set_role' and p_account_type = 'owner' and v_actor.account_type <> 'owner' then
    raise exception 'only owners can grant owner access' using errcode = '42501';
  end if;
  if v_actor.id = v_target.id and p_action in ('lock', 'disable', 'force_logout', 'delete') then
    raise exception 'cannot revoke current account' using errcode = '23000';
  end if;
  if p_action = 'reset_pin' and p_pin_hash is null then
    raise exception 'new PIN hash required' using errcode = '22023';
  end if;
  if p_action = 'set_role' and p_account_type is null then
    raise exception 'role required' using errcode = '22023';
  end if;

  v_removes_owner := v_target.account_type = 'owner' and (
    p_action in ('lock', 'disable', 'delete')
    or (p_action = 'set_role' and p_account_type <> 'owner')
  );
  if v_removes_owner and not exists (
    select 1 from public.accounts as candidate
    where candidate.id <> v_target.id
      and candidate.account_type = 'owner'
      and candidate.disabled = false
      and (candidate.locked_until is null or candidate.locked_until <= now())
  ) then
    raise exception 'at least one active owner is required' using errcode = '23000';
  end if;

  if p_action = 'delete' then
    insert into public.activity_logs ("user", action, ip, metadata)
    values (
      v_actor.username,
      'account_deleted_' || v_target.username,
      left(coalesce(p_ip, 'unknown'), 64),
      jsonb_build_object('target_account_id', v_target.id, 'target_role', v_target.account_type)
    );
    delete from public.accounts where accounts.id = v_target.id;
    return;
  end if;

  update public.accounts
  set locked_until = case
        when p_action = 'lock' then clock_timestamp() + interval '24 hours'
        when p_action = 'unlock' then null
        else accounts.locked_until
      end,
      login_attempts = case when p_action = 'unlock' then 0 else accounts.login_attempts end,
      disabled = case
        when p_action = 'disable' then true
        when p_action = 'enable' then false
        else accounts.disabled
      end,
      pin_hash = case when p_action = 'reset_pin' then p_pin_hash else accounts.pin_hash end,
      account_type = case when p_action = 'set_role' then p_account_type else accounts.account_type end
  where accounts.id = v_target.id;

  if p_action in ('lock', 'disable', 'reset_pin', 'set_role', 'force_logout') then
    update public.sessions set revoked_at = clock_timestamp()
    where sessions.account_id = v_target.id and sessions.revoked_at is null;
  end if;

  insert into public.activity_logs ("user", action, ip, metadata)
  values (
    v_actor.username,
    'account_' || p_action || '_' || v_target.username,
    left(coalesce(p_ip, 'unknown'), 64),
    jsonb_build_object('target_account_id', v_target.id)
  );
end;
$$;

revoke all on function public.create_account_profile() from public, anon, authenticated;
revoke all on function public.register_account(text, text, text, text) from public, anon, authenticated;
revoke all on function public.create_registration_invite(text, text, text, public.account_type, integer, timestamptz, text) from public, anon, authenticated;
revoke all on function public.get_registration_invites(text) from public, anon, authenticated;
revoke all on function public.revoke_registration_invite(text, uuid, text) from public, anon, authenticated;
revoke all on function public.get_own_profile(text) from public, anon, authenticated;
revoke all on function public.update_own_profile(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.change_own_pin(text, text, text) from public, anon, authenticated;
revoke all on function public.get_own_sessions(text) from public, anon, authenticated;
revoke all on function public.revoke_own_session(text, uuid, text) from public, anon, authenticated;
revoke all on function public.revoke_other_sessions(text, text) from public, anon, authenticated;

grant execute on function public.create_account_profile() to service_role;
grant execute on function public.register_account(text, text, text, text) to service_role;
grant execute on function public.create_registration_invite(text, text, text, public.account_type, integer, timestamptz, text) to service_role;
grant execute on function public.get_registration_invites(text) to service_role;
grant execute on function public.revoke_registration_invite(text, uuid, text) to service_role;
grant execute on function public.get_own_profile(text) to service_role;
grant execute on function public.update_own_profile(text, text, text, text, text) to service_role;
grant execute on function public.change_own_pin(text, text, text) to service_role;
grant execute on function public.get_own_sessions(text) to service_role;
grant execute on function public.revoke_own_session(text, uuid, text) to service_role;
grant execute on function public.revoke_other_sessions(text, text) to service_role;

revoke all on all tables in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

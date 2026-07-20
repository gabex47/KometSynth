-- Keep the browser-facing PostgREST roles deny-by-default. Custom SynthNet
-- sessions are validated by server-only RPCs invoked with the service role.

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table private.rate_limits (
  key_hash text primary key check (key_hash ~ '^[a-f0-9]{64}$'),
  hits integer not null check (hits > 0),
  window_started_at timestamptz not null,
  updated_at timestamptz not null
);

revoke all on table private.rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table private.rate_limits to service_role;

create index accounts_created_by_idx on public.accounts (created_by)
where created_by is not null;
create index feature_flags_updated_by_idx on public.feature_flags (updated_by)
where updated_by is not null;
create index website_settings_updated_by_idx on public.website_settings (updated_by)
where updated_by is not null;
create index rate_limits_updated_at_idx on private.rate_limits (updated_at);

-- The unique constraint on username already supplies the same B-tree.
drop index if exists public.accounts_username_idx;

alter table public.activity_logs
  add constraint activity_logs_metadata_object_check
  check (jsonb_typeof(metadata) = 'object');

alter table public.api_keys
  add constraint api_keys_encrypted_key_length_check
  check (length(encrypted_key) between 20 and 4096);

alter table public.sessions
  add constraint sessions_expiry_after_creation_check
  check (expires_at > created_at),
  add constraint sessions_revocation_after_creation_check
  check (revoked_at is null or revoked_at >= created_at);

create or replace function public.consume_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, retry_after integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_cutoff timestamptz;
  v_row private.rate_limits%rowtype;
begin
  if p_key_hash !~ '^[a-f0-9]{64}$'
     or p_limit not between 1 and 10000
     or p_window_seconds not between 1 and 86400 then
    raise exception 'invalid rate limit parameters' using errcode = '22023';
  end if;

  v_cutoff := v_now - make_interval(secs => p_window_seconds);

  insert into private.rate_limits (key_hash, hits, window_started_at, updated_at)
  values (p_key_hash, 1, v_now, v_now)
  on conflict (key_hash) do update
  set hits = case
        when private.rate_limits.window_started_at <= v_cutoff then 1
        else private.rate_limits.hits + 1
      end,
      window_started_at = case
        when private.rate_limits.window_started_at <= v_cutoff then v_now
        else private.rate_limits.window_started_at
      end,
      updated_at = v_now
  returning * into v_row;

  allowed := v_row.hits <= p_limit;
  retry_after := case
    when allowed then 0
    else greatest(1, ceil(extract(epoch from
      (v_row.window_started_at + make_interval(secs => p_window_seconds) - v_now)
    ))::integer)
  end;
  return next;
end;
$$;

create or replace function public.clear_rate_limit(p_key_hash text)
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from private.rate_limits where key_hash = p_key_hash;
$$;

create or replace function public.get_session_account(p_token_hash text)
returns table(
  id uuid,
  username text,
  account_type public.account_type,
  created_at timestamptz,
  last_login timestamptz,
  disabled boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    account.id,
    account.username,
    account.account_type,
    account.created_at,
    account.last_login,
    account.disabled
  from public.sessions as session
  join public.accounts as account on account.id = session.account_id
  where session.token_hash = p_token_hash
    and session.revoked_at is null
    and session.expires_at > now()
    and account.disabled = false
  limit 1;
$$;

create or replace function public.record_login_attempt(
  p_account_id uuid,
  p_valid boolean,
  p_ip text
)
returns table(
  outcome text,
  id uuid,
  username text,
  account_type public.account_type,
  created_at timestamptz,
  last_login timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_account public.accounts%rowtype;
  v_now timestamptz := clock_timestamp();
  v_attempts integer;
begin
  select * into v_account
  from public.accounts
  where accounts.id = p_account_id
  for update;

  if not found then
    outcome := 'denied';
    return next;
    return;
  end if;

  if v_account.disabled then
    insert into public.activity_logs ("user", action, ip)
    values (v_account.username, 'login_failed_disabled', left(coalesce(p_ip, 'unknown'), 64));
    outcome := 'denied';
    return next;
    return;
  end if;

  if v_account.locked_until is not null and v_account.locked_until > v_now then
    insert into public.activity_logs ("user", action, ip)
    values (v_account.username, 'login_failed_locked', left(coalesce(p_ip, 'unknown'), 64));
    outcome := 'locked';
    return next;
    return;
  end if;

  if not p_valid then
    v_attempts := case
      when v_account.locked_until is not null and v_account.locked_until <= v_now then 1
      else v_account.login_attempts + 1
    end;

    update public.accounts
    set login_attempts = v_attempts,
        locked_until = case when v_attempts >= 5 then v_now + interval '15 minutes' else null end
    where accounts.id = v_account.id;

    insert into public.activity_logs ("user", action, ip)
    values (
      v_account.username,
      case when v_attempts >= 5 then 'account_locked' else 'login_failed_pin' end,
      left(coalesce(p_ip, 'unknown'), 64)
    );

    outcome := case when v_attempts >= 5 then 'locked' else 'invalid' end;
    return next;
    return;
  end if;

  update public.accounts
  set login_attempts = 0,
      locked_until = null,
      last_login = v_now
  where accounts.id = v_account.id
  returning accounts.last_login into v_account.last_login;

  outcome := 'success';
  id := v_account.id;
  username := v_account.username;
  account_type := v_account.account_type;
  created_at := v_account.created_at;
  last_login := v_account.last_login;
  return next;
end;
$$;

create or replace function public.create_session(
  p_account_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_ip text,
  p_user_agent text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_username text;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$'
     or p_expires_at <= now()
     or p_expires_at > now() + interval '24 hours' then
    raise exception 'invalid session parameters' using errcode = '22023';
  end if;

  select accounts.username into v_username
  from public.accounts
  where accounts.id = p_account_id and accounts.disabled = false
  for share;

  if not found then
    raise exception 'account unavailable' using errcode = '28000';
  end if;

  insert into public.sessions (account_id, token_hash, expires_at, ip, user_agent)
  values (
    p_account_id,
    p_token_hash,
    p_expires_at,
    left(coalesce(p_ip, 'unknown'), 64),
    left(coalesce(p_user_agent, 'unknown'), 512)
  );

  insert into public.activity_logs ("user", action, ip)
  values (v_username, 'login_success', left(coalesce(p_ip, 'unknown'), 64));
end;
$$;

create or replace function public.revoke_session(p_token_hash text, p_ip text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_username text;
begin
  select account.username into v_username
  from public.sessions as session
  join public.accounts as account on account.id = session.account_id
  where session.token_hash = p_token_hash and session.revoked_at is null
  for update of session;

  if found then
    update public.sessions
    set revoked_at = clock_timestamp()
    where sessions.token_hash = p_token_hash and sessions.revoked_at is null;

    insert into public.activity_logs ("user", action, ip)
    values (v_username, 'logout', left(coalesce(p_ip, 'unknown'), 64));
  end if;
end;
$$;

create or replace function private.require_actor(
  p_session_token_hash text,
  p_minimum_rank integer
)
returns public.accounts
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_actor public.accounts%rowtype;
  v_rank integer;
begin
  select account.* into v_actor
  from public.sessions as session
  join public.accounts as account on account.id = session.account_id
  where session.token_hash = p_session_token_hash
    and session.revoked_at is null
    and session.expires_at > now()
    and account.disabled = false;

  if not found then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  v_rank := case v_actor.account_type when 'owner' then 3 when 'admin' then 2 else 1 end;
  if v_rank < p_minimum_rank then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

create or replace function public.create_managed_account(
  p_actor_session_hash text,
  p_username text,
  p_pin_hash text,
  p_account_type public.account_type,
  p_notes text,
  p_ip text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor public.accounts%rowtype;
  v_account_id uuid;
begin
  v_actor := private.require_actor(p_actor_session_hash, 2);

  if p_account_type = 'owner' and v_actor.account_type <> 'owner' then
    raise exception 'only owners can create owners' using errcode = '42501';
  end if;

  insert into public.accounts (username, pin_hash, account_type, created_by, notes)
  values (p_username, p_pin_hash, p_account_type, v_actor.id, nullif(trim(p_notes), ''))
  returning accounts.id into v_account_id;

  insert into public.activity_logs ("user", action, ip, metadata)
  values (
    v_actor.username,
    'account_created_' || p_account_type::text || '_' || p_username,
    left(coalesce(p_ip, 'unknown'), 64),
    jsonb_build_object('target_account_id', v_account_id)
  );

  return v_account_id;
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
  if p_action not in ('lock', 'unlock', 'disable', 'enable', 'reset_pin', 'set_role') then
    raise exception 'invalid account action' using errcode = '22023';
  end if;

  v_actor := private.require_actor(p_actor_session_hash, 2);

  select * into v_target
  from public.accounts
  where accounts.id = p_account_id
  for update;

  if not found then
    raise exception 'account not found' using errcode = 'P0002';
  end if;

  if v_target.account_type = 'owner' and v_actor.account_type <> 'owner' then
    raise exception 'owner accounts are protected' using errcode = '42501';
  end if;
  if p_action = 'set_role' and p_account_type = 'owner' and v_actor.account_type <> 'owner' then
    raise exception 'only owners can grant owner access' using errcode = '42501';
  end if;
  if v_actor.id = v_target.id and p_action in ('lock', 'disable') then
    raise exception 'cannot revoke current account' using errcode = '23000';
  end if;
  if p_action = 'reset_pin' and p_pin_hash is null then
    raise exception 'new PIN hash required' using errcode = '22023';
  end if;
  if p_action = 'set_role' and p_account_type is null then
    raise exception 'role required' using errcode = '22023';
  end if;

  v_removes_owner := v_target.account_type = 'owner' and (
    p_action in ('lock', 'disable')
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

  if p_action in ('lock', 'disable', 'reset_pin', 'set_role') then
    update public.sessions
    set revoked_at = clock_timestamp()
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

create or replace function public.upsert_api_key(
  p_actor_session_hash text,
  p_provider text,
  p_encrypted_key text,
  p_key_hint text,
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
  if p_provider not in ('openai', 'anthropic', 'gemini') then
    raise exception 'unsupported provider' using errcode = '22023';
  end if;

  insert into public.api_keys (account_id, provider, encrypted_key, key_hint)
  values (v_actor.id, p_provider, p_encrypted_key, p_key_hint)
  on conflict (account_id, provider) do update
  set encrypted_key = excluded.encrypted_key,
      key_hint = excluded.key_hint;

  insert into public.activity_logs ("user", action, ip)
  values (
    v_actor.username,
    'api_key_updated_' || p_provider,
    left(coalesce(p_ip, 'unknown'), 64)
  );
end;
$$;

create or replace function public.cleanup_expired_sessions()
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deleted_count bigint;
begin
  delete from public.sessions
  where expires_at < now() - interval '7 days'
     or (revoked_at is not null and revoked_at < now() - interval '7 days');
  get diagnostics deleted_count = row_count;

  delete from private.rate_limits
  where updated_at < now() - interval '24 hours';

  return deleted_count;
end;
$$;

-- Functions are executable by PUBLIC unless explicitly revoked in PostgreSQL.
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.clear_rate_limit(text) from public, anon, authenticated;
revoke all on function public.get_session_account(text) from public, anon, authenticated;
revoke all on function public.record_login_attempt(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.create_session(uuid, text, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.revoke_session(text, text) from public, anon, authenticated;
revoke all on function private.require_actor(text, integer) from public, anon, authenticated;
revoke all on function public.create_managed_account(text, text, text, public.account_type, text, text) from public, anon, authenticated;
revoke all on function public.update_managed_account(text, uuid, text, text, public.account_type, text) from public, anon, authenticated;
revoke all on function public.upsert_api_key(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.cleanup_expired_sessions() from public, anon, authenticated;

grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
grant execute on function public.clear_rate_limit(text) to service_role;
grant execute on function public.get_session_account(text) to service_role;
grant execute on function public.record_login_attempt(uuid, boolean, text) to service_role;
grant execute on function public.create_session(uuid, text, timestamptz, text, text) to service_role;
grant execute on function public.revoke_session(text, text) to service_role;
grant execute on function private.require_actor(text, integer) to service_role;
grant execute on function public.create_managed_account(text, text, text, public.account_type, text, text) to service_role;
grant execute on function public.update_managed_account(text, uuid, text, text, public.account_type, text) to service_role;
grant execute on function public.upsert_api_key(text, text, text, text, text) to service_role;
grant execute on function public.cleanup_expired_sessions() to service_role;

revoke all on all tables in schema public from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;

alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke all on tables from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

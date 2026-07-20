-- Product-facing read models and atomic secret deletion. All functions recheck
-- the custom session and remain executable only by the server's service role.

create index activity_logs_pagination_idx
  on public.activity_logs (timestamp desc, id desc);
create index activity_logs_user_pagination_idx
  on public.activity_logs ("user", timestamp desc, id desc);

drop index if exists public.activity_logs_timestamp_idx;
drop index if exists public.activity_logs_user_idx;

create or replace function public.get_dashboard_summary(p_actor_session_hash text)
returns table(
  configured_providers bigint,
  events_today bigint,
  active_sessions bigint,
  recent_activity jsonb
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

  select count(*) into configured_providers
  from public.api_keys
  where api_keys.account_id = v_actor.id;

  select count(*) into events_today
  from public.activity_logs
  where activity_logs.timestamp >= date_trunc('day', now())
    and (v_actor.account_type <> 'normal' or activity_logs."user" = v_actor.username);

  select count(*) into active_sessions
  from public.sessions
  where sessions.account_id = v_actor.id
    and sessions.revoked_at is null
    and sessions.expires_at > now();

  select coalesce(jsonb_agg(to_jsonb(event_row)), '[]'::jsonb)
  into recent_activity
  from (
    select
      activity_logs.id,
      activity_logs."user",
      activity_logs.action,
      activity_logs.timestamp
    from public.activity_logs
    where v_actor.account_type <> 'normal' or activity_logs."user" = v_actor.username
    order by activity_logs.timestamp desc, activity_logs.id desc
    limit 5
  ) as event_row;

  return next;
end;
$$;

create or replace function public.get_activity_page(
  p_actor_session_hash text,
  p_before_timestamp timestamptz,
  p_before_id uuid,
  p_limit integer
)
returns table(
  id uuid,
  "user" text,
  action text,
  ip text,
  "timestamp" timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_actor public.accounts%rowtype;
begin
  if p_limit not between 1 and 100
     or ((p_before_timestamp is null) <> (p_before_id is null)) then
    raise exception 'invalid activity page parameters' using errcode = '22023';
  end if;

  v_actor := private.require_actor(p_actor_session_hash, 1);

  return query
  select
    activity_logs.id,
    activity_logs."user",
    activity_logs.action,
    activity_logs.ip,
    activity_logs.timestamp
  from public.activity_logs
  where (v_actor.account_type <> 'normal' or activity_logs."user" = v_actor.username)
    and (
      p_before_timestamp is null
      or (activity_logs.timestamp, activity_logs.id) < (p_before_timestamp, p_before_id)
    )
  order by activity_logs.timestamp desc, activity_logs.id desc
  limit p_limit;
end;
$$;

create or replace function public.delete_api_key(
  p_actor_session_hash text,
  p_provider text,
  p_ip text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor public.accounts%rowtype;
  v_deleted_id uuid;
begin
  v_actor := private.require_actor(p_actor_session_hash, 1);
  if p_provider not in ('openai', 'anthropic', 'gemini') then
    raise exception 'unsupported provider' using errcode = '22023';
  end if;

  delete from public.api_keys
  where api_keys.account_id = v_actor.id
    and api_keys.provider = p_provider
  returning api_keys.id into v_deleted_id;

  if v_deleted_id is null then
    return false;
  end if;

  insert into public.activity_logs ("user", action, ip)
  values (
    v_actor.username,
    'api_key_deleted_' || p_provider,
    left(coalesce(p_ip, 'unknown'), 64)
  );
  return true;
end;
$$;

revoke all on function public.get_dashboard_summary(text) from public, anon, authenticated;
revoke all on function public.get_activity_page(text, timestamptz, uuid, integer) from public, anon, authenticated;
revoke all on function public.delete_api_key(text, text, text) from public, anon, authenticated;

grant execute on function public.get_dashboard_summary(text) to service_role;
grant execute on function public.get_activity_page(text, timestamptz, uuid, integer) to service_role;
grant execute on function public.delete_api_key(text, text, text) to service_role;

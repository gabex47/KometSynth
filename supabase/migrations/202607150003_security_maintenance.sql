-- Bound expired-session cleanup without exposing arbitrary database execution.
create or replace function public.cleanup_expired_sessions()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count bigint;
begin
  delete from public.sessions
  where expires_at < now() - interval '7 days'
     or (revoked_at is not null and revoked_at < now() - interval '7 days');
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_expired_sessions() from public, anon, authenticated;
grant execute on function public.cleanup_expired_sessions() to service_role;

-- Append-only audit records for all ordinary application operations.
create or replace function public.block_activity_log_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'activity logs are append-only';
end;
$$;

drop trigger if exists activity_logs_append_only on public.activity_logs;
create trigger activity_logs_append_only
before update or delete on public.activity_logs
for each row execute function public.block_activity_log_mutation();

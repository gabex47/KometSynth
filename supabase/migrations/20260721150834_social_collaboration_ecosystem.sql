-- SynthNet social and collaboration platform.
-- The application uses custom, server-side sessions rather than Supabase Auth.
-- Every table is RLS protected and hidden from browser roles; the Next.js server
-- uses the service role and passes the current session hash to atomic RPCs.

create extension if not exists pg_trgm with schema extensions;

do $$ begin
  create type public.presence_state as enum ('online', 'away', 'dnd', 'offline');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.conversation_kind as enum ('direct', 'group', 'world');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.conversation_role as enum ('owner', 'admin', 'member');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.message_kind as enum ('text', 'image', 'video', 'document', 'voice', 'gif', 'system');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.friendship_state as enum ('pending', 'accepted', 'declined');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.invite_state as enum ('pending', 'accepted', 'declined', 'revoked');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.notification_kind as enum (
    'friend_request', 'friend_accepted', 'mention', 'direct_message',
    'group_message', 'group_invite', 'reply', 'reaction', 'announcement'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.report_state as enum ('open', 'reviewing', 'resolved', 'dismissed');
exception when duplicate_object then null;
end $$;

alter table public.account_profiles
  add column if not exists avatar_path text,
  add column if not exists banner_path text,
  add column if not exists links jsonb not null default '[]'::jsonb,
  add column if not exists status_text text not null default '',
  add column if not exists badges text[] not null default '{}'::text[],
  add column if not exists privacy jsonb not null default '{"activity":"friends","mutuals":true,"presence":true,"friendRequests":true}'::jsonb;

alter table public.account_profiles
  drop constraint if exists account_profiles_status_text_check;
alter table public.account_profiles
  add constraint account_profiles_status_text_check check (length(status_text) <= 120),
  add constraint account_profiles_links_check check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 8),
  add constraint account_profiles_privacy_check check (jsonb_typeof(privacy) = 'object'),
  add constraint account_profiles_avatar_path_check check (avatar_path is null or length(avatar_path) <= 512),
  add constraint account_profiles_banner_path_check check (banner_path is null or length(banner_path) <= 512);

create table public.user_presence (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  state public.presence_state not null default 'offline',
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.accounts(id) on delete cascade,
  addressee_id uuid not null references public.accounts(id) on delete cascade,
  state public.friendship_state not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

create unique index friendships_pair_uidx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_requester_idx on public.friendships (requester_id, state, created_at desc);
create index friendships_addressee_idx on public.friendships (addressee_id, state, created_at desc);

create table public.user_blocks (
  blocker_id uuid not null references public.accounts(id) on delete cascade,
  blocked_id uuid not null references public.accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index user_blocks_blocked_idx on public.user_blocks (blocked_id, blocker_id);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind public.conversation_kind not null,
  name text,
  description text not null default '',
  avatar_path text,
  owner_id uuid references public.accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((kind = 'group' and name is not null and length(btrim(name)) between 1 and 80)
    or (kind <> 'group' and name is null)),
  check (length(description) <= 500),
  check (avatar_path is null or length(avatar_path) <= 512)
);
create unique index conversations_world_uidx on public.conversations (kind) where kind = 'world' and deleted_at is null;
create index conversations_updated_idx on public.conversations (updated_at desc) where deleted_at is null;

create table public.direct_conversation_pairs (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  account_low uuid not null references public.accounts(id) on delete cascade,
  account_high uuid not null references public.accounts(id) on delete cascade,
  unique (account_low, account_high),
  check (account_low < account_high)
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  role public.conversation_role not null default 'member',
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  notifications text not null default 'all' check (notifications in ('all', 'mentions', 'none')),
  primary key (conversation_id, account_id)
);
create index conversation_members_account_idx on public.conversation_members (account_id, joined_at desc);
create index conversation_members_conversation_role_idx on public.conversation_members (conversation_id, role);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid references public.accounts(id) on delete set null,
  kind public.message_kind not null default 'text',
  content text not null default '',
  reply_to_id uuid references public.messages(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  search_vector tsvector generated always as (to_tsvector('simple', content)) stored,
  check (length(content) <= 8000),
  check (jsonb_typeof(metadata) = 'object'),
  check (kind <> 'text' or deleted_at is not null or length(btrim(content)) > 0)
);
create index messages_conversation_page_idx on public.messages (conversation_id, created_at desc, id desc);
create index messages_sender_idx on public.messages (sender_id, created_at desc);
create index messages_reply_idx on public.messages (reply_to_id) where reply_to_id is not null;
create index messages_search_idx on public.messages using gin (search_vector);
create index messages_content_trgm_idx on public.messages using gin (content extensions.gin_trgm_ops);

create table public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  emoji text not null check (length(emoji) between 1 and 24),
  created_at timestamptz not null default now(),
  primary key (message_id, account_id, emoji)
);
create index message_reactions_account_idx on public.message_reactions (account_id, created_at desc);

create table public.message_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, account_id)
);
create index message_receipts_account_idx on public.message_receipts (account_id, read_at desc);

create table public.pinned_messages (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  pinned_by uuid not null references public.accounts(id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (conversation_id, message_id)
);

create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  uploader_id uuid not null references public.accounts(id) on delete cascade,
  storage_path text not null unique check (length(storage_path) between 3 and 512),
  file_name text not null check (length(file_name) between 1 and 255),
  mime_type text not null check (length(mime_type) between 3 and 120),
  byte_size bigint not null check (byte_size between 1 and 26214400),
  duration_seconds numeric(8,2) check (duration_seconds is null or duration_seconds between 0 and 3600),
  created_at timestamptz not null default now()
);
create index message_attachments_message_idx on public.message_attachments (message_id);
create index message_attachments_uploader_idx on public.message_attachments (uploader_id, created_at desc);

create table public.typing_indicators (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  expires_at timestamptz not null,
  primary key (conversation_id, account_id)
);
create index typing_indicators_expiry_idx on public.typing_indicators (expires_at);

create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  inviter_id uuid not null references public.accounts(id) on delete cascade,
  invitee_id uuid not null references public.accounts(id) on delete cascade,
  state public.invite_state not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  responded_at timestamptz,
  check (inviter_id <> invitee_id)
);
create unique index group_invites_pending_uidx on public.group_invites (conversation_id, invitee_id) where state = 'pending';
create index group_invites_invitee_idx on public.group_invites (invitee_id, state, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  actor_id uuid references public.accounts(id) on delete set null,
  kind public.notification_kind not null,
  title text not null check (length(title) between 1 and 160),
  body text not null default '' check (length(body) <= 500),
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  friendship_id uuid references public.friendships(id) on delete cascade,
  invite_id uuid references public.group_invites(id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (jsonb_typeof(metadata) = 'object')
);
create index notifications_unread_idx on public.notifications (account_id, created_at desc) where read_at is null;
create index notifications_page_idx on public.notifications (account_id, created_at desc, id desc);

create table public.world_chat_settings (
  singleton boolean primary key default true check (singleton),
  slow_mode_seconds integer not null default 2 check (slow_mode_seconds between 0 and 3600),
  profanity_filter boolean not null default true,
  links_allowed boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.accounts(id) on delete set null
);

create table public.message_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.accounts(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  reported_account_id uuid references public.accounts(id) on delete set null,
  reason text not null check (reason in ('spam', 'harassment', 'hate', 'sexual', 'violence', 'impersonation', 'other')),
  details text not null default '' check (length(details) <= 1000),
  state public.report_state not null default 'open',
  reviewed_by uuid references public.accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (message_id is not null or reported_account_id is not null)
);
create index message_reports_queue_idx on public.message_reports (state, created_at);
create unique index message_reports_duplicate_uidx on public.message_reports (reporter_id, message_id) where message_id is not null and state in ('open', 'reviewing');

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid not null references public.accounts(id) on delete cascade,
  target_account_id uuid references public.accounts(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  action text not null check (action in ('delete_message', 'warn', 'mute', 'suspend', 'resolve_report', 'dismiss_report', 'announcement')),
  reason text not null default '' check (length(reason) <= 1000),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index moderation_actions_target_idx on public.moderation_actions (target_account_id, created_at desc);

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at before update on public.conversations
for each row execute function public.set_updated_at();

drop trigger if exists user_presence_set_updated_at on public.user_presence;
create trigger user_presence_set_updated_at before update on public.user_presence
for each row execute function public.set_updated_at();

drop trigger if exists world_chat_settings_set_updated_at on public.world_chat_settings;
create trigger world_chat_settings_set_updated_at before update on public.world_chat_settings
for each row execute function public.set_updated_at();

create or replace function public.touch_conversation_from_message()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  update public.conversations set updated_at = greatest(updated_at, new.created_at) where id = new.conversation_id;
  return new;
end;
$$;
drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation after insert on public.messages
for each row execute function public.touch_conversation_from_message();

create or replace function private.contains_profanity(p_content text)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select lower(coalesce(p_content, '')) ~ ('(^|[^a-z])(' || array_to_string(array[
    'fuck', 'shit', 'bitch', 'cunt', 'nigger', 'faggot'
  ], '|') || ')([^a-z]|$)');
$$;

create or replace function public.create_direct_conversation(
  p_actor_session_hash text,
  p_username text
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_actor public.accounts%rowtype;
  v_target public.accounts%rowtype;
  v_low uuid;
  v_high uuid;
  v_conversation_id uuid;
begin
  v_actor := private.require_actor(p_actor_session_hash, 1);
  select * into v_target from public.accounts
  where username = lower(btrim(p_username)) and disabled = false;
  if v_target.id is null or v_target.id = v_actor.id then
    raise exception 'user unavailable' using errcode = '22023';
  end if;
  if exists (select 1 from public.user_blocks where
    (blocker_id = v_actor.id and blocked_id = v_target.id)
    or (blocker_id = v_target.id and blocked_id = v_actor.id)) then
    raise exception 'conversation unavailable' using errcode = '42501';
  end if;
  v_low := least(v_actor.id, v_target.id);
  v_high := greatest(v_actor.id, v_target.id);
  select conversation_id into v_conversation_id from public.direct_conversation_pairs
  where account_low = v_low and account_high = v_high;
  if v_conversation_id is not null then return v_conversation_id; end if;

  insert into public.conversations (kind) values ('direct') returning id into v_conversation_id;
  insert into public.direct_conversation_pairs (conversation_id, account_low, account_high)
  values (v_conversation_id, v_low, v_high);
  insert into public.conversation_members (conversation_id, account_id, role) values
    (v_conversation_id, v_actor.id, 'member'),
    (v_conversation_id, v_target.id, 'member');
  return v_conversation_id;
end;
$$;

create or replace function public.create_group_conversation(
  p_actor_session_hash text,
  p_name text,
  p_usernames text[]
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_actor public.accounts%rowtype;
  v_conversation_id uuid;
begin
  v_actor := private.require_actor(p_actor_session_hash, 1);
  if length(btrim(p_name)) not between 1 and 80 or coalesce(array_length(p_usernames, 1), 0) > 49 then
    raise exception 'invalid group' using errcode = '22023';
  end if;
  insert into public.conversations (kind, name, owner_id)
  values ('group', btrim(p_name), v_actor.id) returning id into v_conversation_id;
  insert into public.conversation_members (conversation_id, account_id, role)
  values (v_conversation_id, v_actor.id, 'owner');
  insert into public.group_invites (conversation_id, inviter_id, invitee_id)
  select v_conversation_id, v_actor.id, accounts.id
  from public.accounts
  where accounts.username = any(select lower(btrim(item)) from unnest(coalesce(p_usernames, '{}'::text[])) item)
    and accounts.id <> v_actor.id and accounts.disabled = false
    and not exists (select 1 from public.user_blocks where
      (blocker_id = v_actor.id and blocked_id = accounts.id)
      or (blocker_id = accounts.id and blocked_id = v_actor.id))
  on conflict do nothing;
  return v_conversation_id;
end;
$$;

create or replace function public.send_social_message(
  p_actor_session_hash text,
  p_conversation_id uuid,
  p_content text,
  p_kind public.message_kind,
  p_reply_to_id uuid default null
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_actor public.accounts%rowtype;
  v_conversation public.conversations%rowtype;
  v_message_id uuid;
  v_slow_mode integer;
  v_last_at timestamptz;
begin
  v_actor := private.require_actor(p_actor_session_hash, 1);
  select * into v_conversation from public.conversations
  where id = p_conversation_id and deleted_at is null;
  if v_conversation.id is null then raise exception 'conversation unavailable' using errcode = '22023'; end if;
  if v_conversation.kind <> 'world' and not exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id and account_id = v_actor.id
  ) then raise exception 'membership required' using errcode = '42501'; end if;
  if v_conversation.kind = 'direct' and exists (
    select 1
    from public.conversation_members other_member
    join public.user_blocks blocks on
      (blocks.blocker_id = v_actor.id and blocks.blocked_id = other_member.account_id)
      or (blocks.blocker_id = other_member.account_id and blocks.blocked_id = v_actor.id)
    where other_member.conversation_id = p_conversation_id
      and other_member.account_id <> v_actor.id
  ) then raise exception 'conversation unavailable' using errcode = '42501'; end if;
  if p_kind = 'text' and (length(btrim(p_content)) < 1 or length(p_content) > 8000) then
    raise exception 'invalid message' using errcode = '22023';
  end if;
  if p_reply_to_id is not null and not exists (
    select 1 from public.messages where id = p_reply_to_id and conversation_id = p_conversation_id
  ) then raise exception 'invalid reply' using errcode = '22023'; end if;

  if v_conversation.kind = 'world' and v_actor.account_type = 'normal' then
    select slow_mode_seconds into v_slow_mode from public.world_chat_settings where singleton;
    select max(created_at) into v_last_at from public.messages
    where conversation_id = p_conversation_id and sender_id = v_actor.id;
    if v_last_at is not null and v_last_at > now() - make_interval(secs => coalesce(v_slow_mode, 2)) then
      raise exception 'slow mode active' using errcode = 'P0001';
    end if;
    if (select profanity_filter from public.world_chat_settings where singleton)
      and private.contains_profanity(p_content) then
      raise exception 'message rejected by content filter' using errcode = '22023';
    end if;
    if not (select links_allowed from public.world_chat_settings where singleton)
      and p_content ~* 'https?://' then
      raise exception 'links are disabled' using errcode = '22023';
    end if;
  end if;
  if (select count(*) from public.messages where sender_id = v_actor.id and created_at > now() - interval '10 seconds') >= 8 then
    raise exception 'message rate exceeded' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.messages where sender_id = v_actor.id
    and conversation_id = p_conversation_id and content = p_content
    and created_at > now() - interval '30 seconds') then
    raise exception 'duplicate message' using errcode = 'P0001';
  end if;

  insert into public.messages (conversation_id, sender_id, content, kind, reply_to_id)
  values (p_conversation_id, v_actor.id, p_content, p_kind, p_reply_to_id)
  returning id into v_message_id;
  insert into public.message_receipts (message_id, account_id) values (v_message_id, v_actor.id);
  return v_message_id;
end;
$$;

create or replace function public.get_social_conversation_stats(p_actor_session_hash text)
returns table(
  conversation_id uuid,
  latest_message_id uuid,
  latest_content text,
  latest_kind public.message_kind,
  latest_created_at timestamptz,
  unread_count bigint
)
language plpgsql stable security invoker set search_path = '' as $$
declare v_actor public.accounts%rowtype;
begin
  v_actor := private.require_actor(p_actor_session_hash, 1);
  return query
  select
    c.id,
    latest.id,
    case when latest.deleted_at is null then latest.content else 'Message deleted' end,
    latest.kind,
    latest.created_at,
    case when c.kind = 'world' then 0::bigint else (
      select count(*) from public.messages unread
      where unread.conversation_id = c.id
        and unread.created_at > cm.last_read_at
        and unread.sender_id is distinct from v_actor.id
        and unread.deleted_at is null
    ) end
  from public.conversations c
  left join public.conversation_members cm
    on cm.conversation_id = c.id and cm.account_id = v_actor.id
  left join lateral (
    select m.id, m.content, m.kind, m.created_at, m.deleted_at
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc, m.id desc
    limit 1
  ) latest on true
  where c.deleted_at is null and (c.kind = 'world' or cm.account_id is not null);
end;
$$;

create or replace function public.validate_social_message_update()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_kind public.conversation_kind; v_role public.account_type;
begin
  if new.content is not distinct from old.content or new.deleted_at is not null then return new; end if;
  select kind into v_kind from public.conversations where id = new.conversation_id;
  select account_type into v_role from public.accounts where id = new.sender_id;
  if v_kind = 'world' and v_role = 'normal' then
    if (select profanity_filter from public.world_chat_settings where singleton)
      and private.contains_profanity(new.content) then
      raise exception 'message rejected by content filter' using errcode = '22023';
    end if;
    if not (select links_allowed from public.world_chat_settings where singleton)
      and new.content ~* 'https?://' then
      raise exception 'links are disabled' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists messages_validate_update on public.messages;
create trigger messages_validate_update before update of content on public.messages
for each row execute function public.validate_social_message_update();

create or replace function public.notify_social_message()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_kind public.conversation_kind;
  v_sender text;
  v_reply_sender uuid;
begin
  select kind into v_kind from public.conversations where id = new.conversation_id;
  select username into v_sender from public.accounts where id = new.sender_id;

  if v_kind in ('direct', 'group') then
    insert into public.notifications (account_id, actor_id, kind, title, body, conversation_id, message_id)
    select cm.account_id, new.sender_id,
      case when v_kind = 'direct' then 'direct_message'::public.notification_kind else 'group_message'::public.notification_kind end,
      case when v_kind = 'direct' then 'New message from @' || v_sender else 'New group message' end,
      left(new.content, 180), new.conversation_id, new.id
    from public.conversation_members cm
    where cm.conversation_id = new.conversation_id and cm.account_id <> new.sender_id
      and cm.notifications = 'all' and not cm.muted;
  end if;

  insert into public.notifications (account_id, actor_id, kind, title, body, conversation_id, message_id)
  select a.id, new.sender_id, 'mention', '@' || v_sender || ' mentioned you', left(new.content, 180), new.conversation_id, new.id
  from public.accounts a
  where a.id <> new.sender_id and a.disabled = false
    and new.content ~* ('(^|[^a-z0-9_])@' || a.username || '([^a-z0-9_]|$)')
    and (v_kind = 'world' or exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = new.conversation_id and cm.account_id = a.id
    ))
    and not exists (select 1 from public.user_blocks where
      (blocker_id = new.sender_id and blocked_id = a.id)
      or (blocker_id = a.id and blocked_id = new.sender_id))
    and not exists (select 1 from public.notifications n where n.account_id = a.id and n.message_id = new.id and n.kind in ('direct_message', 'group_message'));

  if new.reply_to_id is not null then
    select sender_id into v_reply_sender from public.messages where id = new.reply_to_id;
    if v_reply_sender is not null and v_reply_sender <> new.sender_id then
      insert into public.notifications (account_id, actor_id, kind, title, body, conversation_id, message_id)
      values (v_reply_sender, new.sender_id, 'reply', '@' || v_sender || ' replied to you', left(new.content, 180), new.conversation_id, new.id);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists messages_create_notifications on public.messages;
create trigger messages_create_notifications after insert on public.messages
for each row execute function public.notify_social_message();

create or replace function public.notify_friendship()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_username text;
begin
  select username into v_username from public.accounts where id = new.requester_id;
  if tg_op = 'INSERT' then
    insert into public.notifications (account_id, actor_id, kind, title, body, friendship_id)
    values (new.addressee_id, new.requester_id, 'friend_request', '@' || v_username || ' sent a friend request', 'Review the request in Friends.', new.id);
  elsif new.state = 'accepted' and old.state <> 'accepted' then
    select username into v_username from public.accounts where id = new.addressee_id;
    insert into public.notifications (account_id, actor_id, kind, title, body, friendship_id)
    values (new.requester_id, new.addressee_id, 'friend_accepted', '@' || v_username || ' accepted your request', 'You are now friends.', new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists friendships_create_notifications on public.friendships;
create trigger friendships_create_notifications after insert or update of state on public.friendships
for each row execute function public.notify_friendship();

create or replace function public.notify_group_invite()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_group_name text; v_inviter text;
begin
  select name into v_group_name from public.conversations where id = new.conversation_id;
  select username into v_inviter from public.accounts where id = new.inviter_id;
  insert into public.notifications (account_id, actor_id, kind, title, body, conversation_id, invite_id)
  values (new.invitee_id, new.inviter_id, 'group_invite', 'Invitation to ' || coalesce(v_group_name, 'a group'), '@' || v_inviter || ' invited you to join.', new.conversation_id, new.id);
  return new;
end;
$$;
drop trigger if exists group_invites_create_notifications on public.group_invites;
create trigger group_invites_create_notifications after insert on public.group_invites
for each row execute function public.notify_group_invite();

create or replace function public.notify_reaction()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_sender uuid; v_conversation uuid; v_actor text;
begin
  select sender_id, conversation_id into v_sender, v_conversation from public.messages where id = new.message_id;
  if v_sender is not null and v_sender <> new.account_id then
    select username into v_actor from public.accounts where id = new.account_id;
    insert into public.notifications (account_id, actor_id, kind, title, body, conversation_id, message_id)
    values (v_sender, new.account_id, 'reaction', '@' || v_actor || ' reacted ' || new.emoji, '', v_conversation, new.message_id);
  end if;
  return new;
end;
$$;
drop trigger if exists reactions_create_notifications on public.message_reactions;
create trigger reactions_create_notifications after insert on public.message_reactions
for each row execute function public.notify_reaction();

insert into public.world_chat_settings (singleton) values (true) on conflict do nothing;
insert into public.conversations (kind) values ('world') on conflict do nothing;
insert into public.user_presence (account_id)
select id from public.accounts on conflict do nothing;

create or replace function public.create_social_presence()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.user_presence (account_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists accounts_create_social_presence on public.accounts;
create trigger accounts_create_social_presence after insert on public.accounts
for each row execute function public.create_social_presence();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'social-uploads', 'social-uploads', false, 26214400,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','audio/webm','audio/ogg','audio/mpeg','application/pdf','text/plain','application/zip']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.user_presence enable row level security;
alter table public.friendships enable row level security;
alter table public.user_blocks enable row level security;
alter table public.conversations enable row level security;
alter table public.direct_conversation_pairs enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.message_receipts enable row level security;
alter table public.pinned_messages enable row level security;
alter table public.message_attachments enable row level security;
alter table public.typing_indicators enable row level security;
alter table public.group_invites enable row level security;
alter table public.notifications enable row level security;
alter table public.world_chat_settings enable row level security;
alter table public.message_reports enable row level security;
alter table public.moderation_actions enable row level security;

-- Custom sessions do not produce Supabase Auth JWTs. These explicit policies
-- keep every browser role denied even if Data API grants change later.
create policy "deny browser access" on public.user_presence for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.friendships for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.user_blocks for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.conversations for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.direct_conversation_pairs for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.conversation_members for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.messages for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.message_reactions for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.message_receipts for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.pinned_messages for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.message_attachments for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.typing_indicators for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.group_invites for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.notifications for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.world_chat_settings for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.message_reports for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.moderation_actions for all to anon, authenticated using (false) with check (false);

-- Restrictive policies cannot be bypassed by any permissive Storage policy
-- that may exist for another bucket in the same project.
create policy "social uploads are server only"
on storage.objects as restrictive for all to anon, authenticated
using (bucket_id <> 'social-uploads')
with check (bucket_id <> 'social-uploads');

revoke all on table public.user_presence, public.friendships, public.user_blocks,
  public.conversations, public.direct_conversation_pairs, public.conversation_members,
  public.messages, public.message_reactions, public.message_receipts, public.pinned_messages,
  public.message_attachments, public.typing_indicators, public.group_invites,
  public.notifications, public.world_chat_settings, public.message_reports,
  public.moderation_actions from public, anon, authenticated;

grant select, insert, update, delete on table public.user_presence, public.friendships,
  public.user_blocks, public.conversations, public.direct_conversation_pairs,
  public.conversation_members, public.messages, public.message_reactions,
  public.message_receipts, public.pinned_messages, public.message_attachments,
  public.typing_indicators, public.group_invites, public.notifications,
  public.world_chat_settings, public.message_reports, public.moderation_actions to service_role;

revoke all on function private.contains_profanity(text) from public, anon, authenticated;
revoke all on function public.touch_conversation_from_message() from public, anon, authenticated;
revoke all on function public.validate_social_message_update() from public, anon, authenticated;
revoke all on function public.notify_social_message() from public, anon, authenticated;
revoke all on function public.notify_friendship() from public, anon, authenticated;
revoke all on function public.notify_group_invite() from public, anon, authenticated;
revoke all on function public.notify_reaction() from public, anon, authenticated;
revoke all on function public.create_social_presence() from public, anon, authenticated;
revoke all on function public.create_direct_conversation(text, text) from public, anon, authenticated;
revoke all on function public.create_group_conversation(text, text, text[]) from public, anon, authenticated;
revoke all on function public.send_social_message(text, uuid, text, public.message_kind, uuid) from public, anon, authenticated;
revoke all on function public.get_social_conversation_stats(text) from public, anon, authenticated;
grant execute on function private.contains_profanity(text) to service_role;
grant execute on function public.create_direct_conversation(text, text) to service_role;
grant execute on function public.create_group_conversation(text, text, text[]) to service_role;
grant execute on function public.send_social_message(text, uuid, text, public.message_kind, uuid) to service_role;
grant execute on function public.get_social_conversation_stats(text) to service_role;

-- Server-side Supabase Realtime subscriptions fan these changes into authenticated SSE.
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.message_reactions;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.message_receipts;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.user_presence;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.typing_indicators;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.conversation_members;
exception when duplicate_object then null;
end $$;

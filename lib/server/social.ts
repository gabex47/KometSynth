import "server-only";

import { randomUUID } from "node:crypto";
import type { SessionContext } from "@/lib/server/auth";
import { isDemoMode } from "@/lib/server/demo-store";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import type {
  ChatMessage,
  ConversationKind,
  ConversationMember,
  ConversationRole,
  ConversationSummary,
  FriendRecord,
  FriendshipState,
  MessageKind,
  PresenceState,
  ProfileLink,
  ProfilePrivacy,
  SocialBootstrap,
  SocialNotification,
  SocialProfile,
} from "@/lib/social/types";

const DEFAULT_PRIVACY: ProfilePrivacy = {
  activity: "friends",
  mutuals: true,
  presence: true,
  friendRequests: true,
};

const SOCIAL_BUCKET = "social-uploads";

type AccountRow = {
  id: string;
  username: string;
  account_type: "normal" | "admin" | "owner";
  created_at: string;
};

type ProfileRow = {
  account_id: string;
  display_name: string;
  bio: string;
  avatar_path: string | null;
  banner_path: string | null;
  links: unknown;
  status_text: string;
  badges: string[];
  privacy: unknown;
};

type FriendshipRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  state: FriendshipState;
  created_at: string;
  responded_at: string | null;
};

type PresenceRow = { account_id: string; state: PresenceState; last_seen_at: string };
type MessageAttachmentRow = {
  id: string;
  conversation_id: string;
  message_id: string | null;
  uploader_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  duration_seconds: number | null;
  created_at: string;
};

function socialUnavailable() {
  if (isDemoMode()) throw new Error("Social features require persistent Supabase mode.");
}

function safeLinks(value: unknown): ProfileLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.label !== "string" || typeof candidate.url !== "string") return [];
    try {
      if (!["http:", "https:"].includes(new URL(candidate.url).protocol)) return [];
      return [{ label: candidate.label, url: candidate.url }];
    } catch { return []; }
  }).slice(0, 8);
}

function safePrivacy(value: unknown): ProfilePrivacy {
  if (!value || typeof value !== "object") return DEFAULT_PRIVACY;
  const candidate = value as Record<string, unknown>;
  const activity = ["everyone", "friends", "private"].includes(String(candidate.activity))
    ? candidate.activity as ProfilePrivacy["activity"]
    : DEFAULT_PRIVACY.activity;
  return {
    activity,
    mutuals: candidate.mutuals !== false,
    presence: candidate.presence !== false,
    friendRequests: candidate.friendRequests !== false,
  };
}

async function signedUrlMap(paths: Array<string | null | undefined>) {
  const unique = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  if (!unique.length) return new Map<string, string>();
  const { data, error } = await getSupabaseAdmin().storage.from(SOCIAL_BUCKET).createSignedUrls(unique, 3600);
  if (error) return new Map<string, string>();
  return new Map((data ?? []).flatMap((item) => item.signedUrl ? [[item.path, item.signedUrl] as const] : []));
}

function otherAccountId(friendship: FriendshipRow, accountId: string) {
  return friendship.requester_id === accountId ? friendship.addressee_id : friendship.requester_id;
}

async function profileMap(accountIds: string[], viewerId: string, options: { includeActivity?: boolean } = {}) {
  const uniqueIds = [...new Set(accountIds)];
  if (!uniqueIds.length) return new Map<string, SocialProfile>();
  const database = getSupabaseAdmin();
  const [{ data: accounts, error: accountError }, { data: profiles, error: profileError }, { data: presences }, { data: friendships }, { data: blocks }] = await Promise.all([
    database.from("accounts").select("id, username, account_type, created_at").in("id", uniqueIds).eq("disabled", false),
    database.from("account_profiles").select("account_id, display_name, bio, avatar_path, banner_path, links, status_text, badges, privacy").in("account_id", uniqueIds),
    database.from("user_presence").select("account_id, state, last_seen_at").in("account_id", uniqueIds),
    database.from("friendships").select("id, requester_id, addressee_id, state, created_at, responded_at").or(`requester_id.eq.${viewerId},addressee_id.eq.${viewerId}`),
    database.from("user_blocks").select("blocker_id, blocked_id").or(`blocker_id.eq.${viewerId},blocked_id.eq.${viewerId}`),
  ]);
  if (accountError || profileError) throw new Error("Unable to load people.");

  const profileById = new Map((profiles ?? []).map((profile) => [profile.account_id, profile as ProfileRow]));
  const presenceById = new Map((presences ?? []).map((presence) => [presence.account_id, presence as PresenceRow]));
  const friendshipById = new Map<string, FriendshipRow>();
  for (const friendship of (friendships ?? []) as FriendshipRow[]) {
    friendshipById.set(otherAccountId(friendship, viewerId), friendship);
  }
  const blockedIds = new Set((blocks ?? []).filter((block) => block.blocker_id === viewerId).map((block) => block.blocked_id));
  const blockedByIds = new Set((blocks ?? []).filter((block) => block.blocked_id === viewerId).map((block) => block.blocker_id));
  const urls = await signedUrlMap((profiles ?? []).flatMap((profile) => [profile.avatar_path, profile.banner_path]));
  const usernames = ((accounts ?? []) as AccountRow[]).map((account) => account.username);
  const { data: activities } = options.includeActivity && usernames.length
    ? await database.from("activity_logs").select("user, action, timestamp").in("user", usernames).order("timestamp", { ascending: false }).limit(Math.min(usernames.length * 5, 400))
    : { data: [] };

  return new Map(((accounts ?? []) as AccountRow[]).map((account) => {
    const profile = profileById.get(account.id);
    const presence = presenceById.get(account.id);
    const friendship = friendshipById.get(account.id);
    const privacy = safePrivacy(profile?.privacy);
    const direction = !friendship ? null : friendship.requester_id === viewerId ? "outgoing" as const : "incoming" as const;
    const item: SocialProfile = {
      id: account.id,
      username: account.username,
      displayName: profile?.display_name || account.username,
      bio: profile?.bio ?? "",
      statusText: profile?.status_text ?? "",
      accountType: account.account_type,
      badges: profile?.badges ?? [],
      links: safeLinks(profile?.links),
      avatarUrl: profile?.avatar_path ? urls.get(profile.avatar_path) ?? null : null,
      bannerUrl: profile?.banner_path ? urls.get(profile.banner_path) ?? null : null,
      presence: account.id === viewerId || privacy.presence || friendship?.state === "accepted"
        ? presence && Date.parse(presence.last_seen_at) > Date.now() - 90_000 ? presence.state : "offline"
        : "offline",
      lastSeenAt: account.id === viewerId || privacy.presence || friendship?.state === "accepted" ? presence?.last_seen_at ?? null : null,
      joinedAt: account.created_at,
      friendship: friendship?.state ?? null,
      friendshipId: friendship?.id ?? null,
      friendshipDirection: direction,
      blocked: blockedIds.has(account.id),
      blockedBy: blockedByIds.has(account.id),
      mutualFriends: 0,
      mutualGroups: 0,
      recentActivity: account.id === viewerId || privacy.activity === "everyone" || friendship?.state === "accepted"
        ? (activities ?? []).filter((activity) => activity.user === account.username).slice(0, 5).map((activity) => ({ action: activity.action, timestamp: activity.timestamp }))
        : [],
      privacy,
    };
    return [account.id, item] as const;
  }));
}

async function messageProfileMap(accountIds: string[], viewerId: string) {
  const uniqueIds = [...new Set(accountIds)];
  if (!uniqueIds.length) return new Map<string, SocialProfile>();
  const database = getSupabaseAdmin();
  const [{ data: accounts, error: accountError }, { data: profiles, error: profileError }, { data: presences }] = await Promise.all([
    database.from("accounts").select("id, username, account_type, created_at").in("id", uniqueIds).eq("disabled", false),
    database.from("account_profiles").select("account_id, display_name, bio, avatar_path, banner_path, links, status_text, badges, privacy").in("account_id", uniqueIds),
    database.from("user_presence").select("account_id, state, last_seen_at").in("account_id", uniqueIds),
  ]);
  if (accountError || profileError) throw new Error("Unable to load message authors.");

  const profileById = new Map((profiles ?? []).map((profile) => [profile.account_id, profile as ProfileRow]));
  const presenceById = new Map((presences ?? []).map((presence) => [presence.account_id, presence as PresenceRow]));
  const urls = await signedUrlMap((profiles ?? []).map((profile) => profile.avatar_path));

  return new Map(((accounts ?? []) as AccountRow[]).map((account) => {
    const profile = profileById.get(account.id);
    const presence = presenceById.get(account.id);
    const privacy = safePrivacy(profile?.privacy);
    const item: SocialProfile = {
      id: account.id,
      username: account.username,
      displayName: profile?.display_name || account.username,
      bio: profile?.bio ?? "",
      statusText: profile?.status_text ?? "",
      accountType: account.account_type,
      badges: profile?.badges ?? [],
      links: safeLinks(profile?.links),
      avatarUrl: profile?.avatar_path ? urls.get(profile.avatar_path) ?? null : null,
      bannerUrl: null,
      presence: account.id === viewerId || privacy.presence
        ? presence && Date.parse(presence.last_seen_at) > Date.now() - 90_000 ? presence.state : "offline"
        : "offline",
      lastSeenAt: account.id === viewerId || privacy.presence ? presence?.last_seen_at ?? null : null,
      joinedAt: account.created_at,
      friendship: null,
      friendshipId: null,
      friendshipDirection: null,
      blocked: false,
      blockedBy: false,
      mutualFriends: 0,
      mutualGroups: 0,
      recentActivity: [],
      privacy,
    };
    return [account.id, item] as const;
  }));
}

async function requireConversation(context: SessionContext, conversationId: string, minimumRole?: ConversationRole) {
  const database = getSupabaseAdmin();
  const { data: conversation, error } = await database.from("conversations")
    .select("id, kind, name, description, avatar_path, owner_id, created_at, updated_at, deleted_at")
    .eq("id", conversationId).is("deleted_at", null).maybeSingle();
  if (error || !conversation) throw Object.assign(new Error("Conversation not found."), { status: 404 });
  if (conversation.kind === "world") return { conversation, role: null as ConversationRole | null };
  const { data: membership } = await database.from("conversation_members")
    .select("role, joined_at, last_read_at, muted, notifications")
    .eq("conversation_id", conversationId).eq("account_id", context.account.id).maybeSingle();
  if (!membership) throw Object.assign(new Error("Conversation access denied."), { status: 403 });
  if (minimumRole && { member: 1, admin: 2, owner: 3 }[membership.role] < { member: 1, admin: 2, owner: 3 }[minimumRole]) {
    throw Object.assign(new Error("Group administrator access required."), { status: 403 });
  }
  return { conversation, role: membership.role as ConversationRole };
}

export async function getSocialBootstrap(context: SessionContext, query = ""): Promise<SocialBootstrap> {
  socialUnavailable();
  const database = getSupabaseAdmin();
  await database.from("user_presence").upsert({ account_id: context.account.id, state: "online", last_seen_at: new Date().toISOString() });

  let accountsQuery = database.from("accounts")
    .select("id, username, account_type, created_at")
    .eq("disabled", false)
    .order("username")
    .limit(80);
  if (query.trim()) accountsQuery = accountsQuery.ilike("username", `%${query.trim().replaceAll("%", "").replaceAll("_", "").slice(0, 32)}%`);

  const [{ data: accounts, error: accountsError }, { data: friendships, error: friendshipsError }, { data: memberships }, { data: world }, { data: notifications }] = await Promise.all([
    accountsQuery,
    database.from("friendships").select("id, requester_id, addressee_id, state, created_at, responded_at").or(`requester_id.eq.${context.account.id},addressee_id.eq.${context.account.id}`).order("created_at", { ascending: false }),
    database.from("conversation_members").select("conversation_id, account_id, role, joined_at, last_read_at, muted, notifications").eq("account_id", context.account.id),
    database.from("conversations").select("id").eq("kind", "world").is("deleted_at", null).single(),
    database.from("notifications").select("id, account_id, actor_id, kind, title, body, conversation_id, message_id, friendship_id, invite_id, metadata, created_at, read_at").eq("account_id", context.account.id).order("created_at", { ascending: false }).limit(50),
  ]);
  if (accountsError || friendshipsError || !world) throw new Error("Unable to load the social workspace.");

  const conversationIds = [world.id, ...(memberships ?? []).map((membership) => membership.conversation_id)];
  const [{ data: conversations }, { data: allMembers }, { data: conversationStats }] = await Promise.all([
    database.from("conversations").select("id, kind, name, description, avatar_path, owner_id, created_at, updated_at, deleted_at").in("id", conversationIds).is("deleted_at", null).order("updated_at", { ascending: false }),
    conversationIds.length ? database.from("conversation_members").select("conversation_id, account_id, role, joined_at, last_read_at, muted, notifications").in("conversation_id", conversationIds) : Promise.resolve({ data: [] }),
    database.rpc("get_social_conversation_stats", { p_actor_session_hash: context.tokenHash }),
  ]);

  const allAccountIds = new Set<string>([
    context.account.id,
    ...((accounts ?? []) as AccountRow[]).map((account) => account.id),
    ...(allMembers ?? []).map((member) => member.account_id),
    ...(notifications ?? []).flatMap((notification) => notification.actor_id ? [notification.actor_id] : []),
    ...((friendships ?? []) as FriendshipRow[]).flatMap((friendship) => [friendship.requester_id, friendship.addressee_id]),
  ]);
  const profiles = await profileMap([...allAccountIds], context.account.id);
  const self = profiles.get(context.account.id);
  if (!self) throw new Error("Unable to load your profile.");

  const membershipByConversation = new Map((memberships ?? []).map((membership) => [membership.conversation_id, membership]));
  const membersByConversation = new Map<string, ConversationMember[]>();
  for (const membership of allMembers ?? []) {
    const profile = profiles.get(membership.account_id);
    if (!profile) continue;
    const list = membersByConversation.get(membership.conversation_id) ?? [];
    list.push({ profile, role: membership.role as ConversationRole, joinedAt: membership.joined_at });
    membersByConversation.set(membership.conversation_id, list);
  }

  const statsByConversation = new Map((conversationStats ?? []).map((stats) => [stats.conversation_id, stats]));
  const conversationUrls = await signedUrlMap((conversations ?? []).map((conversation) => conversation.avatar_path));
  const conversationSummaries: ConversationSummary[] = (conversations ?? []).map((conversation) => {
    const membership = membershipByConversation.get(conversation.id);
    const memberList = membersByConversation.get(conversation.id) ?? [];
    const stats = statsByConversation.get(conversation.id);
    const directOther = conversation.kind === "direct" ? memberList.find((member) => member.profile.id !== context.account.id)?.profile : null;
    return {
      id: conversation.id,
      kind: conversation.kind as ConversationKind,
      name: conversation.kind === "world" ? "World Chat" : conversation.kind === "direct" ? directOther?.displayName ?? "Direct message" : conversation.name ?? "Group",
      description: conversation.kind === "world" ? "The global SynthNet community channel" : conversation.description,
      avatarUrl: conversation.avatar_path ? conversationUrls.get(conversation.avatar_path) ?? null : directOther?.avatarUrl ?? null,
      role: membership?.role as ConversationRole | undefined ?? null,
      members: memberList,
      latestMessage: stats?.latest_message_id && stats.latest_created_at && stats.latest_kind ? { id: stats.latest_message_id, content: stats.latest_content ?? "", createdAt: stats.latest_created_at, kind: stats.latest_kind as MessageKind } : null,
      unreadCount: Number(stats?.unread_count ?? 0),
      muted: membership?.muted ?? false,
      updatedAt: conversation.updated_at,
    };
  });

  const friendshipRows = (friendships ?? []) as FriendshipRow[];
  const friendRecords: FriendRecord[] = friendshipRows.flatMap((friendship) => {
    const profile = profiles.get(otherAccountId(friendship, context.account.id));
    return profile ? [{
      id: friendship.id,
      state: friendship.state,
      direction: friendship.requester_id === context.account.id ? "outgoing" as const : "incoming" as const,
      createdAt: friendship.created_at,
      profile,
    }] : [];
  });

  const socialNotifications: SocialNotification[] = (notifications ?? []).map((notification) => ({
    id: notification.id,
    kind: notification.kind,
    title: notification.title,
    body: notification.body,
    actor: notification.actor_id ? profiles.get(notification.actor_id) ?? null : null,
    conversationId: notification.conversation_id,
    messageId: notification.message_id,
    friendshipId: notification.friendship_id,
    inviteId: notification.invite_id,
    createdAt: notification.created_at,
    readAt: notification.read_at,
  }));

  return {
    self,
    people: [...profiles.values()].filter((profile) => profile.id !== context.account.id && !profile.blocked && !profile.blockedBy).sort((a, b) => a.username.localeCompare(b.username)),
    friends: friendRecords,
    conversations: conversationSummaries,
    notifications: socialNotifications,
    unreadNotifications: socialNotifications.filter((notification) => !notification.readAt).length,
    worldConversationId: world.id,
  };
}

export async function getSocialProfile(context: SessionContext, username: string) {
  socialUnavailable();
  const database = getSupabaseAdmin();
  const { data: account } = await database.from("accounts")
    .select("id")
    .eq("username", username.toLowerCase())
    .eq("disabled", false)
    .maybeSingle();
  if (!account) throw Object.assign(new Error("Profile not found."), { status: 404 });

  const profiles = await profileMap([account.id], context.account.id, { includeActivity: true });
  const profile = profiles.get(account.id);
  if (!profile || (account.id !== context.account.id && (profile.blocked || profile.blockedBy))) {
    throw Object.assign(new Error("Profile not found."), { status: 404 });
  }
  if (account.id === context.account.id || !profile.privacy.mutuals) return profile;

  const ids = [context.account.id, account.id];
  const [{ data: friendships }, { data: memberships }] = await Promise.all([
    database.from("friendships")
      .select("id, requester_id, addressee_id, state, created_at, responded_at")
      .eq("state", "accepted")
      .or(`requester_id.in.(${ids.join(",")}),addressee_id.in.(${ids.join(",")})`)
      .limit(5_000),
    database.from("conversation_members").select("conversation_id, account_id").in("account_id", ids),
  ]);
  const friendSets = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
  for (const friendship of (friendships ?? []) as FriendshipRow[]) {
    if (friendSets.has(friendship.requester_id)) friendSets.get(friendship.requester_id)!.add(friendship.addressee_id);
    if (friendSets.has(friendship.addressee_id)) friendSets.get(friendship.addressee_id)!.add(friendship.requester_id);
  }
  const viewerFriends = friendSets.get(context.account.id) ?? new Set<string>();
  profile.mutualFriends = [...(friendSets.get(account.id) ?? [])].filter((id) => viewerFriends.has(id)).length;

  const viewerConversationIds = new Set((memberships ?? []).filter((item) => item.account_id === context.account.id).map((item) => item.conversation_id));
  const sharedConversationIds = [...new Set((memberships ?? [])
    .filter((item) => item.account_id === account.id && viewerConversationIds.has(item.conversation_id))
    .map((item) => item.conversation_id))];
  if (sharedConversationIds.length) {
    const { count } = await database.from("conversations")
      .select("id", { count: "exact", head: true })
      .in("id", sharedConversationIds)
      .eq("kind", "group")
      .is("deleted_at", null);
    profile.mutualGroups = count ?? 0;
  }
  return profile;
}

export async function getConversationMessages(
  context: SessionContext,
  conversationId: string,
  options: { before?: string; query?: string; limit?: number; messageIds?: string[]; includeTyping?: boolean } = {},
): Promise<{ messages: ChatMessage[]; hasMore: boolean; typing: SocialProfile[] }> {
  socialUnavailable();
  const database = getSupabaseAdmin();
  const access = requireConversation(context, conversationId);
  const limit = Math.min(Math.max(options.limit ?? 40, 1), 80);
  const requestedMessageIds = [...new Set(options.messageIds ?? [])].slice(0, 20);
  const exactMessages = requestedMessageIds.length > 0;
  let query = database.from("messages")
    .select("id, conversation_id, sender_id, kind, content, reply_to_id, metadata, created_at, edited_at, deleted_at")
    .eq("conversation_id", conversationId);
  if (exactMessages) {
    query = query.in("id", requestedMessageIds).order("created_at", { ascending: true }).order("id", { ascending: true }).limit(requestedMessageIds.length);
  } else {
    query = query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
    if (options.before) query = query.lt("created_at", options.before);
    if (options.query?.trim()) query = query.textSearch("search_vector", options.query.trim().slice(0, 100), { config: "simple", type: "websearch" });
  }
  const [{ conversation }, { data, error }] = await Promise.all([access, query]);
  if (error) throw new Error("Unable to load messages.");
  const page = exactMessages ? (data ?? []) : (data ?? []).slice(0, limit);
  const pageMessageIds = page.map((message) => message.id);
  const replyIds = page.flatMap((message) => message.reply_to_id ? [message.reply_to_id] : []);
  const [{ data: reactions }, { data: attachments }, { data: pins }, { data: receipts }, { data: replies }, { data: typing }] = await Promise.all([
    pageMessageIds.length ? database.from("message_reactions").select("message_id, account_id, emoji, created_at").in("message_id", pageMessageIds) : Promise.resolve({ data: [] }),
    pageMessageIds.length ? database.from("message_attachments").select("id, conversation_id, message_id, uploader_id, storage_path, file_name, mime_type, byte_size, duration_seconds, created_at").in("message_id", pageMessageIds) : Promise.resolve({ data: [] }),
    pageMessageIds.length ? database.from("pinned_messages").select("conversation_id, message_id, pinned_by, pinned_at").in("message_id", pageMessageIds) : Promise.resolve({ data: [] }),
    pageMessageIds.length && conversation.kind !== "world" ? database.from("message_receipts").select("message_id, account_id, read_at").in("message_id", pageMessageIds) : Promise.resolve({ data: [] }),
    replyIds.length ? database.from("messages").select("id, sender_id, content").in("id", replyIds) : Promise.resolve({ data: [] }),
    options.includeTyping === false || conversation.kind === "world"
      ? Promise.resolve({ data: [] })
      : database.from("typing_indicators").select("conversation_id, account_id, expires_at").eq("conversation_id", conversationId).gt("expires_at", new Date().toISOString()).neq("account_id", context.account.id),
  ]);
  const accountIds = [...new Set([
    ...page.flatMap((message) => message.sender_id ? [message.sender_id] : []),
    ...(replies ?? []).flatMap((reply) => reply.sender_id ? [reply.sender_id] : []),
    ...(typing ?? []).map((item) => item.account_id),
  ])];
  const profiles = await messageProfileMap(accountIds, context.account.id);
  const attachmentUrls = await signedUrlMap((attachments ?? []).map((attachment) => attachment.storage_path));
  const replyMap = new Map((replies ?? []).map((reply) => [reply.id, reply]));
  const reactionsByMessage = new Map<string, Map<string, { count: number; reacted: boolean }>>();
  for (const reaction of reactions ?? []) {
    const reactionMap = reactionsByMessage.get(reaction.message_id) ?? new Map<string, { count: number; reacted: boolean }>();
    const current = reactionMap.get(reaction.emoji) ?? { count: 0, reacted: false };
    current.count += 1;
    if (reaction.account_id === context.account.id) current.reacted = true;
    reactionMap.set(reaction.emoji, current);
    reactionsByMessage.set(reaction.message_id, reactionMap);
  }
  const attachmentsByMessage = new Map<string, MessageAttachmentRow[]>();
  for (const attachment of attachments ?? []) {
    if (!attachment.message_id) continue;
    const list = attachmentsByMessage.get(attachment.message_id) ?? [];
    list.push(attachment);
    attachmentsByMessage.set(attachment.message_id, list);
  }
  const pinnedMessageIds = new Set((pins ?? []).map((pin) => pin.message_id));
  const receiptCounts = new Map<string, number>();
  for (const receipt of receipts ?? []) receiptCounts.set(receipt.message_id, (receiptCounts.get(receipt.message_id) ?? 0) + 1);

  const orderedPage = exactMessages ? page : page.reverse();
  const messages: ChatMessage[] = orderedPage.map((message) => {
    const reactionMap = reactionsByMessage.get(message.id) ?? new Map<string, { count: number; reacted: boolean }>();
    const reply = message.reply_to_id ? replyMap.get(message.reply_to_id) : null;
    return {
      id: message.id,
      conversationId: message.conversation_id,
      sender: message.sender_id ? profiles.get(message.sender_id) ?? null : null,
      kind: message.kind as MessageKind,
      content: message.deleted_at ? "" : message.content,
      replyTo: reply ? { id: reply.id, content: reply.content, username: reply.sender_id ? profiles.get(reply.sender_id)?.username ?? null : null } : null,
      reactions: [...reactionMap.entries()].map(([emoji, value]) => ({ emoji, ...value })),
      attachments: (attachmentsByMessage.get(message.id) ?? []).map((attachment) => ({
        id: attachment.id,
        name: attachment.file_name,
        mimeType: attachment.mime_type,
        byteSize: attachment.byte_size,
        durationSeconds: attachment.duration_seconds,
        url: attachmentUrls.get(attachment.storage_path) ?? "",
      })),
      createdAt: message.created_at,
      editedAt: message.edited_at,
      deletedAt: message.deleted_at,
      pinned: pinnedMessageIds.has(message.id),
      readBy: receiptCounts.get(message.id) ?? (message.sender_id === context.account.id ? 1 : 0),
    };
  });

  return { messages, hasMore: !exactMessages && (data ?? []).length > limit, typing: (typing ?? []).flatMap((item) => profiles.get(item.account_id) ?? []) };
}

export async function getConversationTyping(context: SessionContext, conversationId: string) {
  socialUnavailable();
  const database = getSupabaseAdmin();
  const { conversation } = await requireConversation(context, conversationId);
  if (conversation.kind === "world") return [];
  const { data, error } = await database.from("typing_indicators")
    .select("account_id, expires_at")
    .eq("conversation_id", conversationId)
    .gt("expires_at", new Date().toISOString())
    .neq("account_id", context.account.id);
  if (error) throw new Error("Unable to load typing status.");
  const profiles = await messageProfileMap((data ?? []).map((item) => item.account_id), context.account.id);
  return (data ?? []).flatMap((item) => profiles.get(item.account_id) ?? []);
}

export async function createConversation(context: SessionContext, input: { kind: "direct"; username: string } | { kind: "group"; name: string; usernames: string[] }) {
  socialUnavailable();
  const database = getSupabaseAdmin();
  const result = input.kind === "direct"
    ? await database.rpc("create_direct_conversation", { p_actor_session_hash: context.tokenHash, p_username: input.username })
    : await database.rpc("create_group_conversation", { p_actor_session_hash: context.tokenHash, p_name: input.name, p_usernames: input.usernames });
  if (result.error || !result.data) throw new Error(input.kind === "direct" ? "Unable to start that conversation." : "Unable to create the group.");
  return result.data;
}

export async function sendMessage(context: SessionContext, input: { conversationId: string; content: string; kind: MessageKind; replyToId?: string | null; attachmentIds?: string[] }) {
  socialUnavailable();
  const database = getSupabaseAdmin();
  const attachmentIds = [...new Set(input.attachmentIds ?? [])];
  let validatedAttachmentCount = 0;
  if (attachmentIds.length) {
    const { data: attachments, error: attachmentError } = await database.from("message_attachments")
      .select("id")
      .in("id", attachmentIds)
      .eq("uploader_id", context.account.id)
      .eq("conversation_id", input.conversationId)
      .is("message_id", null);
    if (attachmentError || attachments?.length !== attachmentIds.length) {
      throw Object.assign(new Error("One or more attachments are unavailable. Upload them again and retry."), { status: 422 });
    }
    validatedAttachmentCount = attachments.length;
  }
  const rpcKind = input.kind === "text" && !input.content.trim() && attachmentIds.length ? "document" : input.kind;
  // The database's duplicate-send guard compares content. Use a unique temporary label for
  // attachment-only sends, then clear it after linking so consecutive uploads are not rejected.
  const rpcContent = input.content.trim() || !validatedAttachmentCount
    ? input.content
    : `Attachment [${attachmentIds[0]}]`;
  const { data, error } = await database.rpc("send_social_message", {
    p_actor_session_hash: context.tokenHash,
    p_conversation_id: input.conversationId,
    p_content: rpcContent,
    p_kind: rpcKind,
    p_reply_to_id: input.replyToId ?? null,
  });
  if (error || !data) {
    const reason = error?.message ?? "";
    if (reason.includes("slow mode")) throw Object.assign(new Error("Slow mode is active. Please wait before sending again."), { status: 429 });
    if (reason.includes("rate") || reason.includes("duplicate")) throw Object.assign(new Error("You are sending messages too quickly."), { status: 429 });
    if (reason.includes("content filter")) throw Object.assign(new Error("That message was blocked by the world-chat content filter."), { status: 422 });
    if (reason.includes("links are disabled")) throw Object.assign(new Error("Links are currently disabled in World Chat."), { status: 422 });
    if (reason.includes("membership") || reason.includes("conversation unavailable")) throw Object.assign(new Error("That conversation is unavailable."), { status: 403 });
    throw new Error("Unable to send the message.");
  }
  if (attachmentIds.length) {
    const { data: linked, error: attachmentError } = await database.from("message_attachments").update({ message_id: data })
      .in("id", attachmentIds).eq("uploader_id", context.account.id).eq("conversation_id", input.conversationId).is("message_id", null).select("id");
    if (attachmentError || linked?.length !== attachmentIds.length) {
      await database.from("message_attachments").update({ message_id: null }).eq("message_id", data);
      await database.from("messages").delete().eq("id", data).eq("sender_id", context.account.id);
      throw new Error("Unable to link the message attachments. Please retry.");
    }
    // Emit a second message event only after attachment linking is complete so other clients cannot hydrate too early.
    const { error: finalizeError } = await database.from("messages")
      .update({ content: input.content, metadata: { attachments: attachmentIds.length, attachmentsOnly: !input.content.trim() } })
      .eq("id", data);
    if (finalizeError) {
      await database.from("message_attachments").update({ message_id: null }).eq("message_id", data);
      await database.from("messages").delete().eq("id", data).eq("sender_id", context.account.id);
      throw new Error("Unable to finish sending the attachments. Please retry.");
    }
    if (!input.content.trim()) {
      await database.from("notifications").update({ body: "Sent an attachment" }).eq("message_id", data);
    }
  }
  return data;
}

export async function updateMessage(context: SessionContext, input: { action: "edit" | "delete" | "react" | "pin" | "read" | "report" | "typing"; conversationId: string; messageId?: string; content?: string; emoji?: string; reason?: string; details?: string; active?: boolean }) {
  socialUnavailable();
  const { conversation, role } = await requireConversation(context, input.conversationId);
  const database = getSupabaseAdmin();
  if (input.action === "typing") {
    if (conversation.kind === "world") return;
    const result = input.active === false
      ? await database.from("typing_indicators").delete().eq("conversation_id", input.conversationId).eq("account_id", context.account.id)
      : await database.from("typing_indicators").upsert({ conversation_id: input.conversationId, account_id: context.account.id, expires_at: new Date(Date.now() + 8_000).toISOString() });
    if (result.error) throw new Error("Unable to update typing status.");
    return;
  }
  if (!input.messageId) throw new Error("A message is required.");
  const { data: message } = await database.from("messages").select("id, sender_id, conversation_id, created_at, deleted_at").eq("id", input.messageId).eq("conversation_id", input.conversationId).maybeSingle();
  if (!message) throw Object.assign(new Error("Message not found."), { status: 404 });
  const moderator = context.account.accountType !== "normal";
  const groupAdmin = conversation.kind === "group" && (role === "owner" || role === "admin");

  if (input.action === "edit") {
    if (message.sender_id !== context.account.id || message.deleted_at || Date.parse(message.created_at) < Date.now() - 24 * 60 * 60 * 1000) throw Object.assign(new Error("This message can no longer be edited."), { status: 403 });
    const content = input.content?.trim() ?? "";
    if (!content || content.length > 8000) throw new Error("Enter a message up to 8,000 characters.");
    const { error } = await database.from("messages").update({ content, edited_at: new Date().toISOString() }).eq("id", message.id);
    if (error) throw new Error("Unable to edit the message.");
  } else if (input.action === "delete") {
    if (message.sender_id !== context.account.id && !moderator && !groupAdmin) throw Object.assign(new Error("You cannot delete this message."), { status: 403 });
    const { error } = await database.from("messages").update({ content: "", deleted_at: new Date().toISOString(), metadata: {} }).eq("id", message.id);
    if (error) throw new Error("Unable to delete the message.");
    if (message.sender_id !== context.account.id) await database.from("moderation_actions").insert({ moderator_id: context.account.id, target_account_id: message.sender_id, message_id: message.id, action: "delete_message", reason: input.reason?.slice(0, 1000) ?? "Moderation removal" });
  } else if (input.action === "react") {
    const emoji = input.emoji?.trim() ?? "";
    if (!emoji || emoji.length > 24) throw new Error("Choose a valid emoji reaction.");
    const { data: existing } = await database.from("message_reactions").select("message_id").eq("message_id", message.id).eq("account_id", context.account.id).eq("emoji", emoji).maybeSingle();
    const result = existing
      ? await database.from("message_reactions").delete().eq("message_id", message.id).eq("account_id", context.account.id).eq("emoji", emoji)
      : await database.from("message_reactions").insert({ message_id: message.id, account_id: context.account.id, emoji });
    if (result.error) throw new Error("Unable to update the reaction.");
  } else if (input.action === "pin") {
    if (conversation.kind === "world" && !moderator) throw Object.assign(new Error("Moderator access required."), { status: 403 });
    if (conversation.kind === "group" && role === "member") throw Object.assign(new Error("Group administrator access required."), { status: 403 });
    const { data: existing } = await database.from("pinned_messages").select("message_id").eq("conversation_id", input.conversationId).eq("message_id", message.id).maybeSingle();
    const result = existing
      ? await database.from("pinned_messages").delete().eq("conversation_id", input.conversationId).eq("message_id", message.id)
      : await database.from("pinned_messages").insert({ conversation_id: input.conversationId, message_id: message.id, pinned_by: context.account.id });
    if (result.error) throw new Error("Unable to update the pin.");
  } else if (input.action === "read") {
    if (conversation.kind === "world") return;
    await database.from("conversation_members").update({ last_read_at: new Date().toISOString() }).eq("conversation_id", input.conversationId).eq("account_id", context.account.id);
    await database.from("message_receipts").upsert({ message_id: message.id, account_id: context.account.id, read_at: new Date().toISOString() });
  } else if (input.action === "report") {
    if (message.sender_id === context.account.id) throw new Error("You cannot report your own message.");
    const { error } = await database.from("message_reports").insert({ reporter_id: context.account.id, message_id: message.id, reported_account_id: message.sender_id, reason: input.reason ?? "other", details: input.details?.slice(0, 1000) ?? "" });
    if (error?.code === "23505") throw Object.assign(new Error("You already reported this message."), { status: 409 });
    if (error) throw new Error("Unable to submit the report.");
  }
}

export async function updateFriendship(context: SessionContext, input: { action: "request" | "accept" | "decline" | "remove" | "block" | "unblock"; username?: string; friendshipId?: string }) {
  socialUnavailable();
  const database = getSupabaseAdmin();
  if (input.action === "request" || input.action === "block" || input.action === "unblock") {
    const { data: target } = await database.from("accounts").select("id, username").eq("username", input.username?.toLowerCase() ?? "").eq("disabled", false).maybeSingle();
    if (!target || target.id === context.account.id) throw Object.assign(new Error("User not found."), { status: 404 });
    if (input.action === "block") {
      await database.from("user_blocks").upsert({ blocker_id: context.account.id, blocked_id: target.id });
      await database.from("friendships").delete().or(`and(requester_id.eq.${context.account.id},addressee_id.eq.${target.id}),and(requester_id.eq.${target.id},addressee_id.eq.${context.account.id})`);
      return;
    }
    if (input.action === "unblock") {
      await database.from("user_blocks").delete().eq("blocker_id", context.account.id).eq("blocked_id", target.id);
      return;
    }
    const { data: targetProfile } = await database.from("account_profiles").select("privacy").eq("account_id", target.id).maybeSingle();
    if (!safePrivacy(targetProfile?.privacy).friendRequests) throw Object.assign(new Error("This user is not accepting friend requests."), { status: 403 });
    const { data: blocked } = await database.from("user_blocks").select("blocker_id").or(`and(blocker_id.eq.${context.account.id},blocked_id.eq.${target.id}),and(blocker_id.eq.${target.id},blocked_id.eq.${context.account.id})`).limit(1);
    if (blocked?.length) throw Object.assign(new Error("Friend request unavailable."), { status: 403 });
    const { data: previous } = await database.from("friendships").select("id, state").or(`and(requester_id.eq.${context.account.id},addressee_id.eq.${target.id}),and(requester_id.eq.${target.id},addressee_id.eq.${context.account.id})`).maybeSingle();
    if (previous?.state === "declined") await database.from("friendships").delete().eq("id", previous.id);
    const { error } = await database.from("friendships").insert({ requester_id: context.account.id, addressee_id: target.id });
    if (error?.code === "23505") throw Object.assign(new Error("A friendship or request already exists."), { status: 409 });
    if (error) throw new Error("Unable to send the request.");
    return;
  }
  const { data: friendship } = await database.from("friendships").select("id, requester_id, addressee_id, state, created_at, responded_at").eq("id", input.friendshipId ?? "").maybeSingle();
  if (!friendship || (friendship.requester_id !== context.account.id && friendship.addressee_id !== context.account.id)) throw Object.assign(new Error("Friend request not found."), { status: 404 });
  if (input.action === "accept" || input.action === "decline") {
    if (friendship.addressee_id !== context.account.id || friendship.state !== "pending") throw Object.assign(new Error("This request cannot be changed."), { status: 403 });
    const { error } = await database.from("friendships").update({ state: input.action === "accept" ? "accepted" : "declined", responded_at: new Date().toISOString() }).eq("id", friendship.id);
    if (error) throw new Error("Unable to update the request.");
  } else {
    const { error } = await database.from("friendships").delete().eq("id", friendship.id);
    if (error) throw new Error("Unable to remove the friendship.");
  }
}

export async function updateConversation(context: SessionContext, input: { action: "edit" | "invite" | "leave" | "delete" | "role" | "invite_response"; conversationId: string; name?: string; description?: string; username?: string; accountId?: string; role?: ConversationRole; inviteId?: string; accept?: boolean }) {
  socialUnavailable();
  const database = getSupabaseAdmin();
  if (input.action === "invite_response") {
    const { data: invite } = await database.from("group_invites").select("id, conversation_id, inviter_id, invitee_id, state, created_at, expires_at, responded_at").eq("id", input.inviteId ?? "").eq("invitee_id", context.account.id).eq("state", "pending").maybeSingle();
    if (!invite || Date.parse(invite.expires_at) <= Date.now()) throw Object.assign(new Error("Invite is no longer available."), { status: 404 });
    if (input.accept) await database.from("conversation_members").upsert({ conversation_id: invite.conversation_id, account_id: context.account.id, role: "member" });
    await database.from("group_invites").update({ state: input.accept ? "accepted" : "declined", responded_at: new Date().toISOString() }).eq("id", invite.id);
    return;
  }
  const minimum = ["edit", "invite", "role", "delete"].includes(input.action) ? "admin" as const : undefined;
  const { conversation, role } = await requireConversation(context, input.conversationId, minimum);
  if (conversation.kind !== "group") throw new Error("This action is only available for groups.");
  if (input.action === "edit") {
    const name = input.name?.trim() ?? "";
    if (!name || name.length > 80 || (input.description?.length ?? 0) > 500) throw new Error("Enter a valid group name and description.");
    await database.from("conversations").update({ name, description: input.description?.trim() ?? "" }).eq("id", conversation.id);
  } else if (input.action === "invite") {
    const { data: target } = await database.from("accounts").select("id").eq("username", input.username?.toLowerCase() ?? "").eq("disabled", false).maybeSingle();
    if (!target) throw Object.assign(new Error("User not found."), { status: 404 });
    const { data: blocked } = await database.from("user_blocks").select("blocker_id").or(`and(blocker_id.eq.${context.account.id},blocked_id.eq.${target.id}),and(blocker_id.eq.${target.id},blocked_id.eq.${context.account.id})`).limit(1);
    if (blocked?.length) throw Object.assign(new Error("That user cannot be invited."), { status: 403 });
    const { error } = await database.from("group_invites").insert({ conversation_id: conversation.id, inviter_id: context.account.id, invitee_id: target.id });
    if (error?.code === "23505") throw Object.assign(new Error("That user already has a pending invite."), { status: 409 });
    if (error) throw new Error("Unable to send the invite.");
  } else if (input.action === "role") {
    if (role !== "owner") throw Object.assign(new Error("Only the group owner can change roles."), { status: 403 });
    if (!input.accountId || input.accountId === context.account.id || !["admin", "member"].includes(input.role ?? "")) throw new Error("Choose a valid member and role.");
    await database.from("conversation_members").update({ role: input.role }).eq("conversation_id", conversation.id).eq("account_id", input.accountId);
  } else if (input.action === "leave") {
    if (role === "owner") {
      const { data: successor } = await database.from("conversation_members").select("account_id, role, joined_at").eq("conversation_id", conversation.id).neq("account_id", context.account.id).order("role").order("joined_at").limit(1).maybeSingle();
      if (successor) {
        await database.from("conversation_members").update({ role: "owner" }).eq("conversation_id", conversation.id).eq("account_id", successor.account_id);
        await database.from("conversations").update({ owner_id: successor.account_id }).eq("id", conversation.id);
      } else {
        await database.from("conversations").update({ deleted_at: new Date().toISOString() }).eq("id", conversation.id);
      }
    }
    await database.from("conversation_members").delete().eq("conversation_id", conversation.id).eq("account_id", context.account.id);
  } else if (input.action === "delete") {
    if (role !== "owner") throw Object.assign(new Error("Only the group owner can delete this group."), { status: 403 });
    await database.from("conversations").update({ deleted_at: new Date().toISOString() }).eq("id", conversation.id);
  }
}

export async function updateNotifications(context: SessionContext, notificationId?: string) {
  socialUnavailable();
  let query = getSupabaseAdmin().from("notifications").update({ read_at: new Date().toISOString() }).eq("account_id", context.account.id).is("read_at", null);
  if (notificationId) query = query.eq("id", notificationId);
  const { error } = await query;
  if (error) throw new Error("Unable to update notifications.");
}

export async function updateSocialProfile(context: SessionContext, input: { displayName: string; bio: string; statusText: string; links: ProfileLink[]; privacy: ProfilePrivacy }) {
  socialUnavailable();
  const { error } = await getSupabaseAdmin().from("account_profiles").update({
    display_name: input.displayName,
    bio: input.bio,
    status_text: input.statusText,
    links: input.links,
    privacy: input.privacy,
  }).eq("account_id", context.account.id);
  if (error) throw new Error("Unable to update the profile.");
}

export async function reportSocialProfile(context: SessionContext, username: string, details: string) {
  socialUnavailable();
  const database = getSupabaseAdmin();
  const { data: target } = await database.from("accounts").select("id").eq("username", username).eq("disabled", false).maybeSingle();
  if (!target || target.id === context.account.id) throw Object.assign(new Error("Profile not found."), { status: 404 });
  const { error } = await database.from("message_reports").insert({ reporter_id: context.account.id, reported_account_id: target.id, reason: "other", details: details.slice(0, 1000) });
  if (error) throw new Error("Unable to submit the profile report.");
}

export async function uploadSocialFile(context: SessionContext, input: { conversationId?: string; file: File; purpose: "message" | "avatar" | "banner"; durationSeconds?: number | null }) {
  socialUnavailable();
  if (input.purpose === "message") {
    if (!input.conversationId) throw new Error("A conversation is required.");
    await requireConversation(context, input.conversationId);
  }
  const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "audio/webm", "audio/ogg", "audio/mpeg", "application/pdf", "text/plain", "application/zip"]);
  if (!allowed.has(input.file.type) || input.file.size < 1 || input.file.size > 25 * 1024 * 1024) throw Object.assign(new Error("Unsupported file type or size. Maximum upload size is 25 MB."), { status: 422 });
  const extension = input.file.name.includes(".") ? `.${input.file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10)}` : "";
  const path = `${context.account.id}/${input.purpose}/${randomUUID()}${extension}`;
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const database = getSupabaseAdmin();
  const { error: uploadError } = await database.storage.from(SOCIAL_BUCKET).upload(path, bytes, { contentType: input.file.type, cacheControl: "3600", upsert: false });
  if (uploadError) throw new Error("Unable to store the upload.");
  if (input.purpose === "avatar" || input.purpose === "banner") {
    const profileUpdate = input.purpose === "avatar" ? { avatar_path: path } : { banner_path: path };
    const { error } = await database.from("account_profiles").update(profileUpdate).eq("account_id", context.account.id);
    if (error) {
      await database.storage.from(SOCIAL_BUCKET).remove([path]);
      throw new Error("Unable to update the profile image.");
    }
    return { id: null, path };
  }
  const { data, error } = await database.from("message_attachments").insert({
    conversation_id: input.conversationId!,
    uploader_id: context.account.id,
    storage_path: path,
    file_name: input.file.name.slice(0, 255),
    mime_type: input.file.type,
    byte_size: input.file.size,
    duration_seconds: input.durationSeconds ?? null,
  }).select("id").single();
  if (error || !data) {
    await database.storage.from(SOCIAL_BUCKET).remove([path]);
    throw new Error("Unable to register the attachment.");
  }
  return { id: data.id, path };
}

export async function setPresence(context: SessionContext, state: PresenceState) {
  socialUnavailable();
  const { error } = await getSupabaseAdmin().from("user_presence").upsert({ account_id: context.account.id, state, last_seen_at: new Date().toISOString() });
  if (error) throw new Error("Unable to update presence.");
}

export async function touchPresence(context: SessionContext) {
  socialUnavailable();
  const { error } = await getSupabaseAdmin().from("user_presence").update({ last_seen_at: new Date().toISOString() }).eq("account_id", context.account.id);
  if (error) throw new Error("Unable to refresh presence.");
}

export async function listModeration(context: SessionContext) {
  socialUnavailable();
  if (context.account.accountType === "normal") throw Object.assign(new Error("Moderator access required."), { status: 403 });
  const database = getSupabaseAdmin();
  const [{ data: reports }, { data: settings }] = await Promise.all([
    database.from("message_reports").select("id, reporter_id, message_id, reported_account_id, reason, details, state, reviewed_by, created_at, reviewed_at").in("state", ["open", "reviewing"]).order("created_at").limit(100),
    database.from("world_chat_settings").select("singleton, slow_mode_seconds, profanity_filter, links_allowed, updated_at, updated_by").single(),
  ]);
  const ids = [...new Set((reports ?? []).flatMap((report) => [report.reporter_id, report.reported_account_id].filter((id): id is string => Boolean(id))))];
  const profiles = await profileMap(ids, context.account.id);
  return {
    reports: (reports ?? []).map((report) => ({ ...report, reporter: profiles.get(report.reporter_id) ?? null, reported: report.reported_account_id ? profiles.get(report.reported_account_id) ?? null : null })),
    settings,
  };
}

export async function moderate(context: SessionContext, input: { action: "resolve" | "dismiss" | "settings" | "announcement"; reportId?: string; slowModeSeconds?: number; profanityFilter?: boolean; linksAllowed?: boolean; title?: string; body?: string }) {
  socialUnavailable();
  if (context.account.accountType === "normal") throw Object.assign(new Error("Moderator access required."), { status: 403 });
  const database = getSupabaseAdmin();
  if (input.action === "settings") {
    const { error } = await database.from("world_chat_settings").update({ slow_mode_seconds: input.slowModeSeconds, profanity_filter: input.profanityFilter, links_allowed: input.linksAllowed, updated_by: context.account.id }).eq("singleton", true);
    if (error) throw new Error("Unable to update world-chat settings.");
  } else if (input.action === "announcement") {
    const { data: accounts } = await database.from("accounts").select("id").eq("disabled", false);
    const rows = (accounts ?? []).map((account) => ({ account_id: account.id, actor_id: context.account.id, kind: "announcement" as const, title: input.title?.slice(0, 160) || "SynthNet announcement", body: input.body?.slice(0, 500) ?? "" }));
    if (rows.length) await database.from("notifications").insert(rows);
    await database.from("moderation_actions").insert({ moderator_id: context.account.id, action: "announcement", reason: `${input.title ?? ""}: ${input.body ?? ""}`.slice(0, 1000) });
  } else {
    const state = input.action === "resolve" ? "resolved" as const : "dismissed" as const;
    const { error } = await database.from("message_reports").update({ state, reviewed_by: context.account.id, reviewed_at: new Date().toISOString() }).eq("id", input.reportId ?? "").in("state", ["open", "reviewing"]);
    if (error) throw new Error("Unable to update the report.");
    await database.from("moderation_actions").insert({ moderator_id: context.account.id, action: input.action === "resolve" ? "resolve_report" : "dismiss_report", reason: input.reportId ?? "" });
  }
}

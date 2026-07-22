import type { AccountRole } from "@/lib/types";

export type PresenceState = "online" | "away" | "dnd" | "offline";
export type ConversationKind = "direct" | "group" | "world";
export type ConversationRole = "owner" | "admin" | "member";
export type MessageKind = "text" | "image" | "video" | "document" | "voice" | "gif" | "system";
export type FriendshipState = "pending" | "accepted" | "declined";

export type ProfilePrivacy = {
  activity: "everyone" | "friends" | "private";
  mutuals: boolean;
  presence: boolean;
  friendRequests: boolean;
};

export type ProfileLink = { label: string; url: string };

export type SocialProfile = {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  statusText: string;
  accountType: AccountRole;
  badges: string[];
  links: ProfileLink[];
  avatarUrl: string | null;
  bannerUrl: string | null;
  presence: PresenceState;
  lastSeenAt: string | null;
  joinedAt: string;
  friendship: FriendshipState | null;
  friendshipId: string | null;
  friendshipDirection: "incoming" | "outgoing" | null;
  blocked: boolean;
  blockedBy: boolean;
  mutualFriends: number;
  mutualGroups: number;
  recentActivity: Array<{ action: string; timestamp: string }>;
  privacy: ProfilePrivacy;
};

export type ConversationMember = {
  profile: SocialProfile;
  role: ConversationRole;
  joinedAt: string;
};

export type MessageReaction = { emoji: string; count: number; reacted: boolean };

export type MessageAttachment = {
  id: string;
  name: string;
  mimeType: string;
  byteSize: number;
  durationSeconds: number | null;
  url: string;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  sender: SocialProfile | null;
  kind: MessageKind;
  content: string;
  replyTo: { id: string; content: string; username: string | null } | null;
  reactions: MessageReaction[];
  attachments: MessageAttachment[];
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  pinned: boolean;
  readBy: number;
};

export type ConversationSummary = {
  id: string;
  kind: ConversationKind;
  name: string;
  description: string;
  avatarUrl: string | null;
  role: ConversationRole | null;
  members: ConversationMember[];
  latestMessage: Pick<ChatMessage, "id" | "content" | "createdAt" | "kind"> | null;
  unreadCount: number;
  muted: boolean;
  updatedAt: string;
};

export type FriendRecord = {
  id: string;
  state: FriendshipState;
  direction: "incoming" | "outgoing";
  createdAt: string;
  profile: SocialProfile;
};

export type SocialNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  actor: SocialProfile | null;
  conversationId: string | null;
  messageId: string | null;
  friendshipId: string | null;
  inviteId: string | null;
  createdAt: string;
  readAt: string | null;
};

export type SocialBootstrap = {
  self: SocialProfile;
  people: SocialProfile[];
  friends: FriendRecord[];
  conversations: ConversationSummary[];
  notifications: SocialNotification[];
  unreadNotifications: number;
  worldConversationId: string;
};

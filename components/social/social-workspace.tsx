"use client";
/* eslint-disable @next/next/no-img-element -- Signed Storage and user-provided GIF URLs must not pass through the image proxy. */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  Bell,
  BellRing,
  Check,
  CheckCheck,
  Circle,
  Download,
  Edit3,
  File,
  Flag,
  Gift,
  Globe2,
  ImagePlus,
  LoaderCircle,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Paperclip,
  Pin,
  Plus,
  Reply,
  Search,
  Send,
  Shield,
  Smile,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  Volume2,
  X,
} from "lucide-react";
import type { SessionAccount } from "@/lib/types";
import type {
  ChatMessage,
  ConversationSummary,
  FriendRecord,
  SocialBootstrap,
  SocialNotification,
  SocialProfile,
} from "@/lib/social/types";
import { apiRequest } from "@/lib/client/api";

export type SocialMode = "chats" | "world" | "friends" | "people" | "notifications";

const EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥", "👀", "🙏", "✅", "🚀", "💡"];

function initials(profile: Pick<SocialProfile, "displayName" | "username">) {
  return (profile.displayName || profile.username).split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function relativeTime(value: string) {
  const seconds = Math.round((Date.now() - Date.parse(value)) / 1000);
  if (seconds < 45) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function messagePreview(message: Pick<ChatMessage, "content" | "kind">) {
  if (message.content.trim()) return message.content;
  if (message.kind === "voice") return "Voice note";
  if (message.kind === "image") return "Image";
  if (message.kind === "video") return "Video";
  return "Attachment";
}

function PresenceDot({ state }: { state: SocialProfile["presence"] }) {
  return <i className={`presence-dot ${state}`} title={state} aria-label={state} />;
}

function Avatar({ profile, size = "medium", onClick }: { profile: SocialProfile; size?: "small" | "medium" | "large"; onClick?: () => void }) {
  const content = profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : <span>{initials(profile)}</span>;
  return onClick
    ? <button className={`social-avatar ${size}`} onClick={onClick} aria-label={`Open @${profile.username}'s profile`}>{content}<PresenceDot state={profile.presence} /></button>
    : <div className={`social-avatar ${size}`}>{content}<PresenceDot state={profile.presence} /></div>;
}

function InlineText({ text, onProfile }: { text: string; onProfile: (username: string) => void }) {
  const pieces = text.split(/(@[a-z0-9_-]{3,32}|\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s]+)/gi);
  return <>{pieces.map((piece, index) => {
    if (/^@[a-z0-9_-]{3,32}$/i.test(piece)) return <button className="mention" key={index} onClick={() => onProfile(piece.slice(1).toLowerCase())}>{piece}</button>;
    if (/^\*\*[^*]+\*\*$/.test(piece)) return <strong key={index}>{piece.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(piece)) return <code key={index}>{piece.slice(1, -1)}</code>;
    if (/^https?:\/\//i.test(piece)) return <a key={index} href={piece} target="_blank" rel="noreferrer">{piece}</a>;
    return piece;
  })}</>;
}

function RichText({ text, onProfile }: { text: string; onProfile: (username: string) => void }) {
  return <>{text.split("\n").map((line, index) => <span className="rich-line" key={index}><InlineText text={line} onProfile={onProfile} /></span>)}</>;
}

function EmptyPanel({ icon: Icon, title, copy, action }: { icon: typeof MessageCircle; title: string; copy: string; action?: React.ReactNode }) {
  return <div className="social-empty"><span><Icon size={25} /></span><h2>{title}</h2><p>{copy}</p>{action}</div>;
}

function ProfileDialog({ profile, selfId, onClose, onAction, onMessage }: {
  profile: SocialProfile;
  selfId: string;
  onClose: () => void;
  onAction: (action: string, profile: SocialProfile) => Promise<void>;
  onMessage: (profile: SocialProfile) => Promise<void>;
}) {
  const [busy, setBusy] = useState("");
  const isSelf = profile.id === selfId;
  async function act(action: string) {
    setBusy(action);
    try { await onAction(action, profile); onClose(); } finally { setBusy(""); }
  }
  return <div className="social-overlay" onMouseDown={onClose}>
    <article className="profile-dialog" role="dialog" aria-modal="true" aria-label={`${profile.displayName}'s profile`} onMouseDown={(event) => event.stopPropagation()}>
      <button className="dialog-close" onClick={onClose} aria-label="Close profile"><X size={18} /></button>
      <div className="profile-banner" style={profile.bannerUrl ? { backgroundImage: `url(${profile.bannerUrl})` } : undefined} />
      <div className="profile-dialog-body">
        <Avatar profile={profile} size="large" />
        <div className="profile-identity"><h2>{profile.displayName}</h2><p>@{profile.username}</p><span><PresenceDot state={profile.presence} /> {profile.presence}{profile.statusText ? ` · ${profile.statusText}` : ""}</span></div>
        {!isSelf && <div className="profile-actions">
          <button className="primary-button" onClick={() => void onMessage(profile)}><MessageCircle size={14} /> MESSAGE</button>
          {profile.friendship === "accepted" ? <button onClick={() => void act("remove")} disabled={!!busy}><UserMinus size={14} /> REMOVE FRIEND</button>
            : profile.friendship === "pending" ? <button disabled><Check size={14} /> {profile.friendshipDirection === "incoming" ? "REQUEST RECEIVED" : "REQUEST SENT"}</button>
            : <button onClick={() => void act("request")} disabled={!!busy}><UserPlus size={14} /> ADD FRIEND</button>}
          <button onClick={() => void act(profile.blocked ? "unblock" : "block")} disabled={!!busy}><Shield size={14} /> {profile.blocked ? "UNBLOCK" : "BLOCK"}</button>
          <button onClick={() => void act("report")} disabled={!!busy}><Flag size={14} /> REPORT</button>
        </div>}
        <section><small>ABOUT</small><p>{profile.bio || "No bio yet."}</p></section>
        {!!profile.links.length && <section><small>LINKS</small><div className="profile-links">{profile.links.map((link) => <a key={`${link.label}-${link.url}`} href={link.url} target="_blank" rel="noreferrer">{link.label}</a>)}</div></section>}
        {!!profile.recentActivity.length && <section><small>RECENT ACTIVITY</small><div className="profile-activity">{profile.recentActivity.map((activity, index) => <p key={`${activity.timestamp}-${index}`}><span>{activity.action.replaceAll("_", " ")}</span><time>{relativeTime(activity.timestamp)}</time></p>)}</div></section>}
        <div className="profile-facts"><div><strong>{profile.mutualFriends}</strong><span>Mutual friends</span></div><div><strong>{profile.mutualGroups}</strong><span>Shared groups</span></div><div><strong>{new Date(profile.joinedAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</strong><span>Joined SynthNet</span></div></div>
        <div className="profile-badges"><small>ROLES & BADGES</small><span className="profile-role">{profile.accountType.toUpperCase()}</span>{profile.badges.map((badge) => <span key={badge}>{badge}</span>)}</div>
      </div>
    </article>
  </div>;
}

function ConversationAvatar({ conversation }: { conversation: ConversationSummary }) {
  if (conversation.avatarUrl) return <img src={conversation.avatarUrl} alt="" />;
  if (conversation.kind === "world") return <Globe2 size={18} />;
  if (conversation.kind === "group") return <Users size={18} />;
  return <span>{conversation.name.slice(0, 2).toUpperCase()}</span>;
}

function ConversationRail({ social, selectedId, onSelect, onCreate }: { social: SocialBootstrap; selectedId: string | null; onSelect: (id: string) => void; onCreate: () => void }) {
  const [query, setQuery] = useState("");
  const conversations = social.conversations.filter((conversation) => `${conversation.name} ${conversation.latestMessage?.content ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  return <aside className="conversation-rail">
    <div className="rail-heading"><div><small>COMMUNICATIONS</small><h2>Messages</h2></div><button onClick={onCreate} aria-label="New conversation"><Plus size={17} /></button></div>
    <label className="social-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" aria-label="Search conversations" /></label>
    <div className="conversation-list">
      {conversations.map((conversation) => <button key={conversation.id} className={selectedId === conversation.id ? "active" : ""} onClick={() => onSelect(conversation.id)}>
        <span className={`conversation-icon ${conversation.kind}`}><ConversationAvatar conversation={conversation} /></span>
        <span className="conversation-copy"><strong>{conversation.name}</strong><small>{conversation.latestMessage ? messagePreview(conversation.latestMessage) : conversation.description || "No messages yet"}</small></span>
        <span className="conversation-meta"><time>{relativeTime(conversation.latestMessage?.createdAt ?? conversation.updatedAt)}</time>{conversation.unreadCount > 0 && <b>{conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}</b>}</span>
      </button>)}
      {!conversations.length && <p className="rail-empty">No conversations found.</p>}
    </div>
    <div className="online-strip"><span><Circle size={7} fill="currentColor" /> ONLINE FRIENDS</span><div>{social.friends.filter((friend) => friend.state === "accepted" && friend.profile.presence !== "offline").slice(0, 6).map((friend) => <Avatar key={friend.id} profile={friend.profile} size="small" />)}</div></div>
  </aside>;
}

function NewConversationDialog({ people, onClose, onCreate }: { people: SocialProfile[]; onClose: () => void; onCreate: (input: { kind: "direct"; username: string } | { kind: "group"; name: string; usernames: string[] }) => Promise<void> }) {
  const [kind, setKind] = useState<"direct" | "group">("direct");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const matches = people.filter((profile) => `${profile.displayName} ${profile.username}`.toLowerCase().includes(query.toLowerCase())).slice(0, 20);
  async function submit() {
    setBusy(true); setError("");
    try {
      if (kind === "direct") {
        if (selected.length !== 1) throw new Error("Choose one person.");
        await onCreate({ kind, username: selected[0] });
      } else {
        if (!name.trim()) throw new Error("Enter a group name.");
        await onCreate({ kind, name: name.trim(), usernames: selected });
      }
      onClose();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to create conversation."); }
    finally { setBusy(false); }
  }
  return <div className="social-overlay" onMouseDown={onClose}><section className="new-chat-dialog" role="dialog" aria-modal="true" aria-labelledby="new-chat-title" onMouseDown={(event) => event.stopPropagation()}>
    <header><div><small>NEW CONVERSATION</small><h2 id="new-chat-title">Connect with your network</h2></div><button onClick={onClose}><X size={17} /></button></header>
    <div className="segmented"><button className={kind === "direct" ? "active" : ""} onClick={() => { setKind("direct"); setSelected([]); }}>DIRECT MESSAGE</button><button className={kind === "group" ? "active" : ""} onClick={() => setKind("group")}>GROUP CHAT</button></div>
    {kind === "group" && <label className="dialog-field">GROUP NAME<input autoFocus value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="e.g. Product launch" /></label>}
    <label className="social-search dialog-search"><Search size={14} /><input autoFocus={kind === "direct"} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by username" /></label>
    <div className="people-picker">{matches.map((profile) => { const active = selected.includes(profile.username); return <button key={profile.id} className={active ? "active" : ""} onClick={() => setSelected((current) => kind === "direct" ? [profile.username] : active ? current.filter((username) => username !== profile.username) : [...current, profile.username])}><Avatar profile={profile} size="small" /><span><strong>{profile.displayName}</strong><small>@{profile.username}</small></span><i>{active && <Check size={13} />}</i></button>; })}</div>
    {error && <p className="social-error" role="alert">{error}</p>}
    <footer><span>{selected.length} selected</span><button className="primary-button" disabled={busy || !selected.length || (kind === "group" && !name.trim())} onClick={() => void submit()}>{busy ? <LoaderCircle className="spin" size={14} /> : <MessageCircle size={14} />} {kind === "direct" ? "START CHAT" : "CREATE GROUP"}</button></footer>
  </section></div>;
}

function MessageAttachmentView({ attachment }: { attachment: ChatMessage["attachments"][number] }) {
  if (attachment.mimeType.startsWith("image/")) return <a className="message-image" href={attachment.url} target="_blank" rel="noreferrer"><img src={attachment.url} alt={attachment.name} loading="lazy" /></a>;
  if (attachment.mimeType.startsWith("video/")) return <video className="message-video" src={attachment.url} controls preload="metadata" />;
  if (attachment.mimeType.startsWith("audio/")) return <div className="voice-note"><Volume2 size={16} /><audio src={attachment.url} controls preload="metadata" /></div>;
  return <a className="file-attachment" href={attachment.url} download={attachment.name}><File size={18} /><span><strong>{attachment.name}</strong><small>{Math.ceil(attachment.byteSize / 1024)} KB</small></span><Download size={15} /></a>;
}

type ContextMenu = { message: ChatMessage; x: number; y: number } | null;
type SocialEventDetail = {
  scope?: string;
  conversationId?: string;
  messageId?: string;
  eventType?: "INSERT" | "UPDATE" | "DELETE";
  message?: {
    id: string;
    senderId: string | null;
    kind: ChatMessage["kind"];
    content: string;
    replyToId: string | null;
    createdAt: string;
    editedAt: string | null;
    deletedAt: string | null;
  };
};

function mergeChatMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const messages = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) messages.set(message.id, message);
  return [...messages.values()].sort((left, right) => {
    const time = Date.parse(left.createdAt) - Date.parse(right.createdAt);
    return time || left.id.localeCompare(right.id);
  });
}

function MessageRow({ message, selfId, pending, onProfile, onUsername, onReply, onAction, onContext }: {
  message: ChatMessage;
  selfId: string;
  pending: boolean;
  onProfile: (profile: SocialProfile) => void;
  onUsername?: (username: string) => void;
  onReply: (message: ChatMessage) => void;
  onAction: (action: string, message: ChatMessage, value?: string) => Promise<void>;
  onContext: (menu: ContextMenu) => void;
}) {
  const own = message.sender?.id === selfId;
  if (message.deletedAt) return <article id={`message-${message.id}`} className="chat-message deleted"><div className="message-avatar-placeholder" /><div><p>Message deleted</p><time>{new Date(message.createdAt).toLocaleString()}</time></div></article>;
  return <article id={`message-${message.id}`} className={`chat-message ${own ? "own" : ""} ${pending ? "pending" : ""}`} onContextMenu={(event) => { event.preventDefault(); onContext({ message, x: event.clientX, y: event.clientY }); }}>
    {message.sender ? <Avatar profile={message.sender} size="small" onClick={() => onProfile(message.sender!)} /> : <div className="message-avatar-placeholder" />}
    <div className="message-body">
      <header>{message.sender && <button onClick={() => onProfile(message.sender!)}>{message.sender.displayName}</button>}<span>@{message.sender?.username ?? "deleted"}</span><time title={new Date(message.createdAt).toLocaleString()}>{relativeTime(message.createdAt)}</time>{pending && <small>sending…</small>}{message.editedAt && <small>edited</small>}{message.pinned && <Pin size={11} />}</header>
      {message.replyTo && <button className="reply-preview" onClick={() => document.getElementById(`message-${message.replyTo?.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}><Reply size={11} /><span>@{message.replyTo.username ?? "unknown"}</span>{message.replyTo.content.slice(0, 100)}</button>}
      {message.kind === "gif" && /^https?:\/\//.test(message.content) ? <img className="gif-message" src={message.content} alt="Shared GIF" loading="lazy" /> : message.content && <p><RichText text={message.content} onProfile={(username) => onUsername?.(username)} /></p>}
      {message.attachments.map((attachment) => pending && !attachment.url
        ? <span className="file-attachment pending-attachment" key={attachment.id}><File size={18} /><span><strong>{attachment.name}</strong><small>Uploading complete · sending…</small></span></span>
        : <MessageAttachmentView key={attachment.id} attachment={attachment} />)}
      {!!message.reactions.length && <div className="reaction-row">{message.reactions.map((reaction) => <button key={reaction.emoji} className={reaction.reacted ? "reacted" : ""} onClick={() => void onAction("react", message, reaction.emoji)}>{reaction.emoji} <span>{reaction.count}</span></button>)}</div>}
      {own && message.readBy > 1 && <span className="read-receipt"><CheckCheck size={12} /> Read by {message.readBy - 1}</span>}
    </div>
    {!pending && <div className="message-quick-actions"><button title="React" onClick={() => void onAction("react", message, "👍")}><Smile size={13} /></button><button title="Reply" onClick={() => onReply(message)}><Reply size={13} /></button><button title="More" onClick={(event) => onContext({ message, x: event.clientX, y: event.clientY })}><MoreHorizontal size={13} /></button></div>}
  </article>;
}

function MessageContextMenu({ menu, selfId, canModerate, onClose, onReply, onAction }: { menu: NonNullable<ContextMenu>; selfId: string; canModerate: boolean; onClose: () => void; onReply: (message: ChatMessage) => void; onAction: (action: string, message: ChatMessage, value?: string) => Promise<void> }) {
  const own = menu.message.sender?.id === selfId;
  function run(action: string, value?: string) { void onAction(action, menu.message, value).finally(onClose); }
  return <div className="message-context" style={{ left: Math.min(menu.x, window.innerWidth - 210), top: Math.min(menu.y, window.innerHeight - 310) }} role="menu">
    <button onClick={() => { onReply(menu.message); onClose(); }}><Reply size={13} /> Reply</button>
    <div className="context-emojis">{EMOJIS.slice(0, 5).map((emoji) => <button key={emoji} onClick={() => run("react", emoji)}>{emoji}</button>)}</div>
    <button onClick={() => run("pin")}><Pin size={13} /> {menu.message.pinned ? "Unpin" : "Pin message"}</button>
    {own && <button onClick={() => run("edit")}><Edit3 size={13} /> Edit message</button>}
    {(own || canModerate) && <button className="danger" onClick={() => run("delete")}><Trash2 size={13} /> Delete message</button>}
    {!own && <button className="danger" onClick={() => run("report")}><Flag size={13} /> Report message</button>}
  </div>;
}

function ChatPanel({ conversation, account, self, knownProfiles, onProfile, onConversationActivity }: { conversation: ConversationSummary; account: SessionAccount; self: SocialProfile; knownProfiles: SocialProfile[]; onProfile: (profile: SocialProfile) => void; onConversationActivity: (message: ChatMessage) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState<SocialProfile[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [content, setContent] = useState("");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [showPinned, setShowPinned] = useState(false);
  const [gifUrl, setGifUrl] = useState("");
  const [reply, setReply] = useState<ChatMessage | null>(null);
  const [uploads, setUploads] = useState<Array<{ id: string; name: string }>>([]);
  const [notice, setNotice] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenu>(null);
  const [recording, setRecording] = useState(false);
  const [dragging, setDragging] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingExpiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queuedMessageIds = useRef(new Set<string>());
  const lastTypingSentAt = useRef(0);
  const lastReadMessageId = useRef<string | null>(null);
  const shouldStickToBottom = useRef(true);
  const sendInFlight = useRef(false);
  const searchQueryRef = useRef("");
  const replaceLoadRequestId = useRef(0);
  const [pendingMessageIds, setPendingMessageIds] = useState<string[]>([]);
  messagesRef.current = messages;
  searchQueryRef.current = query.trim();

  const load = useCallback(async (options: { before?: string; search?: string; append?: boolean; ids?: string[] } = {}) => {
    const replacesTimeline = !options.append && !options.ids;
    const requestId = replacesTimeline ? ++replaceLoadRequestId.current : 0;
    const parameters = new URLSearchParams({ conversationId: conversation.id });
    if (options.before) parameters.set("before", options.before);
    if (options.search) parameters.set("q", options.search);
    for (const id of options.ids ?? []) parameters.append("id", id);
    const data = await apiRequest<{ messages: ChatMessage[]; hasMore: boolean; typing: SocialProfile[] }>(`/api/social/messages?${parameters}`);
    if (replacesTimeline && requestId !== replaceLoadRequestId.current) return data;
    setMessages((current) => options.append || options.ids ? mergeChatMessages(current, data.messages) : data.messages);
    if (!options.ids) {
      setHasMore(data.hasMore);
      setTyping(data.typing);
    }
    const latestMessage = data.messages.at(-1);
    if (latestMessage) onConversationActivity(latestMessage);
    return data;
  }, [conversation.id, onConversationActivity]);

  const loadTyping = useCallback(async () => {
    const parameters = new URLSearchParams({ conversationId: conversation.id, typingOnly: "true" });
    const data = await apiRequest<{ typing: SocialProfile[] }>(`/api/social/messages?${parameters}`);
    setTyping(data.typing);
    if (typingExpiryTimer.current) clearTimeout(typingExpiryTimer.current);
    if (data.typing.length) typingExpiryTimer.current = setTimeout(() => setTyping([]), 8_500);
  }, [conversation.id]);

  useEffect(() => {
    setLoading(true); setMessages([]); setQuery(""); setShowPinned(false); setReply(null); setUploads([]);
    load().catch((error) => setNotice(error.message)).finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!loading && !query && shouldStickToBottom.current && timelineRef.current) timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
  }, [loading, messages.length, query]);

  useEffect(() => {
    const refreshMessages = (event: Event) => {
      if (searchQueryRef.current) return;
      const detail = (event as CustomEvent<SocialEventDetail>).detail;
      const liveMessage = detail?.message;
      if (liveMessage && detail.conversationId === conversation.id) {
        const existing = messagesRef.current.find((message) => message.id === liveMessage.id);
        const sender = liveMessage.senderId === self.id
          ? self
          : conversation.members.find((member) => member.profile.id === liveMessage.senderId)?.profile
            ?? knownProfiles.find((profile) => profile.id === liveMessage.senderId)
            ?? existing?.sender
            ?? null;
        const message: ChatMessage = {
          id: liveMessage.id,
          conversationId: conversation.id,
          sender,
          kind: liveMessage.kind,
          content: liveMessage.deletedAt ? "" : liveMessage.content,
          replyTo: existing?.replyTo ?? null,
          reactions: existing?.reactions ?? [],
          attachments: existing?.attachments ?? [],
          createdAt: liveMessage.createdAt,
          editedAt: liveMessage.editedAt,
          deletedAt: liveMessage.deletedAt,
          pinned: existing?.pinned ?? false,
          readBy: existing?.readBy ?? (liveMessage.senderId === account.id ? 1 : 0),
        };
        setMessages((current) => mergeChatMessages(current, [message]));
        onConversationActivity(message);
      }
      const messageId = detail?.messageId;
      if (messageId) queuedMessageIds.current.add(messageId);
      if (messageRefreshTimer.current) return;
      messageRefreshTimer.current = setTimeout(() => {
        messageRefreshTimer.current = null;
        const ids = [...queuedMessageIds.current].slice(0, 20);
        queuedMessageIds.current.clear();
        void load(ids.length ? { ids } : {}).catch(() => undefined);
      }, 150);
    };
    const refreshTyping = () => void loadTyping().catch(() => undefined);
    window.addEventListener(`social:messages:${conversation.id}`, refreshMessages);
    window.addEventListener(`social:typing:${conversation.id}`, refreshTyping);
    return () => {
      window.removeEventListener(`social:messages:${conversation.id}`, refreshMessages);
      window.removeEventListener(`social:typing:${conversation.id}`, refreshTyping);
      if (messageRefreshTimer.current) clearTimeout(messageRefreshTimer.current);
      if (typingExpiryTimer.current) clearTimeout(typingExpiryTimer.current);
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [account.id, conversation.id, conversation.members, knownProfiles, load, loadTyping, onConversationActivity, self]);

  useEffect(() => {
    const latest = messages.at(-1);
    if (!latest || conversation.kind === "world" || latest.id.startsWith("optimistic:") || latest.sender?.id === account.id || lastReadMessageId.current === latest.id) return;
    lastReadMessageId.current = latest.id;
    void apiRequest("/api/social/messages", { method: "PATCH", body: JSON.stringify({ action: "read", conversationId: conversation.id, messageId: latest.id }) }).catch(() => {
      if (lastReadMessageId.current === latest.id) lastReadMessageId.current = null;
    });
  }, [account.id, conversation.id, conversation.kind, messages]);

  function updateTyping(active: boolean) {
    if (conversation.kind === "world") return;
    void apiRequest("/api/social/messages", { method: "PATCH", body: JSON.stringify({ action: "typing", conversationId: conversation.id, active }) }).catch(() => undefined);
  }

  function signalTyping(value: string) {
    setContent(value);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (!value.trim()) {
      if (lastTypingSentAt.current) updateTyping(false);
      lastTypingSentAt.current = 0;
      return;
    }
    const now = Date.now();
    if (now - lastTypingSentAt.current >= 3_000) {
      lastTypingSentAt.current = now;
      updateTyping(true);
    }
    typingTimer.current = setTimeout(() => {
      lastTypingSentAt.current = 0;
      updateTyping(false);
    }, 1_500);
  }

  async function uploadFile(file: File, durationSeconds?: number) {
    const form = new FormData();
    form.set("file", file);
    form.set("purpose", "message");
    form.set("conversationId", conversation.id);
    if (durationSeconds) form.set("durationSeconds", String(durationSeconds));
    const data = await apiRequest<{ upload: { id: string } }>("/api/social/upload", { method: "POST", body: form });
    setUploads((current) => [...current, { id: data.upload.id, name: file.name }]);
    return data.upload.id;
  }

  async function chooseFiles(files: FileList | File[]) {
    setSending(true); setNotice("");
    try { await Promise.all(Array.from(files).slice(0, 10 - uploads.length).map((file) => uploadFile(file))); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Unable to upload file."); }
    finally { setSending(false); }
  }

  async function send(kind: ChatMessage["kind"] = "text", overrideContent?: string, overrideAttachments?: string[]) {
    if (sendInFlight.current) return;
    const text = overrideContent ?? content.trim();
    const attachmentIds = overrideAttachments ?? uploads.map((upload) => upload.id);
    if (!text && !attachmentIds.length) return;
    const draftReply = reply;
    const draftUploads = [...uploads];
    const optimisticId = `optimistic:${crypto.randomUUID()}`;
    const messageKind = kind === "system" ? "text" : kind === "text" && !text && attachmentIds.length ? "document" : kind;
    const optimisticMessage: ChatMessage = {
      id: optimisticId,
      conversationId: conversation.id,
      sender: self,
      kind: messageKind,
      content: text,
      replyTo: draftReply ? { id: draftReply.id, content: draftReply.content, username: draftReply.sender?.username ?? null } : null,
      reactions: [],
      attachments: attachmentIds.flatMap((id) => {
        const upload = draftUploads.find((item) => item.id === id);
        return upload ? [{ id, name: upload.name, mimeType: "application/octet-stream", byteSize: 0, durationSeconds: null, url: "" }] : [];
      }),
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
      pinned: false,
      readBy: 1,
    };
    sendInFlight.current = true;
    setSending(true); setNotice("");
    setMessages((current) => mergeChatMessages(current, [optimisticMessage]));
    setPendingMessageIds((current) => [...current, optimisticId]);
    setContent(""); setReply(null); setUploads([]); setGifUrl(""); setGifOpen(false);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (lastTypingSentAt.current) updateTyping(false);
    lastTypingSentAt.current = 0;
    try {
      const data = await apiRequest<{ messageId: string }>("/api/social/messages", { method: "POST", body: JSON.stringify({ conversationId: conversation.id, content: text, kind: messageKind, replyToId: draftReply?.id ?? null, attachmentIds }) });
      const acceptedMessage = { ...optimisticMessage, id: data.messageId };
      setMessages((current) => mergeChatMessages(current.filter((message) => message.id !== optimisticId), [acceptedMessage]));
      setPendingMessageIds((current) => current.filter((id) => id !== optimisticId));
      onConversationActivity(acceptedMessage);
      void load({ ids: [data.messageId] }).catch(() => undefined);
    } catch (error) {
      setMessages((current) => current.filter((message) => message.id !== optimisticId));
      setPendingMessageIds((current) => current.filter((id) => id !== optimisticId));
      if (kind === "gif") { setGifUrl(text); setGifOpen(true); }
      else setContent((current) => current || text);
      setReply((current) => current ?? draftReply);
      setUploads((current) => current.length ? current : draftUploads);
      setNotice(error instanceof Error ? error.message : "Unable to send message.");
    }
    finally { sendInFlight.current = false; setSending(false); }
  }

  async function toggleRecording() {
    if (recording) { recorderRef.current?.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setNotice("Voice recording is not supported by this browser."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const started = Date.now();
      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : undefined });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        setRecording(false); stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const file = new globalThis.File([blob], `voice-note-${Date.now()}.webm`, { type: blob.type });
        try { const id = await uploadFile(file, (Date.now() - started) / 1000); await send("voice", "Voice note", [id]); }
        catch (error) { setNotice(error instanceof Error ? error.message : "Unable to send voice note."); }
      };
      recorderRef.current = recorder; recorder.start(250); setRecording(true);
    } catch { setNotice("Microphone access was denied."); }
  }

  async function action(actionName: string, message: ChatMessage, value?: string) {
    try {
      let payload: Record<string, unknown> = { action: actionName, conversationId: conversation.id, messageId: message.id };
      if (actionName === "react") payload.emoji = value;
      if (actionName === "edit") {
        const updated = window.prompt("Edit message", message.content)?.trim();
        if (!updated || updated === message.content) return;
        payload.content = updated;
      }
      if (actionName === "delete" && !window.confirm("Delete this message? This cannot be undone.")) return;
      if (actionName === "report") {
        const details = window.prompt("Describe the issue (optional)") ?? "";
        payload = { ...payload, reason: "other", details };
      }
      await apiRequest("/api/social/messages", { method: "PATCH", body: JSON.stringify(payload) });
      if (actionName !== "report") await load({ ids: [message.id] });
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to update message."); }
  }

  const canModerate = account.accountType !== "normal" || conversation.role === "owner" || conversation.role === "admin";
  const visibleMessages = showPinned ? messages.filter((message) => message.pinned) : messages;
  const openUsername = (username: string) => {
    const target = [...conversation.members.map((member) => member.profile), ...messages.flatMap((message) => message.sender ? [message.sender] : [])].find((profile) => profile.username === username);
    if (target) onProfile(target);
    else void apiRequest<{ profile: SocialProfile }>(`/api/social/profile?username=${encodeURIComponent(username)}`).then((data) => onProfile(data.profile)).catch(() => setNotice(`@${username}'s profile is unavailable.`));
  };
  return <section className={`chat-panel ${dragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void chooseFiles(event.dataTransfer.files); }}>
    {dragging && <div className="drop-target"><ImagePlus size={28} /><strong>Drop files to upload</strong><span>Images, video, audio, PDF, text, or ZIP up to 25 MB</span></div>}
    <header className="chat-header"><div className={`conversation-icon ${conversation.kind}`}><ConversationAvatar conversation={conversation} /></div><div><h2>{conversation.name}</h2><p>{conversation.kind === "world" ? "Everyone on SynthNet" : `${conversation.members.length} member${conversation.members.length === 1 ? "" : "s"}`}{conversation.description ? ` · ${conversation.description}` : ""}</p></div><div><button className={searchOpen ? "active" : ""} onClick={() => setSearchOpen((open) => !open)} aria-label="Search messages"><Search size={16} /></button><button className={showPinned ? "active" : ""} aria-label="Pinned messages" onClick={() => setShowPinned((shown) => !shown)}><Pin size={16} /></button></div></header>
    {searchOpen && <form className="message-search" onSubmit={(event) => { event.preventDefault(); setLoading(true); load({ search: query }).catch((error) => setNotice(error.message)).finally(() => setLoading(false)); }}><Search size={14} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this conversation" /><button type="submit">SEARCH</button><button type="button" onClick={() => { setQuery(""); setSearchOpen(false); void load(); }}><X size={14} /></button></form>}
    <div className="message-timeline" ref={timelineRef} onClick={() => setContextMenu(null)} onScroll={(event) => { const element = event.currentTarget; shouldStickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120; }}>
      {hasMore && <button className="older-messages" disabled={loadingMore} onClick={() => { const first = messages[0]; const timeline = timelineRef.current; if (!first || !timeline) return; const previousHeight = timeline.scrollHeight; setLoadingMore(true); load({ before: first.createdAt, search: query || undefined, append: true }).then(() => requestAnimationFrame(() => { if (timelineRef.current) timelineRef.current.scrollTop += timelineRef.current.scrollHeight - previousHeight; })).catch((error) => setNotice(error instanceof Error ? error.message : "Unable to load earlier messages.")).finally(() => setLoadingMore(false)); }}>{loadingMore ? <LoaderCircle className="spin" size={13} /> : <Archive size={13} />} LOAD EARLIER MESSAGES</button>}
      {loading ? <div className="social-loading"><LoaderCircle className="spin" size={18} /> Loading messages…</div> : !visibleMessages.length ? <EmptyPanel icon={showPinned ? Pin : conversation.kind === "world" ? Globe2 : MessageCircle} title={showPinned ? "No pinned messages" : query ? "No matching messages" : `Welcome to ${conversation.name}`} copy={showPinned ? "Pinned messages will be collected here." : query ? "Try different search terms." : conversation.kind === "world" ? "Start a conversation with the entire SynthNet community." : "Send the first message and make this space yours."} /> : visibleMessages.map((message) => <MessageRow key={message.id} message={message} selfId={account.id} pending={pendingMessageIds.includes(message.id)} onProfile={onProfile} onUsername={openUsername} onReply={setReply} onAction={action} onContext={setContextMenu} />)}
    </div>
    <div className="typing-state">{typing.length > 0 && <span><i /><strong>{typing.map((profile) => profile.displayName).join(", ")}</strong> {typing.length === 1 ? "is" : "are"} typing…</span>}</div>
    {notice && <p className="social-error composer-error" role="status">{notice}<button onClick={() => setNotice("")}><X size={12} /></button></p>}
    {reply && <div className="composer-reply"><Reply size={13} /><span>Replying to <strong>@{reply.sender?.username}</strong>: {reply.content.slice(0, 100)}</span><button onClick={() => setReply(null)}><X size={13} /></button></div>}
    {!!uploads.length && <div className="pending-uploads">{uploads.map((upload) => <span key={upload.id}><Paperclip size={12} />{upload.name}<button onClick={() => setUploads((current) => current.filter((item) => item.id !== upload.id))}><X size={11} /></button></span>)}</div>}
    {gifOpen && <form className="gif-input" onSubmit={(event) => { event.preventDefault(); if (/^https?:\/\//.test(gifUrl)) void send("gif", gifUrl, []); }}><Gift size={14} /><input autoFocus type="url" value={gifUrl} onChange={(event) => setGifUrl(event.target.value)} placeholder="Paste a direct GIF URL" /><button type="submit">SEND GIF</button></form>}
    <div className="message-composer">
      <input ref={fileRef} type="file" multiple hidden accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/webm,audio/ogg,audio/mpeg,application/pdf,text/plain,application/zip" onChange={(event) => event.target.files && void chooseFiles(event.target.files)} />
      <button onClick={() => fileRef.current?.click()} title="Attach files"><Paperclip size={18} /></button>
      <div><textarea rows={1} value={content} maxLength={8000} onChange={(event) => signalTyping(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} placeholder={`Message ${conversation.kind === "world" ? "World Chat" : conversation.name}`} aria-label="Message" /><span>Markdown · Shift+Enter for a new line</span></div>
      <button className={recording ? "recording" : ""} onClick={() => void toggleRecording()} title={recording ? "Stop recording" : "Record voice note"}><Mic size={18} /></button>
      <button onClick={() => setGifOpen((open) => !open)} title="Send GIF"><Gift size={18} /></button>
      <button onClick={() => setEmojiOpen((open) => !open)} title="Emoji"><Smile size={18} /></button>
      <button className="send-message" disabled={sending || (!content.trim() && !uploads.length)} onClick={() => void send()} aria-label="Send message">{sending ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}</button>
      {emojiOpen && <div className="emoji-picker">{EMOJIS.map((emoji) => <button key={emoji} onClick={() => { setContent((current) => `${current}${emoji}`); setEmojiOpen(false); }}>{emoji}</button>)}</div>}
    </div>
    {contextMenu && <MessageContextMenu menu={contextMenu} selfId={account.id} canModerate={canModerate} onClose={() => setContextMenu(null)} onReply={setReply} onAction={action} />}
  </section>;
}

function PeoplePanel({ social, onProfile, onAction }: { social: SocialBootstrap; onProfile: (profile: SocialProfile) => void; onAction: (action: string, profile: SocialProfile) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "online" | "suggested">("all");
  const people = social.people.filter((profile) => `${profile.displayName} ${profile.username} ${profile.bio}`.toLowerCase().includes(query.toLowerCase()) && (filter !== "online" || profile.presence !== "offline") && (filter !== "suggested" || !profile.friendship));
  return <section className="directory-panel"><header className="directory-heading"><div><small>PEOPLE DIRECTORY</small><h1>Find your people.</h1><p>Discover teammates, friends, and collaborators across SynthNet.</p></div><Users size={28} /></header><div className="directory-toolbar"><label className="social-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people by name or username" /></label><div className="segmented"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>ALL</button><button className={filter === "online" ? "active" : ""} onClick={() => setFilter("online")}>ONLINE</button><button className={filter === "suggested" ? "active" : ""} onClick={() => setFilter("suggested")}>SUGGESTED</button></div></div><div className="people-grid">{people.map((profile) => <article key={profile.id}><button className="person-main" onClick={() => onProfile(profile)}><Avatar profile={profile} size="large" /><span><strong>{profile.displayName}</strong><small>@{profile.username}</small><p>{profile.bio || profile.statusText || "SynthNet member"}</p></span></button><footer><span><PresenceDot state={profile.presence} />{profile.presence}</span>{profile.friendship === "accepted" ? <button onClick={() => onProfile(profile)}><MessageCircle size={13} /> VIEW</button> : <button onClick={() => void onAction("request", profile)} disabled={profile.friendship === "pending"}><UserPlus size={13} />{profile.friendship === "pending" ? "PENDING" : "ADD"}</button>}</footer></article>)}</div>{!people.length && <EmptyPanel icon={Search} title="No people found" copy="Try a broader search or another filter." />}</section>;
}

function FriendsPanel({ friends, onProfile, onAction }: { friends: FriendRecord[]; onProfile: (profile: SocialProfile) => void; onAction: (action: string, profile: SocialProfile, friendshipId: string) => Promise<void> }) {
  const [tab, setTab] = useState<"friends" | "online" | "requests">("friends");
  const visible = friends.filter((friend) => tab === "requests" ? friend.state === "pending" : friend.state === "accepted" && (tab !== "online" || friend.profile.presence !== "offline"));
  return <section className="directory-panel"><header className="directory-heading"><div><small>YOUR NETWORK</small><h1>Friends.</h1><p>Stay close to the people you collaborate with most.</p></div><UserPlus size={28} /></header><div className="friend-tabs"><button className={tab === "friends" ? "active" : ""} onClick={() => setTab("friends")}>ALL FRIENDS <span>{friends.filter((friend) => friend.state === "accepted").length}</span></button><button className={tab === "online" ? "active" : ""} onClick={() => setTab("online")}>ONLINE <span>{friends.filter((friend) => friend.state === "accepted" && friend.profile.presence !== "offline").length}</span></button><button className={tab === "requests" ? "active" : ""} onClick={() => setTab("requests")}>REQUESTS <span>{friends.filter((friend) => friend.state === "pending" && friend.direction === "incoming").length}</span></button></div><div className="friend-list">{visible.map((friend) => <article key={friend.id}><button onClick={() => onProfile(friend.profile)}><Avatar profile={friend.profile} size="medium" /><span><strong>{friend.profile.displayName}</strong><small>@{friend.profile.username} · {friend.profile.presence}</small></span></button><div>{friend.state === "pending" && friend.direction === "incoming" ? <><button className="accept" onClick={() => void onAction("accept", friend.profile, friend.id)}><Check size={14} /> ACCEPT</button><button onClick={() => void onAction("decline", friend.profile, friend.id)}><X size={14} /> DECLINE</button></> : friend.state === "pending" ? <span>REQUEST SENT</span> : <><button onClick={() => onProfile(friend.profile)}><MessageCircle size={14} /> PROFILE</button><button onClick={() => void onAction("remove", friend.profile, friend.id)}><UserMinus size={14} /> REMOVE</button></>}</div></article>)}</div>{!visible.length && <EmptyPanel icon={tab === "requests" ? Bell : Users} title={tab === "requests" ? "No pending requests" : tab === "online" ? "Everyone is offline" : "Your friends list is empty"} copy={tab === "requests" ? "New requests will appear here." : "Browse People to grow your network."} />}</section>;
}

function NotificationsPanel({ notifications, onRead, onOpen, onInvite }: { notifications: SocialNotification[]; onRead: (id?: string) => Promise<void>; onOpen: (notification: SocialNotification) => void; onInvite: (notification: SocialNotification, accept: boolean) => Promise<void> }) {
  const [filter, setFilter] = useState<"all" | "unread" | "mentions">("all");
  const items = notifications.filter((notification) => filter === "unread" ? !notification.readAt : filter === "mentions" ? ["mention", "reply"].includes(notification.kind) : true);
  return <section className="directory-panel notification-center"><header className="directory-heading"><div><small>INBOX</small><h1>Notifications.</h1><p>Everything that needs your attention, in one focused place.</p></div><BellRing size={28} /></header><div className="notification-toolbar"><div className="segmented"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>ALL</button><button className={filter === "unread" ? "active" : ""} onClick={() => setFilter("unread")}>UNREAD</button><button className={filter === "mentions" ? "active" : ""} onClick={() => setFilter("mentions")}>MENTIONS</button></div><button onClick={() => void onRead()}><CheckCheck size={14} /> MARK ALL READ</button></div><div className="notification-list">{items.map((notification) => <article key={notification.id} className={!notification.readAt ? "unread" : ""}><button className="notification-main" onClick={() => { onOpen(notification); void onRead(notification.id); }}>{notification.actor ? <Avatar profile={notification.actor} size="medium" /> : <span className="notification-system"><Bell size={17} /></span>}<span><strong>{notification.title}</strong><p>{notification.body}</p><small>{relativeTime(notification.createdAt)} · {notification.kind.replaceAll("_", " ")}</small></span>{!notification.readAt && <i />}</button>{notification.kind === "group_invite" && notification.inviteId && <div className="notification-actions"><button onClick={() => void onInvite(notification, false)}>DECLINE</button><button className="accept" onClick={() => void onInvite(notification, true)}>ACCEPT</button></div>}</article>)}</div>{!items.length && <EmptyPanel icon={Bell} title="You're all caught up" copy="New requests, mentions, replies, and reactions will appear here." />}</section>;
}

function ModerationDrawer({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<{ reports: Array<{ id: string; reason: string; details: string; created_at: string; reporter: SocialProfile | null; reported: SocialProfile | null }>; settings: { slow_mode_seconds: number; profanity_filter: boolean; links_allowed: boolean } } | null>(null);
  const [notice, setNotice] = useState("");
  const load = useCallback(() => apiRequest<{ moderation: typeof data }>("/api/social/moderation").then((response) => setData(response.moderation)), []);
  useEffect(() => { load().catch((error) => setNotice(error.message)); }, [load]);
  async function patch(payload: Record<string, unknown>) { try { await apiRequest("/api/social/moderation", { method: "PATCH", body: JSON.stringify(payload) }); await load(); } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to update moderation."); } }
  return <div className="social-overlay drawer-overlay" onMouseDown={onClose}><aside className="moderation-drawer" role="dialog" aria-modal="true" aria-label="World chat moderation" onMouseDown={(event) => event.stopPropagation()}><header><div><small>TRUST & SAFETY</small><h2>World moderation</h2></div><button onClick={onClose}><X size={18} /></button></header>{notice && <p className="social-error">{notice}</p>}{!data ? <div className="social-loading"><LoaderCircle className="spin" size={18} /> Loading moderation queue…</div> : <><section><h3>Channel controls</h3><label>SLOW MODE ({data.settings.slow_mode_seconds}s)<input type="range" min="0" max="60" value={data.settings.slow_mode_seconds} onChange={(event) => setData((current) => current && ({ ...current, settings: { ...current.settings, slow_mode_seconds: Number(event.target.value) } }))} /></label><label className="check-field"><input type="checkbox" checked={data.settings.profanity_filter} onChange={(event) => setData((current) => current && ({ ...current, settings: { ...current.settings, profanity_filter: event.target.checked } }))} /> Profanity filtering</label><label className="check-field"><input type="checkbox" checked={data.settings.links_allowed} onChange={(event) => setData((current) => current && ({ ...current, settings: { ...current.settings, links_allowed: event.target.checked } }))} /> Allow links</label><button className="primary-button" onClick={() => void patch({ action: "settings", slowModeSeconds: data.settings.slow_mode_seconds, profanityFilter: data.settings.profanity_filter, linksAllowed: data.settings.links_allowed })}>SAVE CONTROLS</button></section><section><h3>Open reports <span>{data.reports.length}</span></h3><div className="report-list">{data.reports.map((report) => <article key={report.id}><div><Flag size={14} /><span><strong>{report.reason.toUpperCase()}</strong><small>{report.reporter ? `@${report.reporter.username}` : "Unknown reporter"} · {relativeTime(report.created_at)}</small></span></div><p>{report.details || `Reported account: @${report.reported?.username ?? "unknown"}`}</p><footer><button onClick={() => void patch({ action: "dismiss", reportId: report.id })}>DISMISS</button><button className="primary-button" onClick={() => void patch({ action: "resolve", reportId: report.id })}>RESOLVE</button></footer></article>)}</div>{!data.reports.length && <p className="moderation-empty">No open reports.</p>}</section></>}</aside></div>;
}

export function SocialWorkspace({ mode, account, onNavigate }: { mode: SocialMode; account: SessionAccount; onNavigate: (mode: SocialMode) => void }) {
  const [social, setSocial] = useState<SocialBootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [newChat, setNewChat] = useState(false);
  const [moderation, setModeration] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundMessageRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const modeRef = useRef(mode);
  const loadRequestId = useRef(0);
  modeRef.current = mode;
  selectedIdRef.current = selectedId;

  const load = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    const data = await apiRequest<{ social: SocialBootstrap }>("/api/social/bootstrap");
    if (requestId !== loadRequestId.current) return;
    setSocial(data.social);
    setSelectedId((current) => current && data.social.conversations.some((conversation) => conversation.id === current)
      ? current
      : modeRef.current === "world"
        ? data.social.worldConversationId
        : data.social.conversations.find((conversation) => conversation.kind !== "world")?.id ?? data.social.worldConversationId);
  }, []);

  useEffect(() => { setLoading(true); load().catch((error) => setNotice(error.message)).finally(() => setLoading(false)); }, [load]);
  useEffect(() => {
    if (!social) return;
    if (mode === "world") setSelectedId(social.worldConversationId);
    if (mode === "chats") setSelectedId((current) => social.conversations.some((conversation) => conversation.id === current && conversation.kind !== "world")
      ? current
      : social.conversations.find((conversation) => conversation.kind !== "world")?.id ?? social.worldConversationId);
  }, [mode, social]);

  useEffect(() => {
    const events = new EventSource("/api/social/events");
    const refresh = (event: MessageEvent) => {
      let payload: SocialEventDetail = {};
      try { payload = JSON.parse(event.data); } catch { /* ignore malformed event */ }
      if (payload.conversationId) window.dispatchEvent(new CustomEvent(`social:${payload.scope}:${payload.conversationId}`, { detail: payload }));
      if (payload.scope === "typing" || (payload.scope === "messages" && payload.conversationId === selectedIdRef.current)) return;
      if (payload.scope === "messages") {
        if (backgroundMessageRefreshTimer.current) return;
        backgroundMessageRefreshTimer.current = setTimeout(() => {
          backgroundMessageRefreshTimer.current = null;
          void load().catch(() => undefined);
        }, 5_000);
        return;
      }
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => void load().catch(() => undefined), 250);
    };
    const ready = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as { connected?: boolean };
        if (payload.connected) setNotice((current) => current.startsWith("Realtime is reconnecting") ? "" : current);
      } catch { /* ignore malformed event */ }
    };
    events.addEventListener("refresh", refresh as EventListener);
    events.addEventListener("ready", ready);
    events.onerror = () => setNotice((current) => current || "Realtime is reconnecting; background refresh remains active.");
    const fallback = setInterval(() => { if (!document.hidden) void load().catch(() => undefined); }, 60_000);
    return () => {
      events.close();
      clearInterval(fallback);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (backgroundMessageRefreshTimer.current) clearTimeout(backgroundMessageRefreshTimer.current);
    };
  }, [load]);

  const onConversationActivity = useCallback((message: ChatMessage) => {
    setSocial((current) => {
      if (!current) return current;
      let changed = false;
      const conversations = current.conversations.map((conversation) => {
        if (conversation.id !== message.conversationId) return conversation;
        const currentTime = conversation.latestMessage ? Date.parse(conversation.latestMessage.createdAt) : 0;
        if (Date.parse(message.createdAt) < currentTime) return conversation;
        changed = true;
        return {
          ...conversation,
          latestMessage: { id: message.id, content: message.deletedAt ? "Message deleted" : messagePreview(message), createdAt: message.createdAt, kind: message.kind },
          unreadCount: 0,
          updatedAt: message.createdAt,
        };
      });
      return changed ? { ...current, conversations } : current;
    });
  }, []);

  const openProfile = useCallback((candidate: SocialProfile) => {
    setProfile(candidate);
    void apiRequest<{ profile: SocialProfile }>(`/api/social/profile?username=${encodeURIComponent(candidate.username)}`)
      .then((data) => setProfile((current) => current?.username === candidate.username ? data.profile : current))
      .catch(() => setNotice(`@${candidate.username}'s profile is unavailable.`));
  }, []);

  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout>;
    let away = false;
    const update = (state: "online" | "away") => void apiRequest("/api/social/presence", { method: "PATCH", body: JSON.stringify({ state }) }).catch(() => undefined);
    const schedule = () => {
      clearTimeout(idleTimer);
      if (away) { away = false; update("online"); }
      idleTimer = setTimeout(() => { away = true; update("away"); }, 5 * 60 * 1000);
    };
    const visibility = () => {
      clearTimeout(idleTimer);
      if (document.hidden) { away = true; update("away"); }
      else schedule();
    };
    for (const event of ["pointerdown", "keydown"] as const) window.addEventListener(event, schedule, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    schedule();
    return () => {
      clearTimeout(idleTimer);
      for (const event of ["pointerdown", "keydown"] as const) window.removeEventListener(event, schedule);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  async function create(input: { kind: "direct"; username: string } | { kind: "group"; name: string; usernames: string[] }) {
    const data = await apiRequest<{ conversationId: string }>("/api/social/conversations", { method: "POST", body: JSON.stringify(input) });
    await load(); setSelectedId(data.conversationId); onNavigate("chats");
  }

  async function friendAction(actionName: string, target: SocialProfile, friendshipId?: string) {
    if (actionName === "report") {
      const details = window.prompt("Describe why you are reporting this profile")?.trim();
      if (!details) return;
      await apiRequest("/api/social/profile", { method: "POST", body: JSON.stringify({ username: target.username, details }) });
      setNotice("Profile report submitted for moderator review.");
      return;
    }
    const payload = ["request", "block", "unblock"].includes(actionName) ? { action: actionName, username: target.username } : { action: actionName, friendshipId: friendshipId ?? target.friendshipId };
    await apiRequest("/api/social/friends", { method: "POST", body: JSON.stringify(payload) });
    await load();
  }

  async function startMessage(target: SocialProfile) {
    const data = await apiRequest<{ conversationId: string }>("/api/social/conversations", { method: "POST", body: JSON.stringify({ kind: "direct", username: target.username }) });
    await load(); setSelectedId(data.conversationId); setProfile(null); onNavigate("chats");
  }

  function openNotification(notification: SocialNotification) {
    if (notification.conversationId) { setSelectedId(notification.conversationId); onNavigate("chats"); }
    else if (notification.actor) openProfile(notification.actor);
  }

  const selected = social?.conversations.find((conversation) => conversation.id === selectedId) ?? null;
  const communicationsMode = mode === "chats" || mode === "world";
  if (loading) return <div className="social-loading full"><LoaderCircle className="spin" size={22} /> Loading your network…</div>;
  if (!social) return <EmptyPanel icon={Users} title="Social workspace unavailable" copy={notice || "Check the Supabase migration and try again."} action={<button className="primary-button" onClick={() => { setLoading(true); load().finally(() => setLoading(false)); }}>TRY AGAIN</button>} />;

  return <div className={`social-workspace ${communicationsMode ? "communications" : "directory"}`}>
    {notice && <div className="social-toast" role="status">{notice}<button onClick={() => setNotice("")}><X size={12} /></button></div>}
    {communicationsMode ? <><ConversationRail social={social} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); onNavigate(id === social.worldConversationId ? "world" : "chats"); }} onCreate={() => setNewChat(true)} />{selected ? <ChatPanel key={selected.id} conversation={selected} account={account} self={social.self} knownProfiles={social.people} onProfile={openProfile} onConversationActivity={onConversationActivity} /> : <EmptyPanel icon={MessageCircle} title="Choose a conversation" copy="Select a chat from the sidebar or start a new one." />}<aside className="chat-details"><div className={`conversation-hero ${selected?.kind}`}><span><ConversationAvatar conversation={selected!} /></span><h3>{selected?.name}</h3><p>{selected?.description || (selected?.kind === "direct" ? "Direct conversation" : "SynthNet group")}</p></div>{selected?.kind === "world" && account.accountType !== "normal" && <button className="moderation-button" onClick={() => setModeration(true)}><Shield size={14} /> MODERATION PANEL</button>}<section><small>MEMBERS · {selected?.kind === "world" ? social.people.length + 1 : selected?.members.length}</small><div className="member-list">{(selected?.kind === "world" ? [social.self, ...social.people] : selected?.members.map((member) => member.profile) ?? []).slice(0, 20).map((member) => <button key={member.id} onClick={() => openProfile(member)}><Avatar profile={member} size="small" /><span><strong>{member.displayName}</strong><small>@{member.username}</small></span></button>)}</div></section>{selected?.kind === "group" && <section className="group-quick"><small>{selected.role === "member" ? "GROUP MEMBERSHIP" : "GROUP ADMINISTRATION"}</small>{selected.role !== "member" && <><button onClick={async () => { const username = window.prompt("Invite by username")?.trim().toLowerCase(); if (!username) return; try { await apiRequest("/api/social/conversations", { method: "PATCH", body: JSON.stringify({ action: "invite", conversationId: selected.id, username }) }); setNotice("Group invitation sent."); } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to invite user."); } }}><UserPlus size={13} /> INVITE MEMBER</button><button onClick={async () => { const name = window.prompt("Group name", selected.name)?.trim(); if (!name) return; const description = window.prompt("Group description", selected.description) ?? selected.description; await apiRequest("/api/social/conversations", { method: "PATCH", body: JSON.stringify({ action: "edit", conversationId: selected.id, name, description }) }); await load(); }}><Edit3 size={13} /> EDIT GROUP</button></>}{selected.role === "owner" && <button onClick={async () => { const username = window.prompt("Member username to promote or demote")?.trim().toLowerCase(); const member = selected.members.find((item) => item.profile.username === username); if (!member || member.profile.id === account.id) { setNotice("Choose another current group member."); return; } const role = member.role === "admin" ? "member" : "admin"; await apiRequest("/api/social/conversations", { method: "PATCH", body: JSON.stringify({ action: "role", conversationId: selected.id, accountId: member.profile.id, role }) }); await load(); }}><Shield size={13} /> MANAGE ROLE</button>}<button onClick={async () => { if (!window.confirm("Leave this group?")) return; await apiRequest("/api/social/conversations", { method: "PATCH", body: JSON.stringify({ action: "leave", conversationId: selected.id }) }); setSelectedId(null); await load(); }}><UserMinus size={13} /> LEAVE GROUP</button>{selected.role === "owner" && <button className="danger" onClick={async () => { if (!window.confirm("Delete this group and all of its messages?")) return; await apiRequest("/api/social/conversations", { method: "PATCH", body: JSON.stringify({ action: "delete", conversationId: selected.id }) }); setSelectedId(null); await load(); }}><Trash2 size={13} /> DELETE GROUP</button>}</section>}</aside></> : mode === "people" ? <PeoplePanel social={social} onProfile={openProfile} onAction={(actionName, target) => friendAction(actionName, target)} /> : mode === "friends" ? <FriendsPanel friends={social.friends} onProfile={openProfile} onAction={(actionName, target, friendshipId) => friendAction(actionName, target, friendshipId)} /> : <NotificationsPanel notifications={social.notifications} onRead={async (id) => { await apiRequest("/api/social/notifications", { method: "PATCH", body: JSON.stringify(id ? { notificationId: id } : {}) }); await load(); }} onOpen={openNotification} onInvite={async (notification, accept) => { if (!notification.inviteId || !notification.conversationId) return; await apiRequest("/api/social/conversations", { method: "PATCH", body: JSON.stringify({ action: "invite_response", conversationId: notification.conversationId, inviteId: notification.inviteId, accept }) }); await apiRequest("/api/social/notifications", { method: "PATCH", body: JSON.stringify({ notificationId: notification.id }) }); await load(); if (accept) { setSelectedId(notification.conversationId); onNavigate("chats"); } }} />}
    {profile && <ProfileDialog profile={profile} selfId={account.id} onClose={() => setProfile(null)} onAction={(actionName, target) => friendAction(actionName, target)} onMessage={startMessage} />}
    {newChat && <NewConversationDialog people={social.people} onClose={() => setNewChat(false)} onCreate={create} />}
    {moderation && <ModerationDrawer onClose={() => setModeration(false)} />}
  </div>;
}

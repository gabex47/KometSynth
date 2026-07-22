import { getCurrentSessionContext } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { setPresence, touchPresence } from "@/lib/server/social";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const context = await getCurrentSessionContext();
  if (!context) return apiError("Authentication required.", 401);
  const database = getSupabaseAdmin();
  const [{ data: memberships }, { data: world }] = await Promise.all([
    database.from("conversation_members").select("conversation_id").eq("account_id", context.account.id),
    database.from("conversations").select("id").eq("kind", "world").is("deleted_at", null).maybeSingle(),
  ]);
  const conversations = new Set([...(memberships ?? []).map((item) => item.conversation_id), ...(world ? [world.id] : [])]);
  const encoder = new TextEncoder();
  let closed = false;
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  let channel: ReturnType<typeof database.channel> | null = null;
  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (keepAlive) clearInterval(keepAlive);
    keepAlive = null;
    if (channel) void database.removeChannel(channel);
    channel = null;
    void touchPresence(context);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: string, data: Record<string, unknown> = {}) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); }
        catch { closed = true; cleanup(); }
      };

      channel = database.channel(`social:${context.account.id}:${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
          const record = (payload.new && Object.keys(payload.new).length ? payload.new : payload.old) as Record<string, unknown>;
          if (typeof record.conversation_id === "string" && conversations.has(record.conversation_id)) {
            emit("refresh", {
              scope: "messages",
              conversationId: record.conversation_id,
              messageId: record.id,
              eventType: payload.eventType,
              message: payload.eventType === "DELETE" ? undefined : {
                id: record.id,
                senderId: record.sender_id,
                kind: record.kind,
                content: record.content,
                replyToId: record.reply_to_id,
                createdAt: record.created_at,
                editedAt: record.edited_at,
                deletedAt: record.deleted_at,
              },
            });
          }
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, async (payload) => {
          const record = (payload.new && Object.keys(payload.new).length ? payload.new : payload.old) as Record<string, unknown>;
          if (typeof record.message_id !== "string") return;
          const { data: message } = await database.from("messages").select("conversation_id").eq("id", record.message_id).maybeSingle();
          if (message && conversations.has(message.conversation_id)) emit("refresh", { scope: "messages", conversationId: message.conversation_id, messageId: record.message_id, eventType: payload.eventType });
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "message_receipts" }, async (payload) => {
          const record = (payload.new && Object.keys(payload.new).length ? payload.new : payload.old) as Record<string, unknown>;
          if (typeof record.message_id !== "string") return;
          const { data: message } = await database.from("messages").select("conversation_id").eq("id", record.message_id).maybeSingle();
          if (message && conversations.has(message.conversation_id)) emit("refresh", { scope: "messages", conversationId: message.conversation_id, messageId: record.message_id, eventType: payload.eventType });
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `account_id=eq.${context.account.id}` }, () => emit("refresh", { scope: "notifications" }))
        .on("postgres_changes", { event: "*", schema: "public", table: "typing_indicators" }, (payload) => {
          const record = (payload.new && Object.keys(payload.new).length ? payload.new : payload.old) as Record<string, unknown>;
          if (typeof record.conversation_id === "string" && conversations.has(record.conversation_id)) emit("refresh", { scope: "typing", conversationId: record.conversation_id });
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "conversation_members", filter: `account_id=eq.${context.account.id}` }, (payload) => {
          const record = (payload.new && Object.keys(payload.new).length ? payload.new : payload.old) as Record<string, unknown>;
          if (payload.eventType === "DELETE" && typeof record.conversation_id === "string") conversations.delete(record.conversation_id);
          if (payload.eventType !== "DELETE" && typeof record.conversation_id === "string") conversations.add(record.conversation_id);
          emit("refresh", { scope: "conversations" });
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") emit("ready", { connected: true });
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") emit("status", { connected: false });
        });

      void setPresence(context, "online");
      emit("ready", { connected: false });
      keepAlive = setInterval(() => {
        emit("ping", { at: Date.now() });
        void touchPresence(context);
      }, 25_000);

      const close = () => {
        if (!closed) {
          closed = true;
          try { controller.close(); } catch { /* already closed by the client */ }
        }
        cleanup();
      };
      request.signal.addEventListener("abort", close, { once: true });
    },
    cancel() {
      closed = true;
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

import { z } from "zod";
import { getCurrentSessionContext } from "@/lib/server/auth";
import { apiError, apiOk, isSameOrigin, readJsonBody } from "@/lib/server/http";
import { getConversationMessages, getConversationTyping, sendMessage, updateMessage } from "@/lib/server/social";
import { socialApiError } from "@/lib/server/social-http";

const sendSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().max(8_000),
  kind: z.enum(["text", "image", "video", "document", "voice", "gif"]).default("text"),
  replyToId: z.string().uuid().nullable().optional(),
  attachmentIds: z.array(z.string().uuid()).max(10).optional(),
}).strict().refine((input) => input.content.trim().length > 0 || (input.attachmentIds?.length ?? 0) > 0, "Enter a message or attach a file.");

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("edit"), conversationId: z.string().uuid(), messageId: z.string().uuid(), content: z.string().trim().min(1).max(8_000) }).strict(),
  z.object({ action: z.literal("delete"), conversationId: z.string().uuid(), messageId: z.string().uuid(), reason: z.string().trim().max(1_000).optional() }).strict(),
  z.object({ action: z.literal("react"), conversationId: z.string().uuid(), messageId: z.string().uuid(), emoji: z.string().trim().min(1).max(24) }).strict(),
  z.object({ action: z.literal("pin"), conversationId: z.string().uuid(), messageId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("read"), conversationId: z.string().uuid(), messageId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("report"), conversationId: z.string().uuid(), messageId: z.string().uuid(), reason: z.enum(["spam", "harassment", "hate", "sexual", "violence", "impersonation", "other"]), details: z.string().trim().max(1_000).optional() }).strict(),
  z.object({ action: z.literal("typing"), conversationId: z.string().uuid(), active: z.boolean().default(true) }).strict(),
]);

export async function GET(request: Request) {
  const context = await getCurrentSessionContext();
  if (!context) return apiError("Authentication required.", 401);
  try {
    const parameters = new URL(request.url).searchParams;
    const conversationId = z.string().uuid().parse(parameters.get("conversationId"));
    if (parameters.get("typingOnly") === "true") {
      return apiOk({ messages: [], hasMore: false, typing: await getConversationTyping(context, conversationId) });
    }
    const before = z.string().datetime({ offset: true }).optional().parse(parameters.get("before") ?? undefined);
    const query = parameters.get("q")?.slice(0, 100) ?? undefined;
    const messageIds = z.array(z.string().uuid()).max(20).parse(parameters.getAll("id"));
    return apiOk(await getConversationMessages(context, conversationId, { before, query, messageIds, includeTyping: messageIds.length === 0 }));
  } catch (error) {
    return socialApiError(error, "Unable to load messages.");
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const context = await getCurrentSessionContext();
  if (!context) return apiError("Authentication required.", 401);
  try {
    const input = sendSchema.parse(await readJsonBody(request, 20_000));
    return apiOk({ messageId: await sendMessage(context, input) }, 201);
  } catch (error) {
    return socialApiError(error, "Unable to send the message.");
  }
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const context = await getCurrentSessionContext();
  if (!context) return apiError("Authentication required.", 401);
  try {
    const input = actionSchema.parse(await readJsonBody(request, 12_000));
    await updateMessage(context, input);
    return apiOk({ updated: true });
  } catch (error) {
    return socialApiError(error, "Unable to update the message.");
  }
}

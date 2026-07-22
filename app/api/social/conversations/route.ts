import { z } from "zod";
import { getCurrentSessionContext } from "@/lib/server/auth";
import { apiError, apiOk, isSameOrigin, readJsonBody } from "@/lib/server/http";
import { createConversation, updateConversation } from "@/lib/server/social";
import { socialApiError } from "@/lib/server/social-http";

const createSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("direct"), username: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{3,32}$/) }).strict(),
  z.object({ kind: z.literal("group"), name: z.string().trim().min(1).max(80), usernames: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{3,32}$/)).max(49).default([]) }).strict(),
]);

const updateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("edit"), conversationId: z.string().uuid(), name: z.string().trim().min(1).max(80), description: z.string().trim().max(500) }).strict(),
  z.object({ action: z.literal("invite"), conversationId: z.string().uuid(), username: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{3,32}$/) }).strict(),
  z.object({ action: z.literal("leave"), conversationId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("delete"), conversationId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("role"), conversationId: z.string().uuid(), accountId: z.string().uuid(), role: z.enum(["admin", "member"]) }).strict(),
  z.object({ action: z.literal("invite_response"), conversationId: z.string().uuid(), inviteId: z.string().uuid(), accept: z.boolean() }).strict(),
]);

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const context = await getCurrentSessionContext();
  if (!context) return apiError("Authentication required.", 401);
  try {
    const input = createSchema.parse(await readJsonBody(request, 8_192));
    return apiOk({ conversationId: await createConversation(context, input) }, 201);
  } catch (error) {
    return socialApiError(error, "Unable to create the conversation.");
  }
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const context = await getCurrentSessionContext();
  if (!context) return apiError("Authentication required.", 401);
  try {
    const input = updateSchema.parse(await readJsonBody(request, 8_192));
    await updateConversation(context, input);
    return apiOk({ updated: true });
  } catch (error) {
    return socialApiError(error, "Unable to update the conversation.");
  }
}

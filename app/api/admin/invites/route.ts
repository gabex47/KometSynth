import { z } from "zod";
import { getCurrentSessionContext, roleRank } from "@/lib/server/auth";
import { apiError, apiOk, getClientIp, isSameOrigin, rateLimitError, readJsonBody, requestBodyError } from "@/lib/server/http";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { createRegistrationInvite, listRegistrationInvites, revokeRegistrationInvite } from "@/lib/server/registration";

const createSchema = z.object({
  label: z.string().trim().max(80).default(""),
  accountType: z.enum(["normal", "admin"]),
  maxUses: z.number().int().min(1).max(100),
  expiresInDays: z.number().int().min(1).max(90),
}).strict();
const revokeSchema = z.object({ inviteId: z.string().uuid() }).strict();

async function adminContext() {
  const context = await getCurrentSessionContext();
  return context && roleRank(context.account.accountType) >= 2 ? context : null;
}

export async function GET() {
  const context = await adminContext();
  if (!context) return apiError("Administrator access required.", 403);
  try { return apiOk({ invites: await listRegistrationInvites(context) }); }
  catch { return apiError("Unable to list registration invites.", 500); }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const context = await adminContext();
  if (!context) return apiError("Administrator access required.", 403);
  try {
    const input = createSchema.parse(await readJsonBody(request, 1_024));
    if (input.accountType === "admin" && context.account.accountType !== "owner") return apiError("Only owners can invite administrators.", 403);
    const rate = await consumeRateLimit(`invites:${context.account.id}`, 20, 60 * 60 * 1000);
    if (!rate.allowed) return rateLimitError("Invite creation limit reached.", rate.retryAfter);
    const invite = await createRegistrationInvite(context, input, getClientIp(request));
    return apiOk({ invite, invites: await listRegistrationInvites(context) }, 201);
  } catch (error) {
    const bodyError = requestBodyError(error);
    if (bodyError) return bodyError;
    if (error instanceof z.ZodError) return apiError("Enter valid invite settings.", 422);
    return apiError("Unable to create registration invite.", 500);
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const context = await adminContext();
  if (!context) return apiError("Administrator access required.", 403);
  try {
    const input = revokeSchema.parse(await readJsonBody(request, 512));
    await revokeRegistrationInvite(context, input.inviteId, getClientIp(request));
    return apiOk({ revoked: true, invites: await listRegistrationInvites(context) });
  } catch (error) {
    const bodyError = requestBodyError(error);
    if (bodyError) return bodyError;
    if (error instanceof z.ZodError) return apiError("Invalid invite.", 422);
    return apiError("Unable to revoke registration invite.", 500);
  }
}

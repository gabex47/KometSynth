import { z } from "zod";
import { getCurrentSessionContext } from "@/lib/server/auth";
import { apiError, apiOk, getClientIp, isSameOrigin, rateLimitError, readJsonBody, requestBodyError } from "@/lib/server/http";
import { listOwnSessions, revokeOtherSessions, revokeOwnSession } from "@/lib/server/profile";
import { consumeRateLimit } from "@/lib/server/rate-limit";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("revoke"), sessionId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("revoke_others") }).strict(),
]);

export async function GET() {
  const context = await getCurrentSessionContext();
  if (!context) return apiError("Authentication required.", 401);
  try { return apiOk({ sessions: await listOwnSessions(context) }); }
  catch { return apiError("Unable to load sessions.", 500); }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const context = await getCurrentSessionContext();
  if (!context) return apiError("Authentication required.", 401);
  try {
    const input = schema.parse(await readJsonBody(request, 512));
    const rate = await consumeRateLimit(`sessions:${context.account.id}`, 20, 15 * 60 * 1000);
    if (!rate.allowed) return rateLimitError("Session action limit reached.", rate.retryAfter);
    const ip = getClientIp(request);
    const revoked = input.action === "revoke"
      ? Number(await revokeOwnSession(context, input.sessionId, ip))
      : await revokeOtherSessions(context, ip);
    return apiOk({ revoked, sessions: await listOwnSessions(context) });
  } catch (error) {
    const bodyError = requestBodyError(error);
    if (bodyError) return bodyError;
    if (error instanceof z.ZodError) return apiError("Invalid session action.", 422);
    return apiError("Unable to revoke session.", 500);
  }
}

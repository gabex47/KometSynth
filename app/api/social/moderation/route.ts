import { z } from "zod";
import { getCurrentSessionContext } from "@/lib/server/auth";
import { apiError, apiOk, isSameOrigin, readJsonBody } from "@/lib/server/http";
import { listModeration, moderate } from "@/lib/server/social";
import { socialApiError } from "@/lib/server/social-http";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["resolve", "dismiss"]), reportId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("settings"), slowModeSeconds: z.number().int().min(0).max(3600), profanityFilter: z.boolean(), linksAllowed: z.boolean() }).strict(),
  z.object({ action: z.literal("announcement"), title: z.string().trim().min(1).max(160), body: z.string().trim().max(500) }).strict(),
]);

export async function GET() {
  const context = await getCurrentSessionContext();
  if (!context) return apiError("Authentication required.", 401);
  try { return apiOk({ moderation: await listModeration(context) }); }
  catch (error) { return socialApiError(error, "Unable to load moderation."); }
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const context = await getCurrentSessionContext();
  if (!context) return apiError("Authentication required.", 401);
  try {
    await moderate(context, schema.parse(await readJsonBody(request, 4_096)));
    return apiOk({ updated: true });
  } catch (error) {
    return socialApiError(error, "Unable to update moderation.");
  }
}

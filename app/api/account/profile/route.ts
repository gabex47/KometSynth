import { z } from "zod";
import { getCurrentSessionContext } from "@/lib/server/auth";
import { apiError, apiOk, getClientIp, isSameOrigin, rateLimitError, readJsonBody, requestBodyError } from "@/lib/server/http";
import { getOwnProfile, updateOwnProfile } from "@/lib/server/profile";
import { consumeRateLimit } from "@/lib/server/rate-limit";

const schema = z.object({
  displayName: z.string().trim().max(80),
  bio: z.string().trim().max(500),
  theme: z.enum(["dark", "light", "system"]),
}).strict();

export async function GET() {
  const context = await getCurrentSessionContext();
  if (!context) return apiError("Authentication required.", 401);
  try { return apiOk({ profile: await getOwnProfile(context) }); }
  catch { return apiError("Unable to load profile.", 500); }
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const context = await getCurrentSessionContext();
  if (!context) return apiError("Authentication required.", 401);
  try {
    const input = schema.parse(await readJsonBody(request, 2_048));
    const rate = await consumeRateLimit(`profile:${context.account.id}`, 20, 15 * 60 * 1000);
    if (!rate.allowed) return rateLimitError("Profile update limit reached.", rate.retryAfter);
    await updateOwnProfile(context, input, getClientIp(request));
    return apiOk({ updated: true, profile: await getOwnProfile(context) });
  } catch (error) {
    const bodyError = requestBodyError(error);
    if (bodyError) return bodyError;
    if (error instanceof z.ZodError) return apiError("Enter a valid profile.", 422);
    return apiError("Unable to update profile.", 500);
  }
}

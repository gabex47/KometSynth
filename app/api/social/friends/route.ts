import { z } from "zod";
import { getCurrentSessionContext } from "@/lib/server/auth";
import { apiError, apiOk, isSameOrigin, readJsonBody } from "@/lib/server/http";
import { updateFriendship } from "@/lib/server/social";
import { socialApiError } from "@/lib/server/social-http";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["request", "block", "unblock"]), username: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{3,32}$/) }).strict(),
  z.object({ action: z.enum(["accept", "decline", "remove"]), friendshipId: z.string().uuid() }).strict(),
]);

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const context = await getCurrentSessionContext();
  if (!context) return apiError("Authentication required.", 401);
  try {
    await updateFriendship(context, schema.parse(await readJsonBody(request, 2_048)));
    return apiOk({ updated: true });
  } catch (error) {
    return socialApiError(error, "Unable to update the friendship.");
  }
}

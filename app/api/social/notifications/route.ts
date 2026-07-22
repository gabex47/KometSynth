import { z } from "zod";
import { getCurrentSessionContext } from "@/lib/server/auth";
import { apiError, apiOk, isSameOrigin, readJsonBody } from "@/lib/server/http";
import { updateNotifications } from "@/lib/server/social";
import { socialApiError } from "@/lib/server/social-http";

const schema = z.object({ notificationId: z.string().uuid().optional() }).strict();

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const context = await getCurrentSessionContext();
  if (!context) return apiError("Authentication required.", 401);
  try {
    const input = schema.parse(await readJsonBody(request, 1_024));
    await updateNotifications(context, input.notificationId);
    return apiOk({ updated: true });
  } catch (error) {
    return socialApiError(error, "Unable to update notifications.");
  }
}

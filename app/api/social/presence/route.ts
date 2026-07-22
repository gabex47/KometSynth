import { z } from "zod";
import { getCurrentSessionContext } from "@/lib/server/auth";
import { apiError, apiOk, isSameOrigin, readJsonBody } from "@/lib/server/http";
import { setPresence } from "@/lib/server/social";
import { socialApiError } from "@/lib/server/social-http";

const schema = z.object({ state: z.enum(["online", "away", "dnd", "offline"]) }).strict();

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const context = await getCurrentSessionContext();
  if (!context) return apiError("Authentication required.", 401);
  try {
    const input = schema.parse(await readJsonBody(request, 512));
    await setPresence(context, input.state);
    return apiOk({ updated: true });
  } catch (error) {
    return socialApiError(error, "Unable to update presence.");
  }
}

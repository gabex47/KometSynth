import { getCurrentSessionContext } from "@/lib/server/auth";
import { apiError, apiOk } from "@/lib/server/http";
import { getSocialBootstrap } from "@/lib/server/social";
import { socialApiError } from "@/lib/server/social-http";

export async function GET(request: Request) {
  const context = await getCurrentSessionContext();
  if (!context) return apiError("Authentication required.", 401);
  try {
    const query = new URL(request.url).searchParams.get("q")?.slice(0, 32) ?? "";
    return apiOk({ social: await getSocialBootstrap(context, query) });
  } catch (error) {
    return socialApiError(error, "Unable to load the social workspace.");
  }
}

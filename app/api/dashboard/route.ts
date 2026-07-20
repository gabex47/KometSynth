import { getDashboardSummary } from "@/lib/server/activity";
import { getCurrentSessionContext } from "@/lib/server/auth";
import { apiError, apiOk } from "@/lib/server/http";

export async function GET() {
  const context = await getCurrentSessionContext();
  if (!context) return apiError("Authentication required.", 401);
  try {
    return apiOk({ summary: await getDashboardSummary(context) });
  } catch {
    return apiError("Unable to load dashboard summary.", 500);
  }
}

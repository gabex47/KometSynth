import { getCurrentSession, logActivity, revokeCurrentSession } from "@/lib/server/auth";
import { apiError, apiOk, getClientIp, isSameOrigin } from "@/lib/server/http";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const account = await getCurrentSession();
  if (account) await logActivity(account.username, "logout", getClientIp(request));
  await revokeCurrentSession();
  return apiOk({ loggedOut: true });
}

import { revokeCurrentSession } from "@/lib/server/auth";
import { apiError, apiOk, getClientIp, isSameOrigin } from "@/lib/server/http";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  await revokeCurrentSession(getClientIp(request));
  return apiOk({ loggedOut: true });
}

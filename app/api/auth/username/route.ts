import { z } from "zod";
import { findAccount } from "@/lib/server/auth";
import { apiError, apiOk, getClientIp, isSameOrigin } from "@/lib/server/http";
import { consumeRateLimit } from "@/lib/server/rate-limit";

const schema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(32).regex(/^[a-z0-9_-]+$/),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const ip = getClientIp(request);
  const rate = consumeRateLimit(`username:${ip}`, 20, 15 * 60 * 1000);
  if (!rate.allowed) return apiError("Too many attempts. Try again later.", 429);

  try {
    const input = schema.parse(await request.json());
    const account = await findAccount(input.username);
    if (!account || account.disabled) return apiError("Access denied.", 403);
    return apiOk({ accepted: true });
  } catch (error) {
    if (error instanceof z.ZodError) return apiError("Enter a valid username.", 422);
    return apiError("Unable to verify access.", 500);
  }
}

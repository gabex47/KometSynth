import { z } from "zod";
import { authenticateWithPin, createSession, findAccount } from "@/lib/server/auth";
import { apiError, apiOk, getClientIp, isSameOrigin } from "@/lib/server/http";
import { clearRateLimit, consumeRateLimit } from "@/lib/server/rate-limit";

const schema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(32).regex(/^[a-z0-9_-]+$/),
  pin: z.string().regex(/^\d{4,12}$/),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const ip = getClientIp(request);

  try {
    const input = schema.parse(await request.json());
    const key = `login:${ip}:${input.username}`;
    const rate = consumeRateLimit(key, 8, 15 * 60 * 1000);
    if (!rate.allowed) return apiError("Too many attempts. Try again later.", 429);

    const account = await findAccount(input.username);
    if (!account) return apiError("Access denied.", 403);
    const result = await authenticateWithPin(account, input.pin, ip);
    if (!result.ok) {
      const message = result.reason === "locked" ? "Account temporarily locked." : "Invalid credentials.";
      return apiError(message, result.reason === "locked" ? 423 : 403);
    }

    await createSession(result.account, ip, request.headers.get("user-agent") ?? "unknown");
    clearRateLimit(key);
    return apiOk({ authenticated: true, account: result.account });
  } catch (error) {
    if (error instanceof z.ZodError) return apiError("Invalid credentials.", 422);
    console.error(error);
    return apiError("Unable to complete sign in.", 500);
  }
}

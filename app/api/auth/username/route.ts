import { z } from "zod";
import { apiError, apiOk, getClientIp, isSameOrigin, rateLimitError, readJsonBody, requestBodyError } from "@/lib/server/http";
import { consumeRateLimit } from "@/lib/server/rate-limit";

const schema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(32).regex(/^[a-z0-9_-]+$/),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const ip = getClientIp(request);

  try {
    const input = schema.parse(await readJsonBody(request, 1_024));
    const rate = await consumeRateLimit(`username:${ip}`, 20, 15 * 60 * 1000);
    if (!rate.allowed) return rateLimitError("Too many attempts. Try again later.", rate.retryAfter);

    // Account existence is intentionally not disclosed at the first step.
    void input.username;
    return apiOk({ accepted: true });
  } catch (error) {
    const bodyError = requestBodyError(error);
    if (bodyError) return bodyError;
    if (error instanceof z.ZodError) return apiError("Enter a valid username.", 422);
    return apiError("Unable to verify access.", 500);
  }
}

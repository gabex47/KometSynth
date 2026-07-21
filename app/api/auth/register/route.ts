import { z } from "zod";
import { createSession } from "@/lib/server/auth";
import { apiError, apiOk, getClientIp, isSameOrigin, rateLimitError, readJsonBody, requestBodyError } from "@/lib/server/http";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { registerAccount } from "@/lib/server/registration";

const schema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(32).regex(/^[a-z0-9_-]+$/),
  pin: z.string().regex(/^\d{6,12}$/),
  confirmPin: z.string(),
  inviteCode: z.string().trim().min(16).max(128),
}).strict().refine((value) => value.pin === value.confirmPin, {
  path: ["confirmPin"],
  message: "PINs must match.",
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const ip = getClientIp(request);
  try {
    const input = schema.parse(await readJsonBody(request, 2_048));
    const rate = await consumeRateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
    if (!rate.allowed) return rateLimitError("Too many registration attempts. Try again later.", rate.retryAfter);
    const account = await registerAccount(input, ip);
    await createSession(account, ip, request.headers.get("user-agent") ?? "unknown");
    return apiOk({ registered: true, account }, 201);
  } catch (error) {
    const bodyError = requestBodyError(error);
    if (bodyError) return bodyError;
    if (error instanceof z.ZodError) return apiError("Enter a valid username, matching 6–12 digit PINs, and invite code.", 422);
    if (error instanceof Error && error.name === "AccountConflictError") return apiError(error.message, 409);
    if (error instanceof Error && error.name === "InviteUnavailableError") return apiError(error.message, 403);
    return apiError("Unable to complete registration.", 500);
  }
}

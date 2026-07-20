import { z } from "zod";
import { getCurrentSession, getCurrentSessionContext } from "@/lib/server/auth";
import { deleteApiKey, listApiKeys, upsertApiKey } from "@/lib/server/api-keys";
import { apiError, apiOk, getClientIp, isSameOrigin, rateLimitError, readJsonBody, requestBodyError } from "@/lib/server/http";
import { consumeRateLimit } from "@/lib/server/rate-limit";

const schema = z.object({
  provider: z.enum(["openai", "anthropic", "gemini"]),
  key: z.string().trim().min(8).max(512),
});

const deleteSchema = z.object({
  provider: z.enum(["openai", "anthropic", "gemini"]),
}).strict();

export async function GET() {
  const account = await getCurrentSession();
  if (!account) return apiError("Authentication required.", 401);
  try { return apiOk({ keys: await listApiKeys(account.id) }); }
  catch { return apiError("Unable to list API keys.", 500); }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const context = await getCurrentSessionContext();
  if (!context) return apiError("Authentication required.", 401);
  try {
    const input = schema.parse(await readJsonBody(request, 2_048));
    const rate = await consumeRateLimit(`api-keys:${context.account.id}`, 30, 15 * 60 * 1000);
    if (!rate.allowed) return rateLimitError("API key change limit reached.", rate.retryAfter);
    await upsertApiKey(context, input.provider, input.key, getClientIp(request));
    return apiOk({ saved: true, keys: await listApiKeys(context.account.id) });
  } catch (error) {
    const bodyError = requestBodyError(error);
    if (bodyError) return bodyError;
    if (error instanceof z.ZodError) return apiError("Enter a valid provider key.", 422);
    return apiError("Unable to save API key.", 500);
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const context = await getCurrentSessionContext();
  if (!context) return apiError("Authentication required.", 401);
  try {
    const input = deleteSchema.parse(await readJsonBody(request, 512));
    const rate = await consumeRateLimit(`api-keys:${context.account.id}`, 30, 15 * 60 * 1000);
    if (!rate.allowed) return rateLimitError("API key change limit reached.", rate.retryAfter);
    const deleted = await deleteApiKey(context, input.provider, getClientIp(request));
    return apiOk({ deleted, keys: await listApiKeys(context.account.id) });
  } catch (error) {
    const bodyError = requestBodyError(error);
    if (bodyError) return bodyError;
    if (error instanceof z.ZodError) return apiError("Enter a supported provider.", 422);
    return apiError("Unable to delete API key.", 500);
  }
}

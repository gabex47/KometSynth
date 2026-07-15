import { z } from "zod";
import { getCurrentSession, logActivity } from "@/lib/server/auth";
import { listApiKeys, upsertApiKey } from "@/lib/server/api-keys";
import { apiError, apiOk, getClientIp, isSameOrigin } from "@/lib/server/http";

const schema = z.object({
  provider: z.enum(["openai", "anthropic", "gemini"]),
  key: z.string().trim().min(8).max(512),
});

export async function GET() {
  const account = await getCurrentSession();
  if (!account) return apiError("Authentication required.", 401);
  try { return apiOk({ keys: await listApiKeys(account.id) }); }
  catch { return apiError("Unable to list API keys.", 500); }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const account = await getCurrentSession();
  if (!account) return apiError("Authentication required.", 401);
  try {
    const input = schema.parse(await request.json());
    await upsertApiKey(account.id, input.provider, input.key);
    await logActivity(account.username, `api_key_updated_${input.provider}`, getClientIp(request));
    return apiOk({ saved: true, keys: await listApiKeys(account.id) });
  } catch (error) {
    if (error instanceof z.ZodError) return apiError("Enter a valid provider key.", 422);
    return apiError("Unable to save API key.", 500);
  }
}

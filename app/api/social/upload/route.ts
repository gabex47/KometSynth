import { z } from "zod";
import { getCurrentSessionContext } from "@/lib/server/auth";
import { apiError, apiOk, isSameOrigin } from "@/lib/server/http";
import { uploadSocialFile } from "@/lib/server/social";
import { socialApiError } from "@/lib/server/social-http";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const context = await getCurrentSessionContext();
  if (!context) return apiError("Authentication required.", 401);
  try {
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > 26 * 1024 * 1024) return apiError("Upload is too large.", 413);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return apiError("Choose a file to upload.", 422);
    const purpose = z.enum(["message", "avatar", "banner"]).parse(form.get("purpose"));
    const conversationId = purpose === "message" ? z.string().uuid().parse(form.get("conversationId")) : undefined;
    const durationValue = form.get("durationSeconds");
    const durationSeconds = typeof durationValue === "string" && durationValue ? z.coerce.number().min(0).max(3600).parse(durationValue) : null;
    return apiOk({ upload: await uploadSocialFile(context, { conversationId, file, purpose, durationSeconds }) }, 201);
  } catch (error) {
    return socialApiError(error, "Unable to upload the file.");
  }
}

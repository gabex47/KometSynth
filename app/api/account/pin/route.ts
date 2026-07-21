import { z } from "zod";
import { getCurrentSessionContext } from "@/lib/server/auth";
import { apiError, apiOk, getClientIp, isSameOrigin, rateLimitError, readJsonBody, requestBodyError } from "@/lib/server/http";
import { changeOwnPin } from "@/lib/server/profile";
import { consumeRateLimit } from "@/lib/server/rate-limit";

const schema = z.object({
  currentPin: z.string().regex(/^\d{4,12}$/),
  newPin: z.string().regex(/^\d{6,12}$/),
  confirmPin: z.string(),
}).strict().superRefine((value, context) => {
  if (value.newPin !== value.confirmPin) context.addIssue({ code: "custom", path: ["confirmPin"], message: "PINs must match." });
  if (value.currentPin === value.newPin) context.addIssue({ code: "custom", path: ["newPin"], message: "Choose a different PIN." });
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const context = await getCurrentSessionContext();
  if (!context) return apiError("Authentication required.", 401);
  try {
    const input = schema.parse(await readJsonBody(request, 1_024));
    const rate = await consumeRateLimit(`change-pin:${context.account.id}`, 5, 60 * 60 * 1000);
    if (!rate.allowed) return rateLimitError("PIN change limit reached. Try again later.", rate.retryAfter);
    await changeOwnPin(context, input.currentPin, input.newPin, getClientIp(request));
    return apiOk({ changed: true });
  } catch (error) {
    const bodyError = requestBodyError(error);
    if (bodyError) return bodyError;
    if (error instanceof z.ZodError) return apiError("Enter the current PIN and a different matching 6–12 digit PIN.", 422);
    if (error instanceof Error && error.name === "InvalidCurrentPinError") return apiError(error.message, 403);
    return apiError("Unable to change PIN.", 500);
  }
}

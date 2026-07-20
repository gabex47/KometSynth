import { z } from "zod";
import { createManagedAccount, listManagedAccounts, updateManagedAccount } from "@/lib/server/accounts";
import { getCurrentSession, getCurrentSessionContext, roleRank } from "@/lib/server/auth";
import { apiError, apiOk, getClientIp, isSameOrigin, rateLimitError, readJsonBody, requestBodyError } from "@/lib/server/http";
import { consumeRateLimit } from "@/lib/server/rate-limit";

const createSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(32).regex(/^[a-z0-9_-]+$/),
  pin: z.string().regex(/^\d{6,12}$/),
  accountType: z.enum(["normal", "admin", "owner"]),
  notes: z.string().trim().max(2000).optional().default(""),
}).strict();

const patchSchema = z.object({
  accountId: z.string().uuid(),
  action: z.enum(["lock", "unlock", "disable", "enable", "reset_pin", "set_role"]),
  pin: z.string().regex(/^\d{6,12}$/).optional(),
  accountType: z.enum(["normal", "admin", "owner"]).optional(),
}).strict().superRefine((value, context) => {
  if (value.action === "reset_pin" && !value.pin) {
    context.addIssue({ code: "custom", path: ["pin"], message: "A new PIN is required." });
  }
  if (value.action === "set_role" && !value.accountType) {
    context.addIssue({ code: "custom", path: ["accountType"], message: "A role is required." });
  }
});

export async function GET() {
  const actor = await getCurrentSession();
  if (!actor || roleRank(actor.accountType) < 2) return apiError("Administrator access required.", 403);
  try {
    return apiOk({ accounts: await listManagedAccounts() });
  } catch {
    return apiError("Unable to list accounts.", 500);
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const context = await getCurrentSessionContext();
  if (!context || roleRank(context.account.accountType) < 2) return apiError("Administrator access required.", 403);

  try {
    const input = createSchema.parse(await readJsonBody(request, 4_096));
    if (input.accountType === "owner" && context.account.accountType !== "owner") {
      return apiError("Only the owner can create an owner account.", 403);
    }
    const rate = await consumeRateLimit(`admin:${context.account.id}`, 60, 15 * 60 * 1000);
    if (!rate.allowed) return rateLimitError("Administrative action limit reached.", rate.retryAfter);
    await createManagedAccount(context, input, getClientIp(request));
    return apiOk({ created: true, accounts: await listManagedAccounts() }, 201);
  } catch (error) {
    const bodyError = requestBodyError(error);
    if (bodyError) return bodyError;
    if (error instanceof z.ZodError) return apiError("Enter a valid username, role, and 6–12 digit PIN.", 422);
    if (error instanceof Error && error.name === "AccountConflictError") return apiError(error.message, 409);
    return apiError("Unable to create account.", 500);
  }
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const context = await getCurrentSessionContext();
  if (!context || roleRank(context.account.accountType) < 2) return apiError("Administrator access required.", 403);

  try {
    const input = patchSchema.parse(await readJsonBody(request, 4_096));
    const rate = await consumeRateLimit(`admin:${context.account.id}`, 60, 15 * 60 * 1000);
    if (!rate.allowed) return rateLimitError("Administrative action limit reached.", rate.retryAfter);
    await updateManagedAccount(context, input, getClientIp(request));
    return apiOk({ updated: true, accounts: await listManagedAccounts() });
  } catch (error) {
    const bodyError = requestBodyError(error);
    if (bodyError) return bodyError;
    if (error instanceof z.ZodError) return apiError("Invalid account operation.", 422);
    if (error instanceof Error && error.name === "AccountNotFoundError") return apiError(error.message, 404);
    if (error instanceof Error && error.message.includes("protected")) return apiError(error.message, 403);
    if (error instanceof Error && error.message.includes("current account")) return apiError(error.message, 409);
    return apiError("Account operation was rejected.", 409);
  }
}

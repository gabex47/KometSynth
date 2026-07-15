import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getCurrentSession, logActivity, roleRank } from "@/lib/server/auth";
import { demoStore, isDemoMode, type AccountRecord } from "@/lib/server/demo-store";
import { apiError, apiOk, getClientIp, isSameOrigin } from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import type { AccountRole } from "@/lib/types";

const createSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(32).regex(/^[a-z0-9_-]+$/),
  pin: z.string().regex(/^\d{6,12}$/),
  accountType: z.enum(["normal", "admin", "owner"]),
  notes: z.string().trim().max(2000).optional().default(""),
});

const patchSchema = z.object({
  accountId: z.string().uuid(),
  action: z.enum(["lock", "unlock", "disable", "enable", "reset_pin", "set_role"]),
  pin: z.string().regex(/^\d{6,12}$/).optional(),
  accountType: z.enum(["normal", "admin", "owner"]).optional(),
});

function toSafe(account: AccountRecord) {
  return {
    id: account.id,
    username: account.username,
    accountType: account.accountType,
    createdAt: account.createdAt,
    lastLogin: account.lastLogin,
    lockedUntil: account.lockedUntil,
    disabled: account.disabled,
    notes: account.notes,
  };
}

async function listAccounts() {
  if (isDemoMode()) return [...demoStore.accounts.values()].map(toSafe).sort((a, b) => a.username.localeCompare(b.username));
  const { data, error } = await getSupabaseAdmin().from("accounts").select("id, username, account_type, created_at, last_login, locked_until, disabled, notes").order("username");
  if (error) throw new Error("Unable to list accounts.");
  return (data ?? []).map((account) => ({ id: account.id, username: account.username, accountType: account.account_type, createdAt: account.created_at, lastLogin: account.last_login, lockedUntil: account.locked_until, disabled: account.disabled, notes: account.notes }));
}

async function findById(id: string): Promise<AccountRecord | null> {
  if (isDemoMode()) return [...demoStore.accounts.values()].find((account) => account.id === id) ?? null;
  const { data, error } = await getSupabaseAdmin().from("accounts").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return { id: data.id, username: data.username, pinHash: data.pin_hash, accountType: data.account_type, createdAt: data.created_at, createdBy: data.created_by, lastLogin: data.last_login, loginAttempts: data.login_attempts, lockedUntil: data.locked_until, notes: data.notes, disabled: data.disabled };
}

export async function GET() {
  const actor = await getCurrentSession();
  if (!actor || roleRank(actor.accountType) < 2) return apiError("Administrator access required.", 403);
  try { return apiOk({ accounts: await listAccounts() }); }
  catch { return apiError("Unable to list accounts.", 500); }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const actor = await getCurrentSession();
  if (!actor || roleRank(actor.accountType) < 2) return apiError("Administrator access required.", 403);
  try {
    const input = createSchema.parse(await request.json());
    if (input.accountType === "owner" && actor.accountType !== "owner") return apiError("Only the owner can create an owner account.", 403);
    const pinHash = await bcrypt.hash(input.pin, 12);
    if (isDemoMode()) {
      if (demoStore.accounts.has(input.username)) return apiError("Username is unavailable.", 409);
      const now = new Date().toISOString();
      demoStore.accounts.set(input.username, { id: randomUUID(), username: input.username, pinHash, accountType: input.accountType, createdAt: now, createdBy: actor.id, lastLogin: null, loginAttempts: 0, lockedUntil: null, notes: input.notes || null, disabled: false });
    } else {
      const { error } = await getSupabaseAdmin().from("accounts").insert({ username: input.username, pin_hash: pinHash, account_type: input.accountType, created_by: actor.id, notes: input.notes || null });
      if (error?.code === "23505") return apiError("Username is unavailable.", 409);
      if (error) throw error;
    }
    await logActivity(actor.username, `account_created_${input.accountType}_${input.username}`, getClientIp(request));
    return apiOk({ created: true, accounts: await listAccounts() }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return apiError("Enter a valid username, role, and 6–12 digit PIN.", 422);
    return apiError("Unable to create account.", 500);
  }
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const actor = await getCurrentSession();
  if (!actor || roleRank(actor.accountType) < 2) return apiError("Administrator access required.", 403);
  try {
    const input = patchSchema.parse(await request.json());
    const target = await findById(input.accountId);
    if (!target) return apiError("Account not found.", 404);
    if (target.accountType === "owner" && actor.accountType !== "owner") return apiError("Owner accounts are protected.", 403);
    if ((input.accountType === "owner" || target.accountType === "owner") && actor.accountType !== "owner") return apiError("Only an owner can change owner permissions.", 403);
    if (input.accountId === actor.id && ["lock", "disable"].includes(input.action)) return apiError("You cannot revoke your current account.", 409);
    if (input.action === "reset_pin" && !input.pin) return apiError("A new PIN is required.", 422);
    if (input.action === "set_role" && !input.accountType) return apiError("A role is required.", 422);

    const patch: Partial<AccountRecord> = {};
    if (input.action === "lock") patch.lockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    if (input.action === "unlock") { patch.lockedUntil = null; patch.loginAttempts = 0; }
    if (input.action === "disable") patch.disabled = true;
    if (input.action === "enable") patch.disabled = false;
    if (input.action === "reset_pin") patch.pinHash = await bcrypt.hash(input.pin as string, 12);
    if (input.action === "set_role") patch.accountType = input.accountType as AccountRole;

    if (isDemoMode()) Object.assign(target, patch);
    else {
      const databasePatch: Record<string, unknown> = {};
      if (patch.lockedUntil !== undefined) databasePatch.locked_until = patch.lockedUntil;
      if (patch.loginAttempts !== undefined) databasePatch.login_attempts = patch.loginAttempts;
      if (patch.disabled !== undefined) databasePatch.disabled = patch.disabled;
      if (patch.pinHash !== undefined) databasePatch.pin_hash = patch.pinHash;
      if (patch.accountType !== undefined) databasePatch.account_type = patch.accountType;
      const { error } = await getSupabaseAdmin().from("accounts").update(databasePatch).eq("id", target.id);
      if (error) throw error;
      if (["lock", "disable", "reset_pin"].includes(input.action)) await getSupabaseAdmin().from("sessions").update({ revoked_at: new Date().toISOString() }).eq("account_id", target.id).is("revoked_at", null);
    }
    await logActivity(actor.username, `account_${input.action}_${target.username}`, getClientIp(request));
    return apiOk({ updated: true, accounts: await listAccounts() });
  } catch (error) {
    if (error instanceof z.ZodError) return apiError("Invalid account operation.", 422);
    return apiError("Unable to update account.", 500);
  }
}

import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import type { AccountRole, SafeAccount, SessionAccount } from "@/lib/types";
import { demoStore, isDemoMode, type AccountRecord } from "@/lib/server/demo-store";
import { getSupabaseAdmin } from "@/lib/server/supabase";

const SESSION_COOKIE = "synthnet_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const MAX_PIN_ATTEMPTS = 5;
const LOCK_MS = 1000 * 60 * 15;

type DatabaseAccount = {
  id: string;
  username: string;
  pin_hash: string;
  account_type: AccountRole;
  created_at: string;
  created_by: string | null;
  last_login: string | null;
  login_attempts: number;
  locked_until: string | null;
  notes: string | null;
  disabled: boolean;
};

function fromDatabase(account: DatabaseAccount): AccountRecord {
  return {
    id: account.id,
    username: account.username,
    pinHash: account.pin_hash,
    accountType: account.account_type,
    createdAt: account.created_at,
    createdBy: account.created_by,
    lastLogin: account.last_login,
    loginAttempts: account.login_attempts,
    lockedUntil: account.locked_until,
    notes: account.notes,
    disabled: account.disabled,
  };
}

function safeAccount(account: AccountRecord): SafeAccount {
  return {
    id: account.id,
    username: account.username,
    accountType: account.accountType,
    createdAt: account.createdAt,
    lastLogin: account.lastLogin,
  };
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function findAccount(username: string): Promise<AccountRecord | null> {
  const normalized = username.trim().toLowerCase();
  if (isDemoMode()) return demoStore.accounts.get(normalized) ?? null;

  const { data, error } = await getSupabaseAdmin()
    .from("accounts")
    .select("*")
    .eq("username", normalized)
    .maybeSingle();

  if (error) throw new Error("Unable to query account.");
  return data ? fromDatabase(data as DatabaseAccount) : null;
}

async function updateAccount(account: AccountRecord, patch: Partial<AccountRecord>) {
  Object.assign(account, patch);
  if (isDemoMode()) return;

  const databasePatch: Record<string, unknown> = {};
  if (patch.lastLogin !== undefined) databasePatch.last_login = patch.lastLogin;
  if (patch.loginAttempts !== undefined) databasePatch.login_attempts = patch.loginAttempts;
  if (patch.lockedUntil !== undefined) databasePatch.locked_until = patch.lockedUntil;
  if (patch.disabled !== undefined) databasePatch.disabled = patch.disabled;
  if (patch.pinHash !== undefined) databasePatch.pin_hash = patch.pinHash;
  if (patch.accountType !== undefined) databasePatch.account_type = patch.accountType;
  if (patch.notes !== undefined) databasePatch.notes = patch.notes;

  const { error } = await getSupabaseAdmin().from("accounts").update(databasePatch).eq("id", account.id);
  if (error) throw new Error("Unable to update account.");
}

export async function logActivity(user: string, action: string, ip: string) {
  const record = {
    id: randomUUID(),
    user,
    action,
    ip,
    timestamp: new Date().toISOString(),
  };

  if (isDemoMode()) {
    demoStore.logs.unshift(record);
    demoStore.logs = demoStore.logs.slice(0, 500);
    return;
  }

  const { error } = await getSupabaseAdmin().from("activity_logs").insert({
    user,
    action,
    ip,
    timestamp: record.timestamp,
  });
  if (error) console.error("Failed to write audit log", error.message);
}

export async function authenticateWithPin(account: AccountRecord, pin: string, ip: string) {
  if (account.disabled) {
    await logActivity(account.username, "login_failed_disabled", ip);
    return { ok: false as const, reason: "denied" as const };
  }

  const now = Date.now();
  if (account.lockedUntil && Date.parse(account.lockedUntil) > now) {
    await logActivity(account.username, "login_failed_locked", ip);
    return { ok: false as const, reason: "locked" as const };
  }

  const valid = await bcrypt.compare(pin, account.pinHash);
  if (!valid) {
    const attempts = account.loginAttempts + 1;
    const lockedUntil = attempts >= MAX_PIN_ATTEMPTS ? new Date(now + LOCK_MS).toISOString() : null;
    await updateAccount(account, { loginAttempts: attempts, lockedUntil });
    await logActivity(account.username, lockedUntil ? "account_locked" : "login_failed_pin", ip);
    return { ok: false as const, reason: lockedUntil ? ("locked" as const) : ("invalid" as const) };
  }

  const lastLogin = new Date().toISOString();
  await updateAccount(account, { loginAttempts: 0, lockedUntil: null, lastLogin });
  await logActivity(account.username, "login_success", ip);
  return { ok: true as const, account: safeAccount(account) };
}

export async function createSession(account: SafeAccount, ip: string, userAgent: string) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  if (isDemoMode()) {
    demoStore.sessions.set(tokenHash, {
      accountId: account.id,
      expiresAt: expiresAt.getTime(),
      createdAt: Date.now(),
    });
  } else {
    const { error } = await getSupabaseAdmin().from("sessions").insert({
      account_id: account.id,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
      ip,
      user_agent: userAgent.slice(0, 512),
    });
    if (error) throw new Error("Unable to create session.");
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
}

export async function getCurrentSession(): Promise<SessionAccount | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  if (isDemoMode()) {
    const session = demoStore.sessions.get(tokenHash);
    if (!session || session.expiresAt <= Date.now()) {
      demoStore.sessions.delete(tokenHash);
      return null;
    }
    const account = [...demoStore.accounts.values()].find((item) => item.id === session.accountId);
    if (!account || account.disabled) return null;
    return { ...safeAccount(account), disabled: account.disabled };
  }

  const { data, error } = await getSupabaseAdmin()
    .from("sessions")
    .select("account_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data) return null;

  const { data: accountData, error: accountError } = await getSupabaseAdmin()
    .from("accounts")
    .select("*")
    .eq("id", data.account_id)
    .eq("disabled", false)
    .maybeSingle();
  if (accountError || !accountData) return null;

  const account = fromDatabase(accountData as DatabaseAccount);
  return { ...safeAccount(account), disabled: account.disabled };
}

export async function revokeCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const tokenHash = hashToken(token);
    if (isDemoMode()) {
      demoStore.sessions.delete(tokenHash);
    } else {
      await getSupabaseAdmin()
        .from("sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("token_hash", tokenHash);
    }
  }
  cookieStore.delete(SESSION_COOKIE);
}

export function hasRole(account: SafeAccount, allowed: AccountRole[]) {
  return allowed.includes(account.accountType);
}

export function roleRank(role: AccountRole) {
  return { normal: 1, admin: 2, owner: 3 }[role];
}

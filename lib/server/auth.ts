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
const DUMMY_PIN_HASH = "$2b$12$.xcVjstjzYmrlmCRIR0KEOcPogvG0nKAKVD52ZxOrJSp12kBPS11S";

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

type LoginAttemptResult = {
  outcome: "success" | "invalid" | "locked" | "denied";
  id: string | null;
  username: string | null;
  account_type: AccountRole | null;
  created_at: string | null;
  last_login: string | null;
};

type SessionResult = {
  id: string;
  username: string;
  account_type: AccountRole;
  created_at: string;
  last_login: string | null;
  disabled: boolean;
};

export type SessionContext = {
  account: SessionAccount;
  tokenHash: string;
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

function safeSessionAccount(account: SessionResult): SessionAccount {
  return {
    id: account.id,
    username: account.username,
    accountType: account.account_type,
    createdAt: account.created_at,
    lastLogin: account.last_login,
    disabled: account.disabled,
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
    .select("id, username, pin_hash, account_type, created_at, created_by, last_login, login_attempts, locked_until, notes, disabled")
    .eq("username", normalized)
    .maybeSingle();

  if (error) throw new Error("Unable to query account.");
  return data ? fromDatabase(data as DatabaseAccount) : null;
}

export async function consumeUnknownAccountPin(pin: string) {
  await bcrypt.compare(pin, DUMMY_PIN_HASH);
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
  if (error) console.error("Failed to write audit log.");
}

async function authenticateDemoAccount(account: AccountRecord, pin: string, ip: string) {
  if (account.disabled) {
    await bcrypt.compare(pin, account.pinHash);
    await logActivity(account.username, "login_failed_disabled", ip);
    return { ok: false as const, reason: "denied" as const };
  }

  const now = Date.now();
  if (account.lockedUntil && Date.parse(account.lockedUntil) > now) {
    await bcrypt.compare(pin, account.pinHash);
    await logActivity(account.username, "login_failed_locked", ip);
    return { ok: false as const, reason: "locked" as const };
  }

  const valid = await bcrypt.compare(pin, account.pinHash);
  if (!valid) {
    const attempts = account.lockedUntil && Date.parse(account.lockedUntil) <= now
      ? 1
      : account.loginAttempts + 1;
    const lockedUntil = attempts >= MAX_PIN_ATTEMPTS ? new Date(now + LOCK_MS).toISOString() : null;
    Object.assign(account, { loginAttempts: attempts, lockedUntil });
    await logActivity(account.username, lockedUntil ? "account_locked" : "login_failed_pin", ip);
    return { ok: false as const, reason: lockedUntil ? ("locked" as const) : ("invalid" as const) };
  }

  Object.assign(account, {
    loginAttempts: 0,
    lockedUntil: null,
    lastLogin: new Date().toISOString(),
  });
  return { ok: true as const, account: safeAccount(account) };
}

export async function authenticateWithPin(account: AccountRecord, pin: string, ip: string) {
  if (isDemoMode()) return authenticateDemoAccount(account, pin, ip);

  const valid = await bcrypt.compare(pin, account.pinHash);
  const { data, error } = await getSupabaseAdmin().rpc("record_login_attempt", {
    p_account_id: account.id,
    p_valid: valid,
    p_ip: ip,
  });
  if (error) throw new Error("Unable to record sign-in attempt.");

  const result = (Array.isArray(data) ? data[0] : data) as LoginAttemptResult | null;
  if (!result || result.outcome !== "success") {
    return {
      ok: false as const,
      reason: result?.outcome === "locked" ? ("locked" as const) : result?.outcome === "invalid" ? ("invalid" as const) : ("denied" as const),
    };
  }
  if (!result.id || !result.username || !result.account_type || !result.created_at) {
    throw new Error("Authentication returned an invalid account.");
  }

  return {
    ok: true as const,
    account: {
      id: result.id,
      username: result.username,
      accountType: result.account_type,
      createdAt: result.created_at,
      lastLogin: result.last_login,
    },
  };
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
    await logActivity(account.username, "login_success", ip);
  } else {
    const { error } = await getSupabaseAdmin().rpc("create_session", {
      p_account_id: account.id,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt.toISOString(),
      p_ip: ip,
      p_user_agent: userAgent.slice(0, 512),
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

export async function getCurrentSessionContext(): Promise<SessionContext | null> {
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
    return { account: { ...safeAccount(account), disabled: account.disabled }, tokenHash };
  }

  const { data, error } = await getSupabaseAdmin().rpc("get_session_account", {
    p_token_hash: tokenHash,
  });
  if (error) return null;
  const result = (Array.isArray(data) ? data[0] : data) as SessionResult | null;
  return result ? { account: safeSessionAccount(result), tokenHash } : null;
}

export async function getCurrentSession(): Promise<SessionAccount | null> {
  return (await getCurrentSessionContext())?.account ?? null;
}

export async function revokeCurrentSession(ip: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const tokenHash = hashToken(token);
    if (isDemoMode()) {
      const session = demoStore.sessions.get(tokenHash);
      const account = session
        ? [...demoStore.accounts.values()].find((item) => item.id === session.accountId)
        : null;
      demoStore.sessions.delete(tokenHash);
      if (account) await logActivity(account.username, "logout", ip);
    } else {
      const { error } = await getSupabaseAdmin().rpc("revoke_session", {
        p_token_hash: tokenHash,
        p_ip: ip,
      });
      if (error) console.error("Failed to revoke session.");
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

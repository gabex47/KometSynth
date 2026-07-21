import "server-only";

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { AccountRole } from "@/lib/types";
import type { SessionContext } from "@/lib/server/auth";
import { demoStore, isDemoMode, type AccountRecord } from "@/lib/server/demo-store";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export type ManagedAccount = {
  id: string;
  username: string;
  accountType: AccountRole;
  createdAt: string;
  lastLogin: string | null;
  lockedUntil: string | null;
  disabled: boolean;
  notes: string | null;
};

type AccountAction = "lock" | "unlock" | "disable" | "enable" | "reset_pin" | "set_role" | "force_logout" | "delete";

function toSafe(account: AccountRecord): ManagedAccount {
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

export async function listManagedAccounts() {
  if (isDemoMode()) {
    return [...demoStore.accounts.values()].map(toSafe).sort((a, b) => a.username.localeCompare(b.username));
  }
  const { data, error } = await getSupabaseAdmin()
    .from("accounts")
    .select("id, username, account_type, created_at, last_login, locked_until, disabled, notes")
    .order("username")
    .limit(200);
  if (error) throw new Error("Unable to list accounts.");
  return (data ?? []).map((account) => ({
    id: account.id,
    username: account.username,
    accountType: account.account_type as AccountRole,
    createdAt: account.created_at,
    lastLogin: account.last_login,
    lockedUntil: account.locked_until,
    disabled: account.disabled,
    notes: account.notes,
  }));
}

export async function createManagedAccount(
  context: SessionContext,
  input: { username: string; pin: string; accountType: AccountRole; notes: string },
  ip: string,
) {
  const pinHash = await bcrypt.hash(input.pin, 12);
  if (isDemoMode()) {
    if (demoStore.accounts.has(input.username)) {
      const conflict = new Error("Username is unavailable.");
      conflict.name = "AccountConflictError";
      throw conflict;
    }
    const now = new Date().toISOString();
    const id = randomUUID();
    demoStore.accounts.set(input.username, {
      id,
      username: input.username,
      pinHash,
      accountType: input.accountType,
      createdAt: now,
      createdBy: context.account.id,
      lastLogin: null,
      loginAttempts: 0,
      lockedUntil: null,
      notes: input.notes || null,
      disabled: false,
    });
    demoStore.profiles.set(id, { displayName: "", bio: "", theme: "dark" });
    demoStore.logs.unshift({
      id: randomUUID(),
      user: context.account.username,
      action: `account_created_${input.accountType}_${input.username}`,
      ip,
      timestamp: now,
    });
    return;
  }

  const { error } = await getSupabaseAdmin().rpc("create_managed_account", {
    p_actor_session_hash: context.tokenHash,
    p_username: input.username,
    p_pin_hash: pinHash,
    p_account_type: input.accountType,
    p_notes: input.notes,
    p_ip: ip,
  });
  if (error?.code === "23505") {
    const conflict = new Error("Username is unavailable.");
    conflict.name = "AccountConflictError";
    throw conflict;
  }
  if (error) throw new Error("Unable to create account.");
}

export async function updateManagedAccount(
  context: SessionContext,
  input: { accountId: string; action: AccountAction; pin?: string; accountType?: AccountRole },
  ip: string,
) {
  const pinHash = input.pin ? await bcrypt.hash(input.pin, 12) : null;
  if (isDemoMode()) {
    const target = [...demoStore.accounts.values()].find((account) => account.id === input.accountId);
    if (!target) {
      const notFound = new Error("Account not found.");
      notFound.name = "AccountNotFoundError";
      throw notFound;
    }
    if (target.accountType === "owner" && context.account.accountType !== "owner") {
      throw new Error("Owner accounts are protected.");
    }
    if (input.action === "set_role" && input.accountType === "owner" && context.account.accountType !== "owner") {
      throw new Error("Only owners can grant owner access.");
    }
    if (input.accountId === context.account.id && ["lock", "disable", "force_logout", "delete"].includes(input.action)) {
      throw new Error("You cannot revoke your current account.");
    }
    const removesOwner = target.accountType === "owner" && (
      ["lock", "disable", "delete"].includes(input.action)
      || (input.action === "set_role" && input.accountType !== "owner")
    );
    if (removesOwner) {
      const anotherOwner = [...demoStore.accounts.values()].some((account) => (
        account.id !== target.id
        && account.accountType === "owner"
        && !account.disabled
        && (!account.lockedUntil || Date.parse(account.lockedUntil) <= Date.now())
      ));
      if (!anotherOwner) throw new Error("At least one active owner is required.");
    }
    if (input.action === "delete") {
      demoStore.accounts.delete(target.username);
      demoStore.profiles.delete(target.id);
      demoStore.apiKeys = demoStore.apiKeys.filter((key) => key.userId !== target.id);
      for (const [token, session] of demoStore.sessions) {
        if (session.accountId === target.id) demoStore.sessions.delete(token);
      }
      demoStore.logs.unshift({
        id: randomUUID(),
        user: context.account.username,
        action: `account_deleted_${target.username}`,
        ip,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    if (input.action === "lock") target.lockedUntil = new Date(Date.now() + 86_400_000).toISOString();
    if (input.action === "unlock") {
      target.lockedUntil = null;
      target.loginAttempts = 0;
    }
    if (input.action === "disable") target.disabled = true;
    if (input.action === "enable") target.disabled = false;
    if (input.action === "reset_pin" && pinHash) target.pinHash = pinHash;
    if (input.action === "set_role" && input.accountType) target.accountType = input.accountType;
    if (["lock", "disable", "reset_pin", "set_role", "force_logout"].includes(input.action)) {
      for (const [token, session] of demoStore.sessions) {
        if (session.accountId === target.id) demoStore.sessions.delete(token);
      }
    }
    demoStore.logs.unshift({
      id: randomUUID(),
      user: context.account.username,
      action: `account_${input.action}_${target.username}`,
      ip,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const { error } = await getSupabaseAdmin().rpc("update_managed_account", {
    p_actor_session_hash: context.tokenHash,
    p_account_id: input.accountId,
    p_action: input.action,
    p_pin_hash: pinHash,
    p_account_type: input.accountType ?? null,
    p_ip: ip,
  });
  if (error?.code === "P0002") {
    const notFound = new Error("Account not found.");
    notFound.name = "AccountNotFoundError";
    throw notFound;
  }
  if (error) throw new Error("Account operation was rejected by the security policy.");
}

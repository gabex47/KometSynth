import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { AccountRole, SafeAccount } from "@/lib/types";
import type { SessionContext } from "@/lib/server/auth";
import { demoStore, isDemoMode } from "@/lib/server/demo-store";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export type RegistrationInvite = {
  id: string;
  label: string;
  accountType: Exclude<AccountRole, "owner">;
  maxUses: number;
  useCount: number;
  expiresAt: string;
  disabled: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

function hashInvite(code: string) {
  return createHash("sha256").update(code.trim()).digest("hex");
}

export async function registerAccount(
  input: { username: string; pin: string; inviteCode: string },
  ip: string,
): Promise<SafeAccount> {
  const pinHash = await bcrypt.hash(input.pin, 12);
  const inviteHash = hashInvite(input.inviteCode);

  if (isDemoMode()) {
    const invite = demoStore.invites.find((item) => item.codeHash === inviteHash);
    if (!invite || invite.disabled || Date.parse(invite.expiresAt) <= Date.now() || invite.useCount >= invite.maxUses) {
      const unavailable = new Error("Registration invite is invalid or expired.");
      unavailable.name = "InviteUnavailableError";
      throw unavailable;
    }
    if (demoStore.accounts.has(input.username)) {
      const conflict = new Error("Username is unavailable.");
      conflict.name = "AccountConflictError";
      throw conflict;
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    demoStore.accounts.set(input.username, {
      id,
      username: input.username,
      pinHash,
      accountType: invite.accountType,
      createdAt: now,
      createdBy: null,
      lastLogin: null,
      loginAttempts: 0,
      lockedUntil: null,
      notes: invite.label ? `Invitation: ${invite.label}` : null,
      disabled: false,
    });
    demoStore.profiles.set(id, { displayName: "", bio: "", theme: "dark" });
    invite.useCount += 1;
    invite.lastUsedAt = now;
    if (invite.useCount >= invite.maxUses) invite.disabled = true;
    demoStore.logs.unshift({ id: randomUUID(), user: input.username, action: "account_registered", ip, timestamp: now });
    return { id, username: input.username, accountType: invite.accountType, createdAt: now, lastLogin: null };
  }

  const { data, error } = await getSupabaseAdmin().rpc("register_account", {
    p_username: input.username,
    p_pin_hash: pinHash,
    p_invite_hash: inviteHash,
    p_ip: ip,
  });
  if (error?.code === "23505") {
    const conflict = new Error("Username is unavailable.");
    conflict.name = "AccountConflictError";
    throw conflict;
  }
  if (error?.code === "28000") {
    const unavailable = new Error("Registration invite is invalid or expired.");
    unavailable.name = "InviteUnavailableError";
    throw unavailable;
  }
  if (error || !data) throw new Error("Unable to register account.");

  const { data: account, error: accountError } = await getSupabaseAdmin()
    .from("accounts")
    .select("id, username, account_type, created_at, last_login")
    .eq("id", data)
    .single();
  if (accountError || !account) throw new Error("Unable to load registered account.");
  return {
    id: account.id,
    username: account.username,
    accountType: account.account_type,
    createdAt: account.created_at,
    lastLogin: account.last_login,
  };
}

export async function listRegistrationInvites(context: SessionContext): Promise<RegistrationInvite[]> {
  if (isDemoMode()) {
    return [...demoStore.invites].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((invite) => ({
      id: invite.id,
      label: invite.label,
      accountType: invite.accountType,
      maxUses: invite.maxUses,
      useCount: invite.useCount,
      expiresAt: invite.expiresAt,
      disabled: invite.disabled,
      createdAt: invite.createdAt,
      lastUsedAt: invite.lastUsedAt,
    }));
  }
  const { data, error } = await getSupabaseAdmin().rpc("get_registration_invites", {
    p_actor_session_hash: context.tokenHash,
  });
  if (error) throw new Error("Unable to list registration invites.");
  return (data ?? []).map((invite) => ({
    id: invite.id,
    label: invite.label,
    accountType: invite.account_type as Exclude<AccountRole, "owner">,
    maxUses: invite.max_uses,
    useCount: invite.use_count,
    expiresAt: invite.expires_at,
    disabled: invite.disabled,
    createdAt: invite.created_at,
    lastUsedAt: invite.last_used_at,
  }));
}

export async function createRegistrationInvite(
  context: SessionContext,
  input: { label: string; accountType: Exclude<AccountRole, "owner">; maxUses: number; expiresInDays: number },
  ip: string,
) {
  const code = `snet_${randomBytes(18).toString("base64url")}`;
  const codeHash = hashInvite(code);
  const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString();
  let id: string;
  if (isDemoMode()) {
    id = randomUUID();
    demoStore.invites.unshift({
      id,
      codeHash,
      label: input.label,
      accountType: input.accountType,
      maxUses: input.maxUses,
      useCount: 0,
      expiresAt,
      disabled: false,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    });
    demoStore.logs.unshift({ id: randomUUID(), user: context.account.username, action: "registration_invite_created", ip, timestamp: new Date().toISOString() });
  } else {
    const { data, error } = await getSupabaseAdmin().rpc("create_registration_invite", {
      p_actor_session_hash: context.tokenHash,
      p_code_hash: codeHash,
      p_label: input.label,
      p_account_type: input.accountType,
      p_max_uses: input.maxUses,
      p_expires_at: expiresAt,
      p_ip: ip,
    });
    if (error || !data) throw new Error("Unable to create registration invite.");
    id = data;
  }
  return { id, code, expiresAt };
}

export async function revokeRegistrationInvite(context: SessionContext, inviteId: string, ip: string) {
  if (isDemoMode()) {
    const invite = demoStore.invites.find((item) => item.id === inviteId);
    if (!invite || invite.disabled) return false;
    invite.disabled = true;
    demoStore.logs.unshift({ id: randomUUID(), user: context.account.username, action: "registration_invite_revoked", ip, timestamp: new Date().toISOString() });
    return true;
  }
  const { data, error } = await getSupabaseAdmin().rpc("revoke_registration_invite", {
    p_actor_session_hash: context.tokenHash,
    p_invite_id: inviteId,
    p_ip: ip,
  });
  if (error) throw new Error("Unable to revoke registration invite.");
  return data;
}

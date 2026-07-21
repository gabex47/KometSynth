import "server-only";

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { SessionContext } from "@/lib/server/auth";
import { findAccount } from "@/lib/server/auth";
import { demoStore, isDemoMode } from "@/lib/server/demo-store";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export type ThemePreference = "dark" | "light" | "system";
export type AccountProfile = { displayName: string; bio: string; theme: ThemePreference };
export type AccountSession = { id: string; createdAt: string; expiresAt: string; ip: string; userAgent: string; isCurrent: boolean };

export async function getOwnProfile(context: SessionContext): Promise<AccountProfile> {
  if (isDemoMode()) {
    return demoStore.profiles.get(context.account.id) ?? { displayName: "", bio: "", theme: "dark" };
  }
  const { data, error } = await getSupabaseAdmin().rpc("get_own_profile", {
    p_actor_session_hash: context.tokenHash,
  });
  if (error) throw new Error("Unable to load profile.");
  const profile = data?.[0];
  return profile
    ? { displayName: profile.display_name, bio: profile.bio, theme: profile.theme as ThemePreference }
    : { displayName: "", bio: "", theme: "dark" };
}

export async function updateOwnProfile(context: SessionContext, profile: AccountProfile, ip: string) {
  if (isDemoMode()) {
    demoStore.profiles.set(context.account.id, profile);
    demoStore.logs.unshift({ id: randomUUID(), user: context.account.username, action: "profile_updated", ip, timestamp: new Date().toISOString() });
    return;
  }
  const { error } = await getSupabaseAdmin().rpc("update_own_profile", {
    p_actor_session_hash: context.tokenHash,
    p_display_name: profile.displayName,
    p_bio: profile.bio,
    p_theme: profile.theme,
    p_ip: ip,
  });
  if (error) throw new Error("Unable to update profile.");
}

export async function changeOwnPin(context: SessionContext, currentPin: string, newPin: string, ip: string) {
  const account = await findAccount(context.account.username);
  if (!account || !(await bcrypt.compare(currentPin, account.pinHash))) {
    const error = new Error("Current PIN is incorrect.");
    error.name = "InvalidCurrentPinError";
    throw error;
  }
  const pinHash = await bcrypt.hash(newPin, 12);
  if (isDemoMode()) {
    account.pinHash = pinHash;
    for (const [tokenHash, session] of demoStore.sessions) {
      if (session.accountId === context.account.id && tokenHash !== context.tokenHash) demoStore.sessions.delete(tokenHash);
    }
    demoStore.logs.unshift({ id: randomUUID(), user: context.account.username, action: "pin_changed", ip, timestamp: new Date().toISOString() });
    return;
  }
  const { error } = await getSupabaseAdmin().rpc("change_own_pin", {
    p_actor_session_hash: context.tokenHash,
    p_pin_hash: pinHash,
    p_ip: ip,
  });
  if (error) throw new Error("Unable to change PIN.");
}

export async function listOwnSessions(context: SessionContext): Promise<AccountSession[]> {
  if (isDemoMode()) {
    return [...demoStore.sessions.entries()]
      .filter(([, session]) => session.accountId === context.account.id && session.expiresAt > Date.now())
      .sort(([, left], [, right]) => right.createdAt - left.createdAt)
      .map(([tokenHash, session]) => ({
        id: session.id,
        createdAt: new Date(session.createdAt).toISOString(),
        expiresAt: new Date(session.expiresAt).toISOString(),
        ip: session.ip,
        userAgent: session.userAgent,
        isCurrent: tokenHash === context.tokenHash,
      }));
  }
  const { data, error } = await getSupabaseAdmin().rpc("get_own_sessions", {
    p_actor_session_hash: context.tokenHash,
  });
  if (error) throw new Error("Unable to list sessions.");
  return (data ?? []).map((session) => ({
    id: session.id,
    createdAt: session.created_at,
    expiresAt: session.expires_at,
    ip: session.ip,
    userAgent: session.user_agent,
    isCurrent: session.is_current,
  }));
}

export async function revokeOwnSession(context: SessionContext, sessionId: string, ip: string) {
  if (isDemoMode()) {
    const entry = [...demoStore.sessions.entries()].find(([, session]) => (
      session.id === sessionId && session.accountId === context.account.id
    ));
    if (!entry || entry[0] === context.tokenHash) return false;
    demoStore.sessions.delete(entry[0]);
    demoStore.logs.unshift({ id: randomUUID(), user: context.account.username, action: "session_revoked", ip, timestamp: new Date().toISOString() });
    return true;
  }
  const { data, error } = await getSupabaseAdmin().rpc("revoke_own_session", {
    p_actor_session_hash: context.tokenHash,
    p_session_id: sessionId,
    p_ip: ip,
  });
  if (error) throw new Error("Unable to revoke session.");
  return data;
}

export async function revokeOtherSessions(context: SessionContext, ip: string) {
  if (isDemoMode()) {
    let count = 0;
    for (const [tokenHash, session] of demoStore.sessions) {
      if (session.accountId === context.account.id && tokenHash !== context.tokenHash) {
        demoStore.sessions.delete(tokenHash);
        count += 1;
      }
    }
    if (count > 0) demoStore.logs.unshift({ id: randomUUID(), user: context.account.username, action: "other_sessions_revoked", ip, timestamp: new Date().toISOString() });
    return count;
  }
  const { data, error } = await getSupabaseAdmin().rpc("revoke_other_sessions", {
    p_actor_session_hash: context.tokenHash,
    p_ip: ip,
  });
  if (error) throw new Error("Unable to revoke other sessions.");
  return Number(data);
}

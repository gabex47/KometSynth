import "server-only";

import { randomUUID } from "node:crypto";
import type { SessionContext } from "@/lib/server/auth";
import { demoStore, isDemoMode } from "@/lib/server/demo-store";
import { decryptSecret, encryptSecret } from "@/lib/server/encryption";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export type SafeApiKey = { id: string; provider: string; keyHint: string; updatedAt: string };

export async function listApiKeys(accountId: string): Promise<SafeApiKey[]> {
  if (isDemoMode()) {
    return demoStore.apiKeys.filter((item) => item.userId === accountId).map((item) => ({ id: item.id, provider: item.provider, keyHint: item.keyHint, updatedAt: item.updatedAt }));
  }
  const { data, error } = await getSupabaseAdmin().from("api_keys").select("id, provider, key_hint, updated_at").eq("account_id", accountId).order("provider");
  if (error) throw new Error("Unable to list API keys.");
  return (data ?? []).map((item) => ({ id: item.id, provider: item.provider, keyHint: item.key_hint, updatedAt: item.updated_at }));
}

export async function upsertApiKey(context: SessionContext, provider: string, key: string, ip: string) {
  const accountId = context.account.id;
  const encryptionContext = `${accountId}:${provider}`;
  const encryptedKey = encryptSecret(key, encryptionContext);
  const keyHint = `${key.slice(0, Math.min(3, key.length))}••••${key.slice(-4)}`;
  const now = new Date().toISOString();
  if (isDemoMode()) {
    const existing = demoStore.apiKeys.find((item) => item.userId === accountId && item.provider === provider);
    if (existing) Object.assign(existing, { encryptedKey, keyHint, updatedAt: now });
    else demoStore.apiKeys.push({ id: randomUUID(), userId: accountId, provider, encryptedKey, keyHint, createdAt: now, updatedAt: now });
    demoStore.logs.unshift({
      id: randomUUID(),
      user: context.account.username,
      action: `api_key_updated_${provider}`,
      ip,
      timestamp: now,
    });
    return;
  }
  const { error } = await getSupabaseAdmin().rpc("upsert_api_key", {
    p_actor_session_hash: context.tokenHash,
    p_provider: provider,
    p_encrypted_key: encryptedKey,
    p_key_hint: keyHint,
    p_ip: ip,
  });
  if (error) throw new Error("Unable to save API key.");
}

export async function deleteApiKey(context: SessionContext, provider: string, ip: string) {
  if (isDemoMode()) {
    const index = demoStore.apiKeys.findIndex((item) => (
      item.userId === context.account.id && item.provider === provider
    ));
    if (index < 0) return false;
    demoStore.apiKeys.splice(index, 1);
    demoStore.logs.unshift({
      id: randomUUID(),
      user: context.account.username,
      action: `api_key_deleted_${provider}`,
      ip,
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  const { data, error } = await getSupabaseAdmin().rpc("delete_api_key", {
    p_actor_session_hash: context.tokenHash,
    p_provider: provider,
    p_ip: ip,
  });
  if (error) throw new Error("Unable to delete API key.");
  return data;
}

export async function getDecryptedApiKey(accountId: string, provider: string) {
  if (isDemoMode()) {
    const item = demoStore.apiKeys.find((key) => key.userId === accountId && key.provider === provider);
    return item ? decryptSecret(item.encryptedKey, `${accountId}:${provider}`) : null;
  }
  const { data, error } = await getSupabaseAdmin().from("api_keys").select("encrypted_key").eq("account_id", accountId).eq("provider", provider).maybeSingle();
  if (error) throw new Error("Unable to access provider key.");
  return data ? decryptSecret(data.encrypted_key, `${accountId}:${provider}`) : null;
}

import "server-only";

import { randomUUID } from "node:crypto";
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

export async function upsertApiKey(accountId: string, provider: string, key: string) {
  const encryptedKey = encryptSecret(key);
  const keyHint = `${key.slice(0, Math.min(3, key.length))}••••${key.slice(-4)}`;
  const now = new Date().toISOString();
  if (isDemoMode()) {
    const existing = demoStore.apiKeys.find((item) => item.userId === accountId && item.provider === provider);
    if (existing) Object.assign(existing, { encryptedKey, keyHint, updatedAt: now });
    else demoStore.apiKeys.push({ id: randomUUID(), userId: accountId, provider, encryptedKey, keyHint, createdAt: now, updatedAt: now });
    return;
  }
  const { error } = await getSupabaseAdmin().from("api_keys").upsert({ account_id: accountId, provider, encrypted_key: encryptedKey, key_hint: keyHint, updated_at: now }, { onConflict: "account_id,provider" });
  if (error) throw new Error("Unable to save API key.");
}

export async function getDecryptedApiKey(accountId: string, provider: string) {
  if (isDemoMode()) {
    const item = demoStore.apiKeys.find((key) => key.userId === accountId && key.provider === provider);
    return item ? decryptSecret(item.encryptedKey) : null;
  }
  const { data, error } = await getSupabaseAdmin().from("api_keys").select("encrypted_key").eq("account_id", accountId).eq("provider", provider).maybeSingle();
  if (error) throw new Error("Unable to access provider key.");
  return data ? decryptSecret(data.encrypted_key) : null;
}

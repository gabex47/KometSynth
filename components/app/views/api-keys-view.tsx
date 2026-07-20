"use client";

import { useEffect, useState } from "react";
import { KeyRound, LockKeyhole, Plus, Trash2, X } from "lucide-react";
import { apiRequest } from "@/lib/client/api";

type SafeApiKey = { id: string; provider: string; keyHint: string; updatedAt: string };

export function ApiKeysView() {
  const [keys, setKeys] = useState<SafeApiKey[]>([]);
  const [provider, setProvider] = useState("openai");
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<{ keys: SafeApiKey[] }>("/api/api-keys", { signal: controller.signal })
      .then((data) => setKeys(data.keys))
      .catch((error) => {
        if (error.name !== "AbortError") setMessage(error.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  async function save() {
    if (saving) return;
    setSaving(true);
    setMessage("");
    try {
      const data = await apiRequest<{ keys: SafeApiKey[] }>("/api/api-keys", {
        method: "POST",
        body: JSON.stringify({ provider, key: value }),
      });
      setKeys(data.keys);
      setValue("");
      setMessage("Key encrypted and saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save key.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(providerToDelete: string) {
    if (deleting) return;
    setDeleting(providerToDelete);
    setMessage("");
    try {
      const data = await apiRequest<{ keys: SafeApiKey[] }>("/api/api-keys", {
        method: "DELETE",
        body: JSON.stringify({ provider: providerToDelete }),
      });
      setKeys(data.keys);
      setConfirmDelete(null);
      setMessage("Key permanently removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete key.");
    } finally {
      setDeleting(null);
    }
  }

  return <>
    <div className="page-heading compact-heading"><div><span className="eyebrow">CONFIGURATION / SECRETS</span><h1>API keys.</h1><p>Keys are encrypted server-side, never returned to the browser, and can be revoked instantly.</p></div><span className="local-badge"><LockKeyhole size={13} /> ENCRYPTED</span></div>
    <div className="settings-grid">
      <section className="content-card key-form"><div className="section-title"><div><span className="eyebrow">ADD PROVIDER</span><h2>Store or rotate a key</h2></div></div><label>PROVIDER<select value={provider} onChange={(event) => setProvider(event.target.value)} disabled={saving}><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="gemini">Google Gemini</option></select></label><label>SECRET KEY<input type="password" autoComplete="off" value={value} maxLength={512} onChange={(event) => setValue(event.target.value)} placeholder="Paste provider key" /></label><button className="primary-button" disabled={saving || value.trim().length < 8} onClick={() => void save()}><Plus size={15} /> {saving ? "SAVING…" : "ENCRYPT & SAVE"}</button>{message && <p className="form-notice" role="status">{message}</p>}</section>
      <section className="content-card" aria-busy={loading}><div className="section-title"><div><span className="eyebrow">SAVED KEYS</span><h2>Provider access</h2></div><span className="tool-count">{keys.length.toString().padStart(2, "0")}</span></div><div className="key-list">{loading ? <div className="inline-empty"><p><strong>Loading keys…</strong></p></div> : keys.length ? keys.map((key) => <div key={key.id} className="key-row"><span className="provider-mark">{key.provider[0].toUpperCase()}</span><p><strong>{key.provider}</strong><small>{key.keyHint} · updated {new Date(key.updatedAt).toLocaleDateString()}</small></p>{confirmDelete === key.provider ? <span className="confirm-actions"><button disabled={Boolean(deleting)} onClick={() => void remove(key.provider)}>{deleting === key.provider ? "REMOVING…" : "CONFIRM"}</button><button aria-label={`Cancel deleting ${key.provider}`} onClick={() => setConfirmDelete(null)}><X size={13} /></button></span> : <button className="icon-action" aria-label={`Delete ${key.provider} key`} onClick={() => setConfirmDelete(key.provider)}><Trash2 size={14} /></button>}</div>) : <div className="inline-empty"><KeyRound size={20} /><p><strong>No keys configured</strong><small>Add a key to enable the AI Sandbox.</small></p></div>}</div></section>
    </div>
  </>;
}

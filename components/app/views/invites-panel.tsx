"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Clipboard, Link2, Plus, ShieldX, X } from "lucide-react";
import { apiRequest } from "@/lib/client/api";

type Invite = { id: string; label: string; accountType: "normal" | "admin"; maxUses: number; useCount: number; expiresAt: string; disabled: boolean; createdAt: string; lastUsedAt: string | null };

export function InvitesPanel({ owner }: { owner: boolean }) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [accountType, setAccountType] = useState<Invite["accountType"]>("normal");
  const [maxUses, setMaxUses] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [createdCode, setCreatedCode] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    const data = await apiRequest<{ invites: Invite[] }>("/api/admin/invites", { signal });
    setInvites(data.invites);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch((error) => {
      if (error.name !== "AbortError") setNotice(error.message);
    });
    return () => controller.abort();
  }, [load]);

  async function create() {
    setBusy(true);
    setNotice("");
    setCreatedCode("");
    try {
      const data = await apiRequest<{ invite: { code: string }; invites: Invite[] }>("/api/admin/invites", {
        method: "POST",
        body: JSON.stringify({ label, accountType, maxUses, expiresInDays }),
      });
      setInvites(data.invites);
      setCreatedCode(data.invite.code);
      setLabel("");
      setMaxUses(1);
      setExpiresInDays(7);
      setFormOpen(false);
      setNotice("Invitation created. Copy it now; the plaintext code cannot be recovered later.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to create invitation."); }
    finally { setBusy(false); }
  }

  async function revoke(inviteId: string) {
    setBusy(true);
    setNotice("");
    try {
      const data = await apiRequest<{ invites: Invite[] }>("/api/admin/invites", {
        method: "DELETE",
        body: JSON.stringify({ inviteId }),
      });
      setInvites(data.invites);
      setNotice("Invitation revoked.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to revoke invitation."); }
    finally { setBusy(false); }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(createdCode);
      setNotice("Invitation code copied.");
    } catch { setNotice("Copy was blocked. Select the code and copy it manually."); }
  }

  return <section className="content-card owner-wide invite-panel">
    <div className="section-title"><div><span className="eyebrow">ONBOARDING</span><h2>Registration invitations</h2></div><button onClick={() => setFormOpen((value) => !value)}><Plus size={14} /> {formOpen ? "CLOSE" : "NEW INVITE"}</button></div>
    {formOpen && <div className="invite-form"><label>LABEL<input value={label} maxLength={80} onChange={(event) => setLabel(event.target.value)} placeholder="Contractor onboarding" /></label><label>ROLE<select value={accountType} onChange={(event) => setAccountType(event.target.value as Invite["accountType"])}><option value="normal">Normal</option>{owner && <option value="admin">Administrator</option>}</select></label><label>MAX USES<input type="number" min={1} max={100} value={maxUses} onChange={(event) => setMaxUses(Math.max(1, Math.min(100, Number(event.target.value))))} /></label><label>EXPIRES<input type="number" min={1} max={90} value={expiresInDays} onChange={(event) => setExpiresInDays(Math.max(1, Math.min(90, Number(event.target.value))))} /><small>DAYS</small></label><button className="primary-button" disabled={busy} onClick={() => void create()}>CREATE INVITE</button></div>}
    {createdCode && <div className="invite-code" role="status"><div><Check size={15} /><p><strong>ONE-TIME INVITATION CODE</strong><code>{createdCode}</code></p></div><button onClick={() => void copyCode()}><Clipboard size={14} /> COPY</button><button aria-label="Hide invitation code" onClick={() => setCreatedCode("")}><X size={14} /></button></div>}
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    <div className="invite-list">{invites.map((invite) => { const expired = Date.parse(invite.expiresAt) <= Date.now(); const inactive = invite.disabled || expired || invite.useCount >= invite.maxUses; return <div key={invite.id}><span className="provider-mark"><Link2 size={13} /></span><p><strong>{invite.label || "Unlabelled invitation"}</strong><small>{invite.accountType.toUpperCase()} · {invite.useCount}/{invite.maxUses} used · expires {new Date(invite.expiresAt).toLocaleDateString()}</small></p><span className="status-chip">{invite.disabled ? "REVOKED" : expired ? "EXPIRED" : invite.useCount >= invite.maxUses ? "USED" : "ACTIVE"}</span>{!inactive && <button className="icon-action" aria-label={`Revoke ${invite.label || "invitation"}`} disabled={busy} onClick={() => void revoke(invite.id)}><ShieldX size={14} /></button>}</div>; })}{!invites.length && <div className="inline-empty"><p><strong>No invitations created</strong><small>Create a short-lived invitation instead of sharing credentials.</small></p></div>}</div>
  </section>;
}

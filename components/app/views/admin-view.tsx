"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Activity, Boxes, Database, KeyRound, LockKeyhole, Pencil, Plus, RefreshCw, ShieldCheck, X } from "lucide-react";
import { apiRequest } from "@/lib/client/api";

type ManagedAccount = {
  id: string;
  username: string;
  accountType: "normal" | "admin" | "owner";
  createdAt: string;
  lastLogin: string | null;
  lockedUntil: string | null;
  disabled: boolean;
  notes: string | null;
};

export function AdminView({ owner = false, currentAccountId }: { owner?: boolean; currentAccountId: string }) {
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<ManagedAccount["accountType"]>("normal");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<ManagedAccount["accountType"]>("normal");
  const [resetPin, setResetPin] = useState("");

  const loadAccounts = useCallback(async (signal?: AbortSignal) => {
    const data = await apiRequest<{ accounts: ManagedAccount[] }>("/api/admin/accounts", { signal });
    setAccounts(data.accounts);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadAccounts(controller.signal)
      .catch((error) => {
        if (error.name !== "AbortError") setNotice(error.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [loadAccounts]);

  async function createAccount() {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const data = await apiRequest<{ accounts: ManagedAccount[] }>("/api/admin/accounts", {
        method: "POST",
        body: JSON.stringify({ username, pin, accountType: role }),
      });
      setAccounts(data.accounts);
      setUsername("");
      setPin("");
      setRole("normal");
      setFormOpen(false);
      setNotice("Account created and ready for access.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to create account.");
    } finally {
      setBusy(false);
    }
  }

  async function updateAccount(
    accountId: string,
    action: "lock" | "unlock" | "disable" | "enable" | "reset_pin" | "set_role",
    extra: { pin?: string; accountType?: ManagedAccount["accountType"] } = {},
  ) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const data = await apiRequest<{ accounts: ManagedAccount[] }>("/api/admin/accounts", {
        method: "PATCH",
        body: JSON.stringify({ accountId, action, ...extra }),
      });
      setAccounts(data.accounts);
      setResetPin("");
      setEditing(null);
      setNotice(accountId === currentAccountId && ["reset_pin", "set_role"].includes(action)
        ? "Your account changed. Sign in again to continue securely."
        : "Account policy updated and active sessions revoked when required.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to update account.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshAccounts() {
    setLoading(true);
    setNotice("");
    try { await loadAccounts(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Unable to refresh accounts."); }
    finally { setLoading(false); }
  }

  return <>
    <div className="page-heading compact-heading"><div><span className="eyebrow">{owner ? "OWNER / CONTROL" : "ADMIN / ACCOUNTS"}</span><h1>{owner ? "Owner control." : "Account administration."}</h1><p>{owner ? "System-wide configuration and protected operations." : "Manage access without exposing credentials or secrets."}</p></div><span className="local-badge"><ShieldCheck size={13} /> {owner ? "LEVEL 03" : "LEVEL 02"}</span></div>
    <div className="owner-grid">
      <section className="content-card accounts-card owner-wide" aria-busy={loading || busy}>
        <div className="section-title"><div><span className="eyebrow">IDENTITIES</span><h2>Account controls</h2></div><span className="section-actions"><button disabled={loading} onClick={() => void refreshAccounts()}><RefreshCw size={13} className={loading ? "spin" : ""} /> REFRESH</button><button onClick={() => setFormOpen((current) => !current)} aria-expanded={formOpen}><Plus size={14} /> {formOpen ? "CLOSE" : "NEW ACCOUNT"}</button></span></div>
        {formOpen && <div className="account-form"><label>USERNAME<input value={username} autoComplete="off" maxLength={32} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32))} placeholder="new-identity" /></label><label>INITIAL PIN<input value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 12))} inputMode="numeric" autoComplete="new-password" type="password" placeholder="6–12 digits" /></label><label>ROLE<select value={role} onChange={(event) => setRole(event.target.value as ManagedAccount["accountType"])}><option value="normal">Normal</option><option value="admin">Admin</option>{owner && <option value="owner">Owner</option>}</select></label><button className="primary-button" disabled={busy || username.length < 3 || pin.length < 6} onClick={() => void createAccount()}>CREATE IDENTITY</button></div>}
        {notice && <p className="admin-notice" role="status">{notice}</p>}
        <div className="account-table"><div className="account-head"><span>IDENTITY</span><span>ROLE</span><span>STATUS</span><span>LAST ACCESS</span><span>ACTIONS</span></div>{accounts.map((managed) => { const locked = Boolean(managed.lockedUntil && Date.parse(managed.lockedUntil) > Date.now()); const manageable = managed.accountType !== "owner" || owner; const isCurrent = managed.id === currentAccountId; return <Fragment key={managed.id}><div className="account-row"><span><span className="mini-avatar">{managed.username.slice(0, 2).toUpperCase()}</span><strong>{managed.username}{isCurrent && <small>YOU</small>}</strong></span><span className="role-badge">{managed.accountType.toUpperCase()}</span><span className="account-status"><i className={managed.disabled || locked ? "off" : ""} />{managed.disabled ? "DISABLED" : locked ? "LOCKED" : "ACTIVE"}</span><span>{managed.lastLogin ? new Date(managed.lastLogin).toLocaleDateString() : "NEVER"}</span><span className="row-actions">{manageable && <><button disabled={busy || isCurrent} onClick={() => void updateAccount(managed.id, locked ? "unlock" : "lock")}>{locked ? "UNLOCK" : "LOCK"}</button><button disabled={busy || isCurrent} onClick={() => void updateAccount(managed.id, managed.disabled ? "enable" : "disable")}>{managed.disabled ? "ENABLE" : "DISABLE"}</button><button aria-label={`Edit ${managed.username}`} disabled={busy} onClick={() => { setEditing((current) => current === managed.id ? null : managed.id); setEditRole(managed.accountType); setResetPin(""); }}><Pencil size={12} /></button></>}</span></div>{editing === managed.id && <div className="account-editor"><div><label>ROLE<select value={editRole} onChange={(event) => setEditRole(event.target.value as ManagedAccount["accountType"])}><option value="normal">Normal</option><option value="admin">Admin</option>{owner && <option value="owner">Owner</option>}</select></label><button disabled={busy || editRole === managed.accountType} onClick={() => void updateAccount(managed.id, "set_role", { accountType: editRole })}>APPLY ROLE</button></div><div><label>NEW PIN<input type="password" inputMode="numeric" autoComplete="new-password" value={resetPin} onChange={(event) => setResetPin(event.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="6–12 digits" /></label><button disabled={busy || resetPin.length < 6} onClick={() => void updateAccount(managed.id, "reset_pin", { pin: resetPin })}>RESET PIN</button></div><button className="editor-close" aria-label="Close account editor" onClick={() => setEditing(null)}><X size={14} /></button></div>}</Fragment>; })}{loading && <div className="empty-state"><h2>Loading accounts…</h2></div>}</div>
      </section>
      <section className="content-card"><div className="section-title"><div><span className="eyebrow">SECURITY</span><h2>Access posture</h2></div></div><div className="control-list"><div className="control-item"><KeyRound size={17} /><span><strong>PIN policy</strong><small>6–12 digits · bcrypt cost 12</small></span></div><div className="control-item"><LockKeyhole size={17} /><span><strong>Automatic lockout</strong><small>5 attempts · 15 minute cooldown</small></span></div><div className="control-item"><Activity size={17} /><span><strong>Audit stream</strong><small>Privileged actions recorded atomically</small></span></div></div></section>
      <section className="content-card"><div className="section-title"><div><span className="eyebrow">SYSTEM</span><h2>{owner ? "Platform controls" : "Security overview"}</h2></div></div><div className="control-list">{owner && <div className="control-item"><Database size={17} /><span><strong>Data export</strong><small>Use provider-managed encrypted backups</small></span></div>}<div className="control-item"><Activity size={17} /><span><strong>Audit integrity</strong><small>Database-enforced append-only records</small></span></div><div className="control-item"><Boxes size={17} /><span><strong>Feature flags</strong><small>Managed directly in the protected database</small></span></div></div></section>
      {owner && <section className="content-card owner-wide"><div className="section-title"><div><span className="eyebrow">SERVICE STATE</span><h2>System management</h2></div><span className="status-chip">CONFIGURED</span></div><div className="system-stats"><div><small>DATABASE</small><strong>PROTECTED</strong><span>Service-role server access</span></div><div><small>RATE LIMITS</small><strong>DISTRIBUTED</strong><span>Database-backed windows</span></div><div><small>ACTIVE FLAGS</small><strong>05 / 05</strong><span>Configured modules</span></div><div><small>BACKUPS</small><strong>PROVIDER</strong><span>Verify deployment policy</span></div></div></section>}
    </div>
  </>;
}

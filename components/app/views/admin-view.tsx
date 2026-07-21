"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Activity, KeyRound, LockKeyhole, LogOut, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, UserCheck, Users, X } from "lucide-react";
import { apiRequest } from "@/lib/client/api";
import { InvitesPanel } from "./invites-panel";

type AccountRole = "normal" | "admin" | "owner";
type AccountAction = "lock" | "unlock" | "disable" | "enable" | "reset_pin" | "set_role" | "force_logout" | "delete";
type ManagedAccount = { id: string; username: string; accountType: AccountRole; createdAt: string; lastLogin: string | null; lockedUntil: string | null; disabled: boolean; notes: string | null };

export function AdminView({ owner = false, currentAccountId }: { owner?: boolean; currentAccountId: string }) {
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<AccountRole>("normal");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<AccountRole>("normal");
  const [resetPin, setResetPin] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "locked" | "disabled">("all");
  const [deleteTarget, setDeleteTarget] = useState<ManagedAccount | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const loadAccounts = useCallback(async (signal?: AbortSignal) => {
    const data = await apiRequest<{ accounts: ManagedAccount[] }>("/api/admin/accounts", { signal });
    setAccounts(data.accounts);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadAccounts(controller.signal).catch((error) => {
      if (error.name !== "AbortError") setNotice(error.message);
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [loadAccounts]);

  const filtered = useMemo(() => accounts.filter((account) => {
    const locked = Boolean(account.lockedUntil && Date.parse(account.lockedUntil) > Date.now());
    const matchesQuery = !query.trim() || `${account.username} ${account.accountType} ${account.notes ?? ""}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesStatus = status === "all" || (status === "active" && !account.disabled && !locked) || (status === "locked" && locked) || (status === "disabled" && account.disabled);
    return matchesQuery && matchesStatus;
  }), [accounts, query, status]);

  const activeCount = accounts.filter((account) => !account.disabled && (!account.lockedUntil || Date.parse(account.lockedUntil) <= Date.now())).length;
  const privilegedCount = accounts.filter((account) => account.accountType !== "normal").length;
  const recentCount = accounts.filter((account) => Date.parse(account.createdAt) >= Date.now() - 7 * 86_400_000).length;

  async function createAccount() {
    setBusy(true);
    setNotice("");
    try {
      const data = await apiRequest<{ accounts: ManagedAccount[] }>("/api/admin/accounts", { method: "POST", body: JSON.stringify({ username, pin, accountType: role }) });
      setAccounts(data.accounts);
      setUsername("");
      setPin("");
      setRole("normal");
      setFormOpen(false);
      setNotice("Account created and ready for access.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to create account."); }
    finally { setBusy(false); }
  }

  async function updateAccount(accountId: string, action: AccountAction, extra: { pin?: string; accountType?: AccountRole } = {}) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const data = await apiRequest<{ accounts: ManagedAccount[] }>("/api/admin/accounts", { method: "PATCH", body: JSON.stringify({ accountId, action, ...extra }) });
      setAccounts(data.accounts);
      setResetPin("");
      setEditing(null);
      setDeleteTarget(null);
      setDeleteConfirmation("");
      setNotice(action === "delete" ? "Account deleted. Its audit history was retained." : action === "force_logout" ? "All active sessions were revoked." : "Account policy updated and active sessions revoked when required.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to update account."); }
    finally { setBusy(false); }
  }

  return <>
    <div className="page-heading compact-heading"><div><span className="eyebrow">{owner ? "OWNER / CONTROL" : "ADMIN / ACCOUNTS"}</span><h1>{owner ? "Owner control." : "Account administration."}</h1><p>Search, onboard, suspend, secure, and audit application identities.</p></div><span className="local-badge"><ShieldCheck size={13} /> {owner ? "LEVEL 03" : "LEVEL 02"}</span></div>
    <div className="admin-metrics"><article><Users size={17} /><div><small>TOTAL ACCOUNTS</small><strong>{accounts.length}</strong></div></article><article><UserCheck size={17} /><div><small>ACTIVE</small><strong>{activeCount}</strong></div></article><article><ShieldCheck size={17} /><div><small>PRIVILEGED</small><strong>{privilegedCount}</strong></div></article><article><Activity size={17} /><div><small>NEW / 7 DAYS</small><strong>{recentCount}</strong></div></article></div>
    <div className="owner-grid">
      <section className="content-card accounts-card owner-wide" aria-busy={loading || busy}>
        <div className="section-title"><div><span className="eyebrow">IDENTITIES</span><h2>Account controls</h2></div><span className="section-actions"><button disabled={loading} onClick={() => void loadAccounts()}><RefreshCw size={13} className={loading ? "spin" : ""} /> REFRESH</button><button onClick={() => setFormOpen((value) => !value)}><Plus size={14} /> {formOpen ? "CLOSE" : "NEW ACCOUNT"}</button></span></div>
        {formOpen && <div className="account-form"><label>USERNAME<input value={username} autoComplete="off" maxLength={32} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32))} placeholder="new-identity" /></label><label>INITIAL PIN<input value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 12))} inputMode="numeric" autoComplete="new-password" type="password" placeholder="6–12 digits" /></label><label>ROLE<select value={role} onChange={(event) => setRole(event.target.value as AccountRole)}><option value="normal">Normal</option><option value="admin">Admin</option>{owner && <option value="owner">Owner</option>}</select></label><button className="primary-button" disabled={busy || username.length < 3 || pin.length < 6} onClick={() => void createAccount()}>CREATE IDENTITY</button></div>}
        {notice && <p className="admin-notice" role="status">{notice}</p>}
        <div className="admin-filters"><label><Search size={15} /><span className="sr-only">Search accounts</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search username, role, or notes…" /></label><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} aria-label="Filter account status"><option value="all">All statuses</option><option value="active">Active</option><option value="locked">Suspended</option><option value="disabled">Disabled</option></select><span>{filtered.length} / {accounts.length}</span></div>
        <div className="account-table"><div className="account-head"><span>IDENTITY</span><span>ROLE</span><span>STATUS</span><span>LAST ACCESS</span><span>ACTIONS</span></div>{filtered.map((managed) => { const locked = Boolean(managed.lockedUntil && Date.parse(managed.lockedUntil) > Date.now()); const manageable = managed.accountType !== "owner" || owner; const isCurrent = managed.id === currentAccountId; return <Fragment key={managed.id}><div className="account-row"><span><span className="mini-avatar">{managed.username.slice(0, 2).toUpperCase()}</span><strong>{managed.username}{isCurrent && <small>YOU</small>}</strong></span><span className="role-badge">{managed.accountType.toUpperCase()}</span><span className="account-status"><i className={managed.disabled || locked ? "off" : ""} />{managed.disabled ? "DISABLED" : locked ? "SUSPENDED" : "ACTIVE"}</span><span>{managed.lastLogin ? new Date(managed.lastLogin).toLocaleDateString() : "NEVER"}</span><span className="row-actions">{manageable && <><button disabled={busy || isCurrent} onClick={() => void updateAccount(managed.id, locked ? "unlock" : "lock")}>{locked ? "RESTORE" : "SUSPEND"}</button><button disabled={busy || isCurrent} onClick={() => void updateAccount(managed.id, managed.disabled ? "enable" : "disable")}>{managed.disabled ? "ENABLE" : "DISABLE"}</button><button aria-label={`Edit ${managed.username}`} disabled={busy} onClick={() => { setEditing((value) => value === managed.id ? null : managed.id); setEditRole(managed.accountType); setResetPin(""); }}><Pencil size={12} /></button></>}</span></div>{editing === managed.id && <div className="account-editor advanced-account-editor"><div><label>ROLE<select value={editRole} onChange={(event) => setEditRole(event.target.value as AccountRole)}><option value="normal">Normal</option><option value="admin">Admin</option>{owner && <option value="owner">Owner</option>}</select></label><button disabled={busy || editRole === managed.accountType} onClick={() => void updateAccount(managed.id, "set_role", { accountType: editRole })}>APPLY ROLE</button></div><div><label>NEW PIN<input type="password" inputMode="numeric" autoComplete="new-password" value={resetPin} onChange={(event) => setResetPin(event.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="6–12 digits" /></label><button disabled={busy || resetPin.length < 6} onClick={() => void updateAccount(managed.id, "reset_pin", { pin: resetPin })}>RESET PIN</button></div><div className="account-danger-actions"><button disabled={busy || isCurrent} onClick={() => void updateAccount(managed.id, "force_logout")}><LogOut size={12} /> FORCE LOGOUT</button><button disabled={busy || isCurrent} onClick={() => { setDeleteTarget(managed); setDeleteConfirmation(""); }}><Trash2 size={12} /> DELETE</button></div><button className="editor-close" aria-label="Close account editor" onClick={() => setEditing(null)}><X size={14} /></button></div>}</Fragment>; })}{!loading && !filtered.length && <div className="empty-state"><Search size={22} /><h2>No matching accounts</h2><p>Try another search or status filter.</p></div>}</div>
      </section>
      <InvitesPanel owner={owner} />
      <section className="content-card"><div className="section-title"><div><span className="eyebrow">SECURITY</span><h2>Access posture</h2></div></div><div className="control-list"><div className="control-item"><KeyRound size={17} /><span><strong>PIN policy</strong><small>6–12 digits · bcrypt cost 12</small></span></div><div className="control-item"><LockKeyhole size={17} /><span><strong>Automatic lockout</strong><small>5 attempts · 15 minute cooldown</small></span></div><div className="control-item"><Activity size={17} /><span><strong>Audit stream</strong><small>Privileged actions recorded atomically</small></span></div></div></section>
      <section className="content-card"><div className="section-title"><div><span className="eyebrow">OPERATIONS</span><h2>Control boundaries</h2></div></div><div className="control-list"><div className="control-item"><ShieldCheck size={17} /><span><strong>Invitation onboarding</strong><small>Hashed, expiring, revocable, usage-limited</small></span></div><div className="control-item"><LogOut size={17} /><span><strong>Session intervention</strong><small>Force logout without changing credentials</small></span></div><div className="control-item"><Trash2 size={17} /><span><strong>Safe deletion</strong><small>Explicit confirmation · audit retained</small></span></div></div></section>
    </div>
    {deleteTarget && <div className="search-overlay" onMouseDown={() => setDeleteTarget(null)}><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-account-title" onMouseDown={(event) => event.stopPropagation()}><Trash2 size={23} /><h2 id="delete-account-title">Delete {deleteTarget.username}?</h2><p>This permanently removes the identity, active sessions, profile, and stored provider keys. Audit records remain.</p><label>TYPE <strong>{deleteTarget.username}</strong> TO CONFIRM<input autoFocus value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} /></label><div><button onClick={() => setDeleteTarget(null)}>CANCEL</button><button className="danger-button" disabled={deleteConfirmation !== deleteTarget.username || busy} onClick={() => void updateAccount(deleteTarget.id, "delete")}>DELETE ACCOUNT</button></div></section></div>}
  </>;
}

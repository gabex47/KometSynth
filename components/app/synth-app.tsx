"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  Boxes,
  Braces,
  ChevronRight,
  CircleUserRound,
  Command,
  Database,
  FileKey2,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  Network,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import type { SessionAccount, ToolCategory, ToolDefinition } from "@/lib/types";
import { toolCategories, tools } from "@/lib/tools/catalog";
import { ToolWorkbench } from "./tool-workbench";

type View = "dashboard" | "ai" | ToolCategory | "api-keys" | "settings" | "logs" | "admin" | "owner";

const categoryIcon = {
  developer: Braces,
  network: Network,
  security: ShieldCheck,
  utilities: Wrench,
};

const navBase = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "ai", label: "AI Sandbox", icon: Bot },
  { id: "developer", label: "Developer", icon: Braces },
  { id: "network", label: "Network", icon: Network },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "utilities", label: "Utilities", icon: Wrench },
  { id: "api-keys", label: "API Keys", icon: KeyRound },
] as const;

function displayRole(role: SessionAccount["accountType"]) {
  return role === "owner" ? "OWNER" : role.toUpperCase();
}

function ToolIcon({ tool }: { tool: ToolDefinition }) {
  const Icon = categoryIcon[tool.category];
  return <Icon size={18} strokeWidth={1.6} />;
}

function DashboardView({ account, openView, openTool }: { account: SessionAccount; openView: (view: View) => void; openTool: (tool: ToolDefinition) => void }) {
  const recents = [tools[0], tools[5], tools.find((tool) => tool.id === "hash-generator")!, tools.find((tool) => tool.id === "dns-lookup")!];
  return (
    <>
      <div className="page-heading dashboard-heading">
        <div><span className="eyebrow">WORKSPACE / OVERVIEW</span><h1>Good evening, {account.username}.</h1><p>Your private developer network is online and ready.</p></div>
        <div className="heading-status"><i /><div><strong>ALL SYSTEMS OPERATIONAL</strong><small>LAST CHECK 04s AGO</small></div></div>
      </div>

      <div className="metric-grid">
        <article className="metric-card featured-metric"><span className="metric-icon"><Zap size={18} /></span><div><small>TOOLS AVAILABLE</small><strong>{tools.length}</strong><p>Across 4 workspaces</p></div><span className="metric-trend">+8 THIS MONTH</span></article>
        <article className="metric-card"><span className="metric-icon"><Activity size={18} /></span><div><small>ACTIONS TODAY</small><strong>24</strong><p>All activity logged</p></div></article>
        <article className="metric-card"><span className="metric-icon"><FileKey2 size={18} /></span><div><small>API PROVIDERS</small><strong>03</strong><p>Keys encrypted at rest</p></div></article>
        <article className="metric-card"><span className="metric-icon"><Gauge size={18} /></span><div><small>AVG. RESPONSE</small><strong>18<em>ms</em></strong><p>Local processing</p></div></article>
      </div>

      <div className="dashboard-columns">
        <section className="content-card quick-card">
          <div className="section-title"><div><span className="eyebrow">QUICK ACCESS</span><h2>Tool workspaces</h2></div><button onClick={() => openView("developer")}>VIEW ALL <ChevronRight size={14} /></button></div>
          <div className="quick-grid">
            {toolCategories.map((category) => {
              const Icon = categoryIcon[category.id];
              const count = tools.filter((tool) => tool.category === category.id).length;
              return <button key={category.id} className="quick-item" onClick={() => openView(category.id)}><span><Icon size={19} /></span><div><strong>{category.label}</strong><small>{count} tools</small></div><ChevronRight size={16} /></button>;
            })}
          </div>
        </section>
        <section className="content-card activity-card">
          <div className="section-title"><div><span className="eyebrow">ACTIVITY</span><h2>Recent events</h2></div><button onClick={() => openView("logs")}>ALL LOGS <ChevronRight size={14} /></button></div>
          <div className="activity-list">
            <div><span className="activity-dot" /><p><strong>Session authenticated</strong><small>Current device · just now</small></p><time>NOW</time></div>
            <div><span className="activity-dot muted" /><p><strong>JSON payload formatted</strong><small>Developer / JSON Formatter</small></p><time>18:24</time></div>
            <div><span className="activity-dot muted" /><p><strong>SHA-256 hash generated</strong><small>Security / Secure Hash</small></p><time>17:02</time></div>
            <div><span className="activity-dot muted" /><p><strong>API key updated</strong><small>Provider configuration</small></p><time>14:11</time></div>
          </div>
        </section>
      </div>

      <section className="recent-section">
        <div className="section-title"><div><span className="eyebrow">RECENTLY USED</span><h2>Continue where you left off</h2></div></div>
        <div className="tool-row">
          {recents.map((tool, index) => <button className="recent-tool" key={tool.id} onClick={() => openTool(tool)}><span><ToolIcon tool={tool} /></span><div><strong>{tool.name}</strong><small>{index === 0 ? "2 MIN AGO" : index === 1 ? "3 HOURS AGO" : index === 2 ? "YESTERDAY" : "4 DAYS AGO"}</small></div><ChevronRight size={15} /></button>)}
        </div>
      </section>
    </>
  );
}

function CatalogView({ category, onOpen }: { category: ToolCategory; onOpen: (tool: ToolDefinition) => void }) {
  const [query, setQuery] = useState("");
  const definition = toolCategories.find((item) => item.id === category)!;
  const filtered = tools.filter((tool) => tool.category === category && `${tool.name} ${tool.description} ${tool.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <div className="page-heading catalog-heading"><div><span className="eyebrow">TOOLBOX / {category.toUpperCase()}</span><h1>{definition.label} tools.</h1><p>Fast, focused utilities that process data locally whenever possible.</p></div><span className="tool-count">{filtered.length.toString().padStart(2, "0")} TOOLS</span></div>
      <div className="catalog-filter"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Filter ${definition.label.toLowerCase()} tools…`} /><kbd>/</kbd></div>
      <div className="catalog-grid">
        {filtered.map((tool, index) => <button className="tool-card" key={tool.id} onClick={() => onOpen(tool)}><div className="tool-card-top"><span><ToolIcon tool={tool} /></span><small>{String(index + 1).padStart(2, "0")}</small></div><h2>{tool.name}</h2><p>{tool.description}</p><div>{tool.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}<ChevronRight size={16} /></div></button>)}
      </div>
      {!filtered.length && <div className="empty-state"><Search size={24} /><h2>No tools found</h2><p>Try a broader search term.</p></div>}
    </>
  );
}

function AISandbox() {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("Chat");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function send() {
    const value = prompt.trim();
    if (!value || loading) return;
    const next = [...messages, { role: "user" as const, content: value }];
    setMessages(next); setPrompt(""); setLoading(true); setError("");
    try {
      const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "openai", mode, messages: next }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "AI request failed.");
      setMessages([...next, { role: "assistant", content: data.content }]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "AI request failed."); }
    finally { setLoading(false); }
  }
  return <section className="ai-page">
    <div className="page-heading compact-heading"><div><span className="eyebrow">AI / SANDBOX</span><h1>Think with your tools.</h1><p>Use your own provider key. Prompts are sent directly through the secure server route.</p></div><span className="local-badge"><Sparkles size={13} /> BYOK</span></div>
    <div className="ai-layout">
      <aside className="ai-modes"><small>MODE</small>{["Chat", "Generate code", "Review code", "Explain code", "Debug code", "Rewrite", "Prompt lab"].map((item) => <button className={mode === item ? "active" : ""} key={item} onClick={() => setMode(item)}>{item}<ChevronRight size={13} /></button>)}</aside>
      <div className="chat-panel">
        <div className="chat-header"><div><span className="provider-mark">O</span><p><strong>OpenAI</strong><small>Configured key required</small></p></div><button><SlidersHorizontal size={15} /> OPTIONS</button></div>
        <div className="message-list">
          {!messages.length && <div className="chat-empty"><Bot size={28} /><h2>Start a new {mode.toLowerCase()} session</h2><p>Messages are never exposed to other SynthNet users.</p><div><button onClick={() => setPrompt("Review this function for bugs and edge cases:")}>Review code</button><button onClick={() => setPrompt("Explain this code step by step:")}>Explain code</button></div></div>}
          {messages.map((message, index) => <article className={`message ${message.role}`} key={index}><small>{message.role === "user" ? "YOU" : "SYNTH"}</small><p>{message.content}</p></article>)}
          {loading && <article className="message assistant"><small>SYNTH</small><p className="typing">Processing<span>_</span></p></article>}
        </div>
        {error && <p className="chat-error">{error}</p>}
        <div className="prompt-box"><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void send(); }} placeholder={`Ask SynthNet to ${mode.toLowerCase()}…`} /><div><span>⌘ + ENTER TO SEND</span><button onClick={send} disabled={!prompt.trim() || loading}><Command size={14} /> SEND</button></div></div>
      </div>
    </div>
  </section>;
}

function ApiKeysView() {
  const [keys, setKeys] = useState<{ id: string; provider: string; keyHint: string; updatedAt: string }[]>([]);
  const [provider, setProvider] = useState("openai");
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => { fetch("/api/api-keys").then((response) => response.ok ? response.json() : { keys: [] }).then((data) => setKeys(data.keys ?? [])); }, []);
  async function save() {
    setMessage("");
    const response = await fetch("/api/api-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, key: value }) });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error); return; }
    setKeys(data.keys); setValue(""); setMessage("Key encrypted and saved.");
  }
  return <>
    <div className="page-heading compact-heading"><div><span className="eyebrow">CONFIGURATION / SECRETS</span><h1>API keys.</h1><p>Keys are encrypted server-side and can never be retrieved through the interface.</p></div><span className="local-badge"><LockKeyhole size={13} /> ENCRYPTED</span></div>
    <div className="settings-grid">
      <section className="content-card key-form"><div className="section-title"><div><span className="eyebrow">ADD PROVIDER</span><h2>Store a new key</h2></div></div><label>PROVIDER<select value={provider} onChange={(event) => setProvider(event.target.value)}><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="gemini">Google Gemini</option></select></label><label>SECRET KEY<input type="password" autoComplete="off" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Paste provider key" /></label><button className="primary-button" disabled={value.length < 8} onClick={save}><Plus size={15} /> ENCRYPT & SAVE</button>{message && <p className="form-notice">{message}</p>}</section>
      <section className="content-card"><div className="section-title"><div><span className="eyebrow">SAVED KEYS</span><h2>Provider access</h2></div></div><div className="key-list">{keys.length ? keys.map((key) => <div key={key.id}><span className="provider-mark">{key.provider[0].toUpperCase()}</span><p><strong>{key.provider}</strong><small>{key.keyHint} · updated {new Date(key.updatedAt).toLocaleDateString()}</small></p><span className="status-chip">ACTIVE</span></div>) : <div className="inline-empty"><KeyRound size={20} /><p><strong>No keys configured</strong><small>Add a key to enable the AI Sandbox.</small></p></div>}</div></section>
    </div>
  </>;
}

function LogsView() {
  const [logs, setLogs] = useState<{ id: string; user: string; action: string; ip: string; timestamp: string }[]>([]);
  useEffect(() => { fetch("/api/logs").then((response) => response.ok ? response.json() : { logs: [] }).then((data) => setLogs(data.logs ?? [])); }, []);
  return <><div className="page-heading compact-heading"><div><span className="eyebrow">AUDIT / ACTIVITY</span><h1>Activity logs.</h1><p>An immutable view of security and workspace events.</p></div><span className="tool-count">{logs.length.toString().padStart(2, "0")} EVENTS</span></div><section className="content-card table-card"><div className="table-head"><span>EVENT</span><span>IDENTITY</span><span>NETWORK</span><span>TIME</span></div>{logs.map((log) => <div className="table-row" key={log.id}><span><i />{log.action.replaceAll("_", " ")}</span><span>{log.user}</span><span>{log.ip}</span><time>{new Date(log.timestamp).toLocaleString()}</time></div>)}{!logs.length && <div className="empty-state"><Activity size={23} /><h2>No activity yet</h2><p>New security events will appear here.</p></div>}</section></>;
}

type ManagedAccount = { id: string; username: string; accountType: "normal" | "admin" | "owner"; createdAt: string; lastLogin: string | null; lockedUntil: string | null; disabled: boolean; notes: string | null };

function AdminView({ owner = false }: { owner?: boolean }) {
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<ManagedAccount["accountType"]>("normal");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetch("/api/admin/accounts").then((response) => response.ok ? response.json() : { accounts: [] }).then((data) => setAccounts(data.accounts ?? [])); }, []);

  async function createAccount() {
    setBusy(true); setNotice("");
    const response = await fetch("/api/admin/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, pin, accountType: role }) });
    const data = await response.json();
    if (response.ok) { setAccounts(data.accounts); setUsername(""); setPin(""); setRole("normal"); setFormOpen(false); setNotice("Account created and ready for access."); }
    else setNotice(data.error || "Unable to create account.");
    setBusy(false);
  }

  async function updateAccount(accountId: string, action: "lock" | "unlock" | "disable" | "enable") {
    setBusy(true); setNotice("");
    const response = await fetch("/api/admin/accounts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId, action }) });
    const data = await response.json();
    if (response.ok) { setAccounts(data.accounts); setNotice("Account policy updated."); }
    else setNotice(data.error || "Unable to update account.");
    setBusy(false);
  }

  return <>
    <div className="page-heading compact-heading"><div><span className="eyebrow">{owner ? "OWNER / CONTROL" : "ADMIN / ACCOUNTS"}</span><h1>{owner ? "Owner control." : "Account administration."}</h1><p>{owner ? "System-wide configuration and protected operations." : "Manage access without exposing credentials or secrets."}</p></div><span className="local-badge"><ShieldCheck size={13} /> {owner ? "LEVEL 03" : "LEVEL 02"}</span></div>
    <div className="owner-grid">
      <section className="content-card accounts-card owner-wide">
        <div className="section-title"><div><span className="eyebrow">IDENTITIES</span><h2>Account controls</h2></div><button onClick={() => setFormOpen((current) => !current)}><Plus size={14} /> {formOpen ? "CLOSE" : "NEW ACCOUNT"}</button></div>
        {formOpen && <div className="account-form"><label>USERNAME<input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32))} placeholder="new-identity" /></label><label>INITIAL PIN<input value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 12))} inputMode="numeric" type="password" placeholder="6–12 digits" /></label><label>ROLE<select value={role} onChange={(event) => setRole(event.target.value as ManagedAccount["accountType"])}><option value="normal">Normal</option><option value="admin">Admin</option>{owner && <option value="owner">Owner</option>}</select></label><button className="primary-button" disabled={busy || username.length < 3 || pin.length < 6} onClick={createAccount}>CREATE IDENTITY</button></div>}
        {notice && <p className="admin-notice">{notice}</p>}
        <div className="account-table"><div className="account-head"><span>IDENTITY</span><span>ROLE</span><span>STATUS</span><span>LAST ACCESS</span><span>ACTIONS</span></div>{accounts.map((managed) => { const locked = Boolean(managed.lockedUntil && Date.parse(managed.lockedUntil) > Date.now()); return <div className="account-row" key={managed.id}><span><span className="mini-avatar">{managed.username.slice(0, 2).toUpperCase()}</span><strong>{managed.username}</strong></span><span className="role-badge">{managed.accountType.toUpperCase()}</span><span className="account-status"><i className={managed.disabled || locked ? "off" : ""} />{managed.disabled ? "DISABLED" : locked ? "LOCKED" : "ACTIVE"}</span><span>{managed.lastLogin ? new Date(managed.lastLogin).toLocaleDateString() : "NEVER"}</span><span className="row-actions">{managed.accountType !== "owner" && <><button disabled={busy} onClick={() => updateAccount(managed.id, locked ? "unlock" : "lock")}>{locked ? "UNLOCK" : "LOCK"}</button><button disabled={busy} onClick={() => updateAccount(managed.id, managed.disabled ? "enable" : "disable")}>{managed.disabled ? "ENABLE" : "DISABLE"}</button></>}</span></div>; })}</div>
      </section>
      <section className="content-card"><div className="section-title"><div><span className="eyebrow">SECURITY</span><h2>Access posture</h2></div></div><div className="control-list"><button><KeyRound size={17} /><span><strong>PIN policy</strong><small>6–12 digits · bcrypt cost 12</small></span><ChevronRight size={15} /></button><button><LockKeyhole size={17} /><span><strong>Automatic lockout</strong><small>5 attempts · 15 minute cooldown</small></span><ChevronRight size={15} /></button><button><Activity size={17} /><span><strong>Audit stream</strong><small>Every privileged action recorded</small></span><ChevronRight size={15} /></button></div></section>
      <section className="content-card"><div className="section-title"><div><span className="eyebrow">SYSTEM</span><h2>{owner ? "Platform controls" : "Security overview"}</h2></div></div><div className="control-list">{owner && <button><Database size={17} /><span><strong>Data export</strong><small>Use provider-managed encrypted backups</small></span><ChevronRight size={15} /></button>}<button><Activity size={17} /><span><strong>Audit integrity</strong><small>Database-enforced append only records</small></span><ChevronRight size={15} /></button><button><Boxes size={17} /><span><strong>Feature flags</strong><small>{owner ? "Manage workspace availability" : "View system availability"}</small></span><ChevronRight size={15} /></button></div></section>
      {owner && <section className="content-card owner-wide"><div className="section-title"><div><span className="eyebrow">SERVICE STATE</span><h2>System management</h2></div><span className="status-chip">OPERATIONAL</span></div><div className="system-stats"><div><small>DATABASE</small><strong>CONNECTED</strong><span>Supabase primary</span></div><div><small>MAINTENANCE</small><strong>DISABLED</strong><span>Normal operation</span></div><div><small>ACTIVE FLAGS</small><strong>05 / 05</strong><span>All modules enabled</span></div><div><small>BACKUPS</small><strong>PROVIDER</strong><span>Supabase managed</span></div></div></section>}
    </div>
  </>;
}

function SettingsView({ account }: { account: SessionAccount }) {
  return <><div className="page-heading compact-heading"><div><span className="eyebrow">ACCOUNT / PREFERENCES</span><h1>Settings.</h1><p>Personalize your workspace and review session security.</p></div></div><div className="settings-grid"><section className="content-card profile-card"><div className="profile-avatar">{account.username.slice(0, 2).toUpperCase()}</div><div><small>IDENTITY</small><h2>{account.username}</h2><span className="role-badge">{displayRole(account.accountType)}</span></div></section><section className="content-card"><div className="section-title"><div><span className="eyebrow">SECURITY</span><h2>Current session</h2></div></div><div className="session-info"><p><span>Authenticated</span><strong>Current browser</strong></p><p><span>Session policy</span><strong>12 hours · HTTP only</strong></p><p><span>Last login</span><strong>{account.lastLogin ? new Date(account.lastLogin).toLocaleString() : "First session"}</strong></p></div></section></div></>;
}

function GlobalSearch({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (tool: ToolDefinition) => void }) {
  const [query, setQuery] = useState("");
  useEffect(() => { if (!open) setQuery(""); }, [open]);
  if (!open) return null;
  const results = tools.filter((tool) => `${tool.name} ${tool.description} ${tool.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8);
  return <div className="search-overlay" onMouseDown={onClose}><section className="command-palette" onMouseDown={(event) => event.stopPropagation()}><div className="command-input"><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tools, settings, logs…" /><button onClick={onClose}>ESC</button></div><small className="command-label">{query ? `${results.length} RESULTS` : "SUGGESTED TOOLS"}</small><div className="command-results">{results.map((tool) => <button key={tool.id} onClick={() => { onSelect(tool); onClose(); }}><span><ToolIcon tool={tool} /></span><p><strong>{tool.name}</strong><small>{tool.category} · {tool.description}</small></p><kbd>↵</kbd></button>)}</div><footer><span>↑↓ NAVIGATE</span><span>↵ OPEN</span><span>ESC CLOSE</span></footer></section></div>;
}

export function SynthApp({ account }: { account: SessionAccount }) {
  const [view, setView] = useState<View>("dashboard");
  const [selectedTool, setSelectedTool] = useState<ToolDefinition | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const canAdmin = account.accountType === "admin" || account.accountType === "owner";
  const isOwner = account.accountType === "owner";
  const nav = useMemo(() => [...navBase, { id: "settings" as const, label: "Settings", icon: Settings }, { id: "logs" as const, label: "Logs", icon: Activity }], []);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen((current) => !current); }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener);
  }, []);

  function navigate(next: View) { setView(next); setSelectedTool(null); setMobileOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function openTool(tool: ToolDefinition) { setView(tool.category); setSelectedTool(tool); window.scrollTo({ top: 0, behavior: "smooth" }); }
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/"); }

  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="sidebar-brand"><Link className="brand" href="/" onClick={(event) => { event.preventDefault(); navigate("dashboard"); }}><span className="brand-mark">S</span><span>SYNTHNET</span></Link><button className="mobile-close" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
      <div className="network-card"><div><span className="network-pulse"><i /></span><p><strong>PRIVATE NETWORK</strong><small>NODE // {account.id.slice(0, 6).toUpperCase()}</small></p></div><small>SECURE</small></div>
      <nav aria-label="Primary navigation"><span className="nav-label">WORKSPACE</span>{navBase.map((item) => { const Icon = item.icon; return <button key={item.id} className={!selectedTool && view === item.id ? "active" : ""} onClick={() => navigate(item.id)}><Icon size={16} /><span>{item.label}</span>{item.id === "ai" && <i>NEW</i>}</button>; })}<span className="nav-label nav-space">SYSTEM</span>{nav.slice(navBase.length).map((item) => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)}><Icon size={16} /><span>{item.label}</span></button>; })}{canAdmin && <button className={view === "admin" ? "active" : ""} onClick={() => navigate("admin")}><Users size={16} /><span>Admin</span></button>}{isOwner && <button className={view === "owner" ? "active owner-nav" : "owner-nav"} onClick={() => navigate("owner")}><ShieldCheck size={16} /><span>Owner</span><i>03</i></button>}</nav>
      <div className="sidebar-account"><div className="avatar">{account.username.slice(0, 2).toUpperCase()}</div><p><strong>{account.username}</strong><small>{displayRole(account.accountType)}</small></p><button onClick={logout} aria-label="Log out"><LogOut size={16} /></button></div>
    </aside>
    {mobileOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <div className="app-main">
      <header className="topbar"><button className="menu-button" onClick={() => setMobileOpen(true)}><Menu size={19} /></button><div className="breadcrumb"><span>SYNTHNET</span><i>/</i><strong>{selectedTool?.name ?? (view === "ai" ? "AI SANDBOX" : view.replace("-", " ").toUpperCase())}</strong></div><div className="topbar-actions"><button className="search-button" onClick={() => setSearchOpen(true)}><Search size={15} /><span>Search anything…</span><kbd>⌘ K</kbd></button><span className="role-badge">{displayRole(account.accountType)}</span><button className="user-button" onClick={() => navigate("settings")}><CircleUserRound size={18} /><span>{account.username}</span></button></div></header>
      <main className="app-content">
        {selectedTool ? <ToolWorkbench tool={selectedTool} onBack={() => setSelectedTool(null)} /> : view === "dashboard" ? <DashboardView account={account} openView={navigate} openTool={openTool} /> : view === "ai" ? <AISandbox /> : ["developer", "network", "security", "utilities"].includes(view) ? <CatalogView category={view as ToolCategory} onOpen={openTool} /> : view === "api-keys" ? <ApiKeysView /> : view === "logs" ? <LogsView /> : view === "admin" && canAdmin ? <AdminView /> : view === "owner" && isOwner ? <AdminView owner /> : <SettingsView account={account} />}
      </main>
      <footer className="app-footer"><span>© 2026 SYNTHNET</span><span><i /> SYSTEM ONLINE</span><span>BUILD 1.0.0</span></footer>
    </div>
    <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={openTool} />
  </div>;
}

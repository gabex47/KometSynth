"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Activity,
  Bot,
  Braces,
  ChevronRight,
  CircleUserRound,
  FileKey2,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import type { SessionAccount, ToolCategory, ToolDefinition } from "@/lib/types";
import { apiRequest } from "@/lib/client/api";
import { toolCategories, tools } from "@/lib/tools/catalog";
import { ThemeToggle } from "./theme-toggle";

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

const navSystem = [
  { id: "settings", label: "Settings", icon: Settings },
  { id: "logs", label: "Logs", icon: Activity },
] as const;

const categoryCounts = Object.fromEntries(
  toolCategories.map((category) => [category.id, tools.filter((tool) => tool.category === category.id).length]),
) as Record<ToolCategory, number>;

function LoadingView() {
  return <div className="empty-state" role="status"><h2>Loading workspace…</h2></div>;
}

const ToolWorkbench = dynamic(() => import("./tool-workbench").then((module) => module.ToolWorkbench), { loading: LoadingView });
const AISandbox = dynamic(() => import("./views/ai-sandbox").then((module) => module.AISandbox), { loading: LoadingView });
const ApiKeysView = dynamic(() => import("./views/api-keys-view").then((module) => module.ApiKeysView), { loading: LoadingView });
const LogsView = dynamic(() => import("./views/logs-view").then((module) => module.LogsView), { loading: LoadingView });
const AdminView = dynamic(() => import("./views/admin-view").then((module) => module.AdminView), { loading: LoadingView });
const SettingsView = dynamic(() => import("./views/settings-view").then((module) => module.SettingsView), { loading: LoadingView });

function displayRole(role: SessionAccount["accountType"]) {
  return role === "owner" ? "OWNER" : role.toUpperCase();
}

function ToolIcon({ tool }: { tool: ToolDefinition }) {
  const Icon = categoryIcon[tool.category];
  return <Icon size={18} strokeWidth={1.6} />;
}

type DashboardSummary = {
  configuredProviders: number;
  eventsToday: number;
  activeSessions: number;
  recentActivity: { id: string; user: string; action: string; timestamp: string }[];
};

function DashboardView({ account, openView, openTool }: { account: SessionAccount; openView: (view: View) => void; openTool: (tool: ToolDefinition) => void }) {
  const featured = [tools[0], tools[5], tools.find((tool) => tool.id === "hash-generator")!, tools.find((tool) => tool.id === "dns-lookup")!];
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryError, setSummaryError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<{ summary: DashboardSummary }>("/api/dashboard", { signal: controller.signal })
      .then((data) => setSummary(data.summary))
      .catch((error) => {
        if (error.name !== "AbortError") setSummaryError(error.message);
      });
    return () => controller.abort();
  }, []);

  return <>
    <div className="page-heading dashboard-heading">
      <div><span className="eyebrow">WORKSPACE / OVERVIEW</span><h1>Welcome back, {account.username}.</h1><p>Your private developer workspace is ready.</p></div>
      <div className="heading-status"><i /><div><strong>SECURITY CONTROLS ACTIVE</strong><small>AUTHENTICATED SESSION</small></div></div>
    </div>
    <div className="metric-grid">
      <article className="metric-card featured-metric"><span className="metric-icon"><Zap size={18} /></span><div><small>TOOLS REGISTERED</small><strong>{tools.length}</strong><p>Across 4 workspaces</p></div><span className="metric-trend">CATALOG</span></article>
      <article className="metric-card"><span className="metric-icon"><FileKey2 size={18} /></span><div><small>API PROVIDERS</small><strong>{summary?.configuredProviders ?? "—"}</strong><p>Keys encrypted at rest</p></div></article>
      <article className="metric-card"><span className="metric-icon"><Activity size={18} /></span><div><small>EVENTS TODAY</small><strong>{summary?.eventsToday ?? "—"}</strong><p>{account.accountType === "normal" ? "Your audit stream" : "Authorized audit scope"}</p></div></article>
      <article className="metric-card"><span className="metric-icon"><Gauge size={18} /></span><div><small>ACTIVE SESSIONS</small><strong>{summary?.activeSessions ?? "—"}</strong><p>Current identity</p></div></article>
    </div>
    <div className="dashboard-columns">
      <section className="content-card quick-card">
        <div className="section-title"><div><span className="eyebrow">QUICK ACCESS</span><h2>Tool workspaces</h2></div><button onClick={() => openView("developer")}>VIEW ALL <ChevronRight size={14} /></button></div>
        <div className="quick-grid">{toolCategories.map((category) => { const Icon = categoryIcon[category.id]; return <button key={category.id} className="quick-item" onClick={() => openView(category.id)}><span><Icon size={19} /></span><div><strong>{category.label}</strong><small>{categoryCounts[category.id]} tools</small></div><ChevronRight size={16} /></button>; })}</div>
      </section>
      <section className="content-card activity-card" aria-busy={!summary && !summaryError}>
        <div className="section-title"><div><span className="eyebrow">LIVE AUDIT</span><h2>Recent activity</h2></div><button onClick={() => openView("logs")}>AUDIT LOG <ChevronRight size={14} /></button></div>
        <div className="activity-list">{summary?.recentActivity.length ? summary.recentActivity.slice(0, 3).map((event) => <div key={event.id}><span className="activity-dot" /><p><strong>{event.action.replaceAll("_", " ")}</strong><small>{event.user} · {new Date(event.timestamp).toLocaleString()}</small></p><span className="status-chip">RECORDED</span></div>) : <div><span className="activity-dot muted" /><p><strong>{summaryError ? "Live summary unavailable" : "Loading live activity"}</strong><small>{summaryError || "Checking the protected audit stream…"}</small></p><span className="status-chip">{summaryError ? "RETRY" : "SYNC"}</span></div>}</div>
      </section>
    </div>
    <section className="recent-section">
      <div className="section-title"><div><span className="eyebrow">FEATURED</span><h2>Useful starting points</h2></div></div>
      <div className="tool-row">{featured.map((tool) => <button className="recent-tool" key={tool.id} onClick={() => openTool(tool)}><span><ToolIcon tool={tool} /></span><div><strong>{tool.name}</strong><small>{tool.category.toUpperCase()}</small></div><ChevronRight size={15} /></button>)}</div>
    </section>
  </>;
}

function CatalogView({ category, onOpen }: { category: ToolCategory; onOpen: (tool: ToolDefinition) => void }) {
  const [query, setQuery] = useState("");
  const definition = toolCategories.find((item) => item.id === category)!;
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return tools.filter((tool) => tool.category === category && (!normalized || `${tool.name} ${tool.description} ${tool.tags.join(" ")}`.toLowerCase().includes(normalized)));
  }, [category, query]);
  return <>
    <div className="page-heading catalog-heading"><div><span className="eyebrow">TOOLBOX / {category.toUpperCase()}</span><h1>{definition.label} tools.</h1><p>Fast, focused utilities that process data locally whenever possible.</p></div><span className="tool-count">{filtered.length.toString().padStart(2, "0")} TOOLS</span></div>
    <label className="catalog-filter"><Search size={16} /><span className="sr-only">Filter {definition.label} tools</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Filter ${definition.label.toLowerCase()} tools…`} /><kbd>/</kbd></label>
    <div className="catalog-grid">{filtered.map((tool, index) => <button className="tool-card" key={tool.id} onClick={() => onOpen(tool)}><div className="tool-card-top"><span><ToolIcon tool={tool} /></span><small>{String(index + 1).padStart(2, "0")}</small></div><h2>{tool.name}</h2><p>{tool.description}</p><div>{tool.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}<ChevronRight size={16} /></div></button>)}</div>
    {!filtered.length && <div className="empty-state"><Search size={24} /><h2>No tools found</h2><p>Try a broader search term.</p></div>}
  </>;
}

function GlobalSearch({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (tool: ToolDefinition) => void }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return tools.filter((tool) => !normalized || `${tool.name} ${tool.description} ${tool.tags.join(" ")}`.toLowerCase().includes(normalized)).slice(0, 8);
  }, [query]);

  useEffect(() => {
    if (open) setActiveIndex(0);
    else setQuery("");
  }, [open]);

  if (!open) return null;
  function select(tool: ToolDefinition) { onSelect(tool); onClose(); }
  return <div className="search-overlay" onMouseDown={onClose}><section className="command-palette" role="dialog" aria-modal="true" aria-labelledby="search-title" onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((current) => Math.min(results.length - 1, current + 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((current) => Math.max(0, current - 1)); }
    if (event.key === "Enter" && results[activeIndex]) { event.preventDefault(); select(results[activeIndex]); }
  }}><h2 id="search-title" className="sr-only">Search tools</h2><div className="command-input"><Search size={18} /><input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} aria-activedescendant={results[activeIndex] ? `search-result-${results[activeIndex].id}` : undefined} placeholder="Search tools…" /><button onClick={onClose}>ESC</button></div><small className="command-label">{query ? `${results.length} RESULTS` : "SUGGESTED TOOLS"}</small><div className="command-results">{results.map((tool, index) => <button id={`search-result-${tool.id}`} className={index === activeIndex ? "active" : ""} key={tool.id} onMouseEnter={() => setActiveIndex(index)} onClick={() => select(tool)}><span><ToolIcon tool={tool} /></span><p><strong>{tool.name}</strong><small>{tool.category} · {tool.description}</small></p><kbd>↵</kbd></button>)}</div><footer><span>↑↓ NAVIGATE</span><span>↵ OPEN</span><span>ESC CLOSE</span></footer></section></div>;
}

export function SynthApp({ account }: { account: SessionAccount }) {
  const [view, setView] = useState<View>("dashboard");
  const [selectedTool, setSelectedTool] = useState<ToolDefinition | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const canAdmin = account.accountType === "admin" || account.accountType === "owner";
  const isOwner = account.accountType === "owner";

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen((current) => !current); }
      if (event.key === "Escape") { setSearchOpen(false); setMobileOpen(false); }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  function navigate(next: View) { setView(next); setSelectedTool(null); setMobileOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function openTool(tool: ToolDefinition) { setView(tool.category); setSelectedTool(tool); setMobileOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }
  async function logout() {
    try { await apiRequest<{ loggedOut: boolean }>("/api/auth/logout", { method: "POST" }); }
    finally { window.location.assign("/"); }
  }

  return <div className="app-shell">
    <aside id="primary-sidebar" className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="sidebar-brand"><Link className="brand" href="/" onClick={(event) => { event.preventDefault(); navigate("dashboard"); }}><span className="brand-mark" aria-hidden="true">S</span><span>SYNTHNET</span></Link><button className="mobile-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
      <div className="network-card"><div><span className="network-pulse"><i /></span><p><strong>PRIVATE NETWORK</strong><small>NODE // {account.id.slice(0, 6).toUpperCase()}</small></p></div><small>SECURE</small></div>
      <nav aria-label="Primary navigation"><span className="nav-label">WORKSPACE</span>{navBase.map((item) => { const Icon = item.icon; return <button key={item.id} aria-current={!selectedTool && view === item.id ? "page" : undefined} className={!selectedTool && view === item.id ? "active" : ""} onClick={() => navigate(item.id)}><Icon size={16} /><span>{item.label}</span></button>; })}<span className="nav-label nav-space">SYSTEM</span>{navSystem.map((item) => { const Icon = item.icon; return <button key={item.id} aria-current={view === item.id ? "page" : undefined} className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)}><Icon size={16} /><span>{item.label}</span></button>; })}{canAdmin && <button className={view === "admin" ? "active" : ""} aria-current={view === "admin" ? "page" : undefined} onClick={() => navigate("admin")}><Users size={16} /><span>Admin</span></button>}{isOwner && <button className={view === "owner" ? "active owner-nav" : "owner-nav"} aria-current={view === "owner" ? "page" : undefined} onClick={() => navigate("owner")}><ShieldCheck size={16} /><span>Owner</span><i>03</i></button>}</nav>
      <div className="sidebar-account"><div className="avatar">{account.username.slice(0, 2).toUpperCase()}</div><p><strong>{account.username}</strong><small>{displayRole(account.accountType)}</small></p><button onClick={() => void logout()} aria-label="Log out"><LogOut size={16} /></button></div>
    </aside>
    {mobileOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <div className="app-main">
      <header className="topbar"><button className="menu-button" aria-label="Open navigation" aria-controls="primary-sidebar" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><Menu size={19} /></button><div className="breadcrumb"><span>SYNTHNET</span><i>/</i><strong>{selectedTool?.name ?? (view === "ai" ? "AI SANDBOX" : view.replace("-", " ").toUpperCase())}</strong></div><div className="topbar-actions"><button className="search-button" onClick={() => setSearchOpen(true)}><Search size={15} /><span>Search tools…</span><kbd>⌘ K</kbd></button><ThemeToggle /><span className="role-badge">{displayRole(account.accountType)}</span><button className="user-button" onClick={() => navigate("settings")}><CircleUserRound size={18} /><span>{account.username}</span></button></div></header>
      <main className="app-content">
        {selectedTool ? <ToolWorkbench tool={selectedTool} onBack={() => setSelectedTool(null)} /> : view === "dashboard" ? <DashboardView account={account} openView={navigate} openTool={openTool} /> : view === "ai" ? <AISandbox /> : ["developer", "network", "security", "utilities"].includes(view) ? <CatalogView category={view as ToolCategory} onOpen={openTool} /> : view === "api-keys" ? <ApiKeysView /> : view === "logs" ? <LogsView /> : view === "admin" && canAdmin ? <AdminView currentAccountId={account.id} /> : view === "owner" && isOwner ? <AdminView owner currentAccountId={account.id} /> : <SettingsView account={account} />}
      </main>
      <footer className="app-footer"><span>© 2026 SYNTHNET</span><span><i /> AUTHENTICATED</span><span>BUILD 1.0.0</span></footer>
    </div>
    <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={openTool} />
  </div>;
}

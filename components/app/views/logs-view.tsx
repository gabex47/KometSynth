"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw, Search } from "lucide-react";
import { apiRequest } from "@/lib/client/api";

type ActivityLog = { id: string; user: string; action: string; ip: string; timestamp: string };
type LogPage = { logs: ActivityLog[]; nextCursor: string | null };

export function LogsView() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async (nextCursor: string | null, replace: boolean, signal?: AbortSignal) => {
    const suffix = nextCursor ? `?cursor=${encodeURIComponent(nextCursor)}` : "";
    const data = await apiRequest<LogPage>(`/api/logs${suffix}`, { signal });
    setLogs((current) => replace ? data.logs : [...current, ...data.logs]);
    setCursor(data.nextCursor);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(null, true, controller.signal)
      .catch((caught) => {
        if (caught.name !== "AbortError") setError(caught.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? logs.filter((log) => `${log.action} ${log.user} ${log.ip}`.toLowerCase().includes(normalized))
      : logs;
  }, [logs, query]);

  async function refresh() {
    setLoading(true);
    setError("");
    try { await load(null, true); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to refresh activity."); }
    finally { setLoading(false); }
  }

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try { await load(cursor, false); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load more activity."); }
    finally { setLoadingMore(false); }
  }

  return <><div className="page-heading compact-heading"><div><span className="eyebrow">AUDIT / ACTIVITY</span><h1>Activity logs.</h1><p>A cursor-paginated, server-authorized view of security and workspace events.</p></div><button className="local-badge action-badge" disabled={loading} onClick={() => void refresh()}><RefreshCw size={13} className={loading ? "spin" : ""} /> REFRESH</button></div><label className="catalog-filter log-filter"><Search size={16} /><span className="sr-only">Filter loaded activity</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter loaded events…" /><span>{filtered.length} / {logs.length}</span></label>{error && <p className="admin-notice" role="alert">{error}</p>}<section className="content-card table-card" aria-busy={loading || loadingMore}><div className="table-head"><span>EVENT</span><span>IDENTITY</span><span>NETWORK</span><span>TIME</span></div>{filtered.map((log) => <div className="table-row" key={log.id}><span><i />{log.action.replaceAll("_", " ")}</span><span>{log.user}</span><span>{log.ip}</span><time dateTime={log.timestamp}>{new Date(log.timestamp).toLocaleString()}</time></div>)}{loading && !logs.length && <div className="empty-state"><h2>Loading activity…</h2></div>}{!loading && !filtered.length && <div className="empty-state"><Activity size={23} /><h2>{query ? "No matching activity" : "No activity yet"}</h2><p>{query ? "Try a broader filter." : "New security events will appear here."}</p></div>}{cursor && !query && <button className="load-more" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "LOADING…" : "LOAD MORE EVENTS"}</button>}</section></>;
}

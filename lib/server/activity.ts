import "server-only";

import type { SessionContext } from "@/lib/server/auth";
import { demoStore, isDemoMode } from "@/lib/server/demo-store";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export type ActivityLog = {
  id: string;
  user: string;
  action: string;
  ip: string;
  timestamp: string;
};

export type DashboardSummary = {
  configuredProviders: number;
  eventsToday: number;
  activeSessions: number;
  recentActivity: Omit<ActivityLog, "ip">[];
};

export type ActivityCursor = { timestamp: string; id: string };

function visibleDemoLogs(context: SessionContext) {
  const logs = context.account.accountType === "normal"
    ? demoStore.logs.filter((log) => log.user === context.account.username)
    : demoStore.logs;
  return [...logs].sort((left, right) => (
    right.timestamp.localeCompare(left.timestamp) || right.id.localeCompare(left.id)
  ));
}

export async function getDashboardSummary(context: SessionContext): Promise<DashboardSummary> {
  if (isDemoMode()) {
    const logs = visibleDemoLogs(context);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return {
      configuredProviders: demoStore.apiKeys.filter((key) => key.userId === context.account.id).length,
      eventsToday: logs.filter((log) => Date.parse(log.timestamp) >= today.getTime()).length,
      activeSessions: [...demoStore.sessions.values()].filter((session) => (
        session.accountId === context.account.id && session.expiresAt > Date.now()
      )).length,
      recentActivity: logs.slice(0, 5).map((log) => ({
        id: log.id,
        user: log.user,
        action: log.action,
        timestamp: log.timestamp,
      })),
    };
  }

  const { data, error } = await getSupabaseAdmin().rpc("get_dashboard_summary", {
    p_actor_session_hash: context.tokenHash,
  });
  if (error) throw new Error("Unable to load dashboard summary.");
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new Error("Dashboard summary was unavailable.");

  const recent = Array.isArray(result.recent_activity) ? result.recent_activity : [];
  return {
    configuredProviders: Number(result.configured_providers),
    eventsToday: Number(result.events_today),
    activeSessions: Number(result.active_sessions),
    recentActivity: recent.flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const event = value as Record<string, unknown>;
      return typeof event.id === "string"
        && typeof event.user === "string"
        && typeof event.action === "string"
        && typeof event.timestamp === "string"
        ? [{ id: event.id, user: event.user, action: event.action, timestamp: event.timestamp }]
        : [];
    }),
  };
}

export async function getActivityPage(
  context: SessionContext,
  cursor: ActivityCursor | null,
  pageSize = 30,
) {
  const requestSize = pageSize + 1;
  let rows: ActivityLog[];

  if (isDemoMode()) {
    const logs = visibleDemoLogs(context);
    const start = cursor
      ? logs.findIndex((log) => log.timestamp < cursor.timestamp || (
        log.timestamp === cursor.timestamp && log.id < cursor.id
      ))
      : 0;
    rows = start < 0 ? [] : logs.slice(start, start + requestSize);
  } else {
    const { data, error } = await getSupabaseAdmin().rpc("get_activity_page", {
      p_actor_session_hash: context.tokenHash,
      p_before_timestamp: cursor?.timestamp ?? null,
      p_before_id: cursor?.id ?? null,
      p_limit: requestSize,
    });
    if (error) throw new Error("Unable to load activity logs.");
    rows = (data ?? []).map((log) => ({
      id: log.id,
      user: log.user,
      action: log.action,
      ip: log.ip,
      timestamp: log.timestamp,
    }));
  }

  const hasMore = rows.length > pageSize;
  const logs = rows.slice(0, pageSize);
  const last = logs.at(-1);
  return {
    logs,
    nextCursor: hasMore && last ? { timestamp: last.timestamp, id: last.id } : null,
  };
}

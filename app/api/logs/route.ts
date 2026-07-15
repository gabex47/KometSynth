import { getCurrentSession } from "@/lib/server/auth";
import { demoStore, isDemoMode } from "@/lib/server/demo-store";
import { apiError, apiOk } from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export async function GET() {
  const account = await getCurrentSession();
  if (!account) return apiError("Authentication required.", 401);
  try {
    if (isDemoMode()) {
      const logs = (account.accountType === "normal" ? demoStore.logs.filter((log) => log.user === account.username) : demoStore.logs).slice(0, 100);
      return apiOk({ logs });
    }
    let query = getSupabaseAdmin().from("activity_logs").select("id, user, action, ip, timestamp").order("timestamp", { ascending: false }).limit(100);
    if (account.accountType === "normal") query = query.eq("user", account.username);
    const { data, error } = await query;
    if (error) throw error;
    return apiOk({ logs: data ?? [] });
  } catch {
    return apiError("Unable to load activity logs.", 500);
  }
}

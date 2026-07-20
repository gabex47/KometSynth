import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getServerEnvironment, hasUsableSupabaseConfig, isServiceRoleKey } from "@/lib/server/env";

let client: SupabaseClient<Database> | null = null;

export function hasSupabaseConfig() {
  return hasUsableSupabaseConfig();
}

export function getSupabaseAdmin() {
  const environment = getServerEnvironment();
  const supabaseUrl = environment.SUPABASE_URL;
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey || !isServiceRoleKey(serviceRoleKey)) {
    throw new Error("A valid server-only Supabase service-role key is required.");
  }

  if (!client) {
    client = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { "X-Client-Info": "synthnet-server" } },
        db: { schema: "public" },
      },
    );
  }

  return client;
}

import "server-only";

import { z } from "zod";

const optionalUrl = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().url().optional(),
);

const environmentSchema = z.object({
  SUPABASE_URL: optionalUrl,
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  API_KEY_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
  SYNTHNET_DEMO_MODE: z.enum(["true", "false"]).default("false"),
  APP_ORIGIN: optionalUrl,
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
});

export type ServerEnvironment = z.infer<typeof environmentSchema>;

let cachedEnvironment: ServerEnvironment | null = null;

function jwtRole(key: string) {
  if (!key.includes(".")) return null;
  try {
    const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

export function isServiceRoleKey(key: string | undefined) {
  if (!key) return false;
  return key.startsWith("sb_secret_") || jwtRole(key) === "service_role";
}

export function hasUsableSupabaseConfig() {
  return Boolean(
    process.env.SUPABASE_URL
    && isServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
}

export function getServerEnvironment() {
  if (cachedEnvironment) return cachedEnvironment;

  const parsed = environmentSchema.safeParse(process.env);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "environment"))];
    throw new Error(`Invalid server environment: ${fields.join(", ")}.`);
  }

  if (parsed.data.SYNTHNET_DEMO_MODE === "true" && process.env.NODE_ENV === "production") {
    throw new Error("SYNTHNET_DEMO_MODE cannot be enabled in production.");
  }

  cachedEnvironment = parsed.data;
  return cachedEnvironment;
}

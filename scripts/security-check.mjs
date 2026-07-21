import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const root = process.cwd();
const sourceRoots = ["app", "components", "lib"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const failures = [];

function walk(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const sourceFiles = sourceRoots.flatMap(walk).filter((path) => sourceExtensions.has(extname(path)));

for (const path of sourceFiles) {
  const content = readFileSync(join(root, path), "utf8");
  const clientModule = /^\s*["']use client["'];/m.test(content);
  if (clientModule && /SUPABASE_SERVICE_ROLE_KEY|API_KEY_ENCRYPTION_KEY/.test(content)) {
    failures.push(`${path}: client module references a server-only secret name`);
  }
  if (/\bNEXT_PUBLIC_(?:SUPABASE_SERVICE_ROLE_KEY|API_KEY_ENCRYPTION_KEY)\b/.test(content)) {
    failures.push(`${path}: server-only secret is exposed through NEXT_PUBLIC_`);
  }
}

for (const directory of [...sourceRoots, "scripts", "supabase"]) {
  for (const path of walk(directory)) {
    if (statSync(join(root, path)).isFile() && / \d+(?=\.[^.]+$)/.test(path)) {
      failures.push(`${path}: numbered duplicate source file detected`);
    }
  }
}

const lifecyclePath = "supabase/migrations/20260721112639_account_lifecycle.sql";
const lifecycle = readFileSync(join(root, lifecyclePath), "utf8").toLowerCase();
const lifecycleRequirements = [
  "alter table public.account_profiles enable row level security",
  "alter table public.registration_invites enable row level security",
  "revoke all on table public.account_profiles from public, anon, authenticated",
  "revoke all on table public.registration_invites from public, anon, authenticated",
  "revoke all on function public.register_account(text, text, text, text) from public, anon, authenticated",
  "grant execute on function public.register_account(text, text, text, text) to service_role",
];

for (const requirement of lifecycleRequirements) {
  if (!lifecycle.includes(requirement)) failures.push(`${lifecyclePath}: missing ${requirement}`);
}

if (failures.length) {
  console.error("Security guardrails failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Security guardrails passed (${sourceFiles.length} source files checked).`);
}

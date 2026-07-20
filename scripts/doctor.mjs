import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const results = [];
const values = {};

function parseEnvironmentFile(path) {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
}

function report(level, label, message) {
  results.push({ level, label, message });
}

function jwtRole(key) {
  if (!key?.includes(".")) return null;
  try {
    const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

parseEnvironmentFile(resolve(".env"));
parseEnvironmentFile(resolve(".env.local"));
Object.assign(values, process.env);

const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
if (nodeMajor > 20 || (nodeMajor === 20 && nodeMinor >= 9)) report("pass", "Node.js", `supported ${process.versions.node}`);
else report("fail", "Node.js", "20.9.0 or newer is required");

const demo = values.SYNTHNET_DEMO_MODE === "true";
if (demo) report("warn", "Runtime", "demo mode is enabled; data is memory-only");
else report("pass", "Runtime", "persistent mode selected");

try {
  const url = new URL(values.SUPABASE_URL);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error();
  report("pass", "Supabase URL", "valid server endpoint configured");
} catch {
  report(demo ? "warn" : "fail", "Supabase URL", demo ? "not required in demo mode" : "missing or invalid HTTPS URL");
}

const serviceKey = values.SUPABASE_SERVICE_ROLE_KEY;
if (serviceKey?.startsWith("sb_secret_") || jwtRole(serviceKey) === "service_role") {
  report("pass", "Supabase key", "server-only service credential detected");
} else if (jwtRole(serviceKey) === "anon") {
  report("fail", "Supabase key", "anon key detected where a server-only service credential is required");
} else {
  report(demo ? "warn" : "fail", "Supabase key", demo ? "not required in demo mode" : "missing or not a service-role/secret key");
}

if (/^[a-fA-F0-9]{64}$/.test(values.API_KEY_ENCRYPTION_KEY ?? "")) {
  report("pass", "Encryption key", "valid 256-bit hexadecimal key detected");
} else {
  report("fail", "Encryption key", "exactly 64 hexadecimal characters are required");
}

try {
  const origin = new URL(values.APP_ORIGIN);
  if (origin.origin !== origin.href.replace(/\/$/, "") || (origin.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(origin.hostname))) throw new Error();
  report("pass", "App origin", "canonical origin is valid");
} catch {
  report("fail", "App origin", "set an exact HTTPS origin without a path");
}

const proxyHops = Number(values.TRUSTED_PROXY_HOPS ?? "1");
if (Number.isInteger(proxyHops) && proxyHops >= 0 && proxyHops <= 5) report("pass", "Proxy trust", `${proxyHops} trusted hop(s) configured`);
else report("fail", "Proxy trust", "TRUSTED_PROXY_HOPS must be an integer from 0 to 5");

const exposedSecrets = Object.keys(values).filter((key) => (
  key.startsWith("NEXT_PUBLIC_") && /(secret|service|private|encryption)/i.test(key)
));
if (exposedSecrets.length) report("fail", "Public variables", "a secret-like NEXT_PUBLIC_ variable exists");
else report("pass", "Public variables", "no secret-like browser variables detected");

for (const result of results) {
  const icon = result.level === "pass" ? "✓" : result.level === "warn" ? "!" : "✗";
  console.log(`${icon} ${result.label}: ${result.message}`);
}

const failures = results.filter((result) => result.level === "fail").length;
console.log(`\n${failures ? `${failures} blocking issue(s) found.` : "Environment is ready."}`);
process.exitCode = failures ? 1 : 0;

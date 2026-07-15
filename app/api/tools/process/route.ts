import { createHash, createHmac } from "node:crypto";
import { resolve4, resolve6, resolveCname, resolveMx, resolveTxt, reverse } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import { getCurrentSession, logActivity } from "@/lib/server/auth";
import { apiError, apiOk, getClientIp, isSameOrigin } from "@/lib/server/http";
import { consumeRateLimit } from "@/lib/server/rate-limit";

const schema = z.object({
  tool: z.enum(["md5-generator", "hmac-generator", "dns-lookup", "reverse-dns", "http-status", "mime-lookup", "user-agent"]),
  input: z.string().trim().max(10_000),
});

const statusDescriptions: Record<number, string> = {
  100: "Continue — the initial request was received.", 200: "OK — the request succeeded.", 201: "Created — a new resource was created.", 202: "Accepted — processing has started.", 204: "No Content — the request succeeded without a response body.", 301: "Moved Permanently — the resource has a new canonical URL.", 302: "Found — the resource is temporarily elsewhere.", 304: "Not Modified — use the cached representation.", 400: "Bad Request — the request is invalid.", 401: "Unauthorized — authentication is required.", 403: "Forbidden — the identity lacks permission.", 404: "Not Found — the resource does not exist.", 409: "Conflict — the request conflicts with current state.", 422: "Unprocessable Content — validation failed.", 429: "Too Many Requests — a rate limit was exceeded.", 500: "Internal Server Error — the server failed unexpectedly.", 502: "Bad Gateway — an upstream response was invalid.", 503: "Service Unavailable — the service cannot handle the request.", 504: "Gateway Timeout — an upstream service took too long.",
};

const mimeTypes: Record<string, string> = {
  html: "text/html", css: "text/css", js: "text/javascript", json: "application/json", xml: "application/xml", txt: "text/plain", csv: "text/csv", pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp", mp3: "audio/mpeg", mp4: "video/mp4", wasm: "application/wasm", zip: "application/zip", gz: "application/gzip", md: "text/markdown", yaml: "application/yaml", yml: "application/yaml",
};

function validHostname(value: string) {
  const hostname = value.replace(/^https?:\/\//, "").split("/")[0].replace(/:\d+$/, "").toLowerCase();
  if (hostname.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(hostname)) throw new Error("Enter a valid hostname.");
  return hostname;
}

async function settle<T>(promise: Promise<T>) {
  try { return await promise; } catch { return []; }
}

function parseUserAgent(value: string) {
  const browser = /Edg\/([\d.]+)/.exec(value) ? ["Edge", /Edg\/([\d.]+)/.exec(value)?.[1]] : /Chrome\/([\d.]+)/.exec(value) ? ["Chrome", /Chrome\/([\d.]+)/.exec(value)?.[1]] : /Firefox\/([\d.]+)/.exec(value) ? ["Firefox", /Firefox\/([\d.]+)/.exec(value)?.[1]] : /Version\/([\d.]+).*Safari/.exec(value) ? ["Safari", /Version\/([\d.]+).*Safari/.exec(value)?.[1]] : ["Unknown", null];
  const os = /Windows NT/.test(value) ? "Windows" : /Android/.test(value) ? "Android" : /iPhone|iPad/.test(value) ? "iOS / iPadOS" : /Mac OS X/.test(value) ? "macOS" : /Linux/.test(value) ? "Linux" : "Unknown";
  return { browser: browser[0], browserVersion: browser[1], operatingSystem: os, mobile: /Mobile|Android|iPhone|iPad/.test(value), bot: /bot|crawler|spider|slurp/i.test(value) };
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const account = await getCurrentSession();
  if (!account) return apiError("Authentication required.", 401);
  const rate = consumeRateLimit(`tool:${account.id}`, 120, 15 * 60 * 1000);
  if (!rate.allowed) return apiError("Tool rate limit reached.", 429);
  try {
    const input = schema.parse(await request.json());
    let result: unknown;
    if (input.tool === "md5-generator") result = createHash("md5").update(input.input).digest("hex");
    else if (input.tool === "hmac-generator") {
      const [secret, ...message] = input.input.split("\n");
      if (!secret || !message.length) return apiError("Enter the secret on line one and the message on following lines.", 422);
      result = createHmac("sha256", secret).update(message.join("\n")).digest("hex");
    } else if (input.tool === "dns-lookup") {
      const hostname = validHostname(input.input);
      const [a, aaaa, cname, mx, txt] = await Promise.all([settle(resolve4(hostname)), settle(resolve6(hostname)), settle(resolveCname(hostname)), settle(resolveMx(hostname)), settle(resolveTxt(hostname))]);
      result = { hostname, A: a, AAAA: aaaa, CNAME: cname, MX: mx, TXT: txt };
    } else if (input.tool === "reverse-dns") {
      if (!isIP(input.input)) return apiError("Enter a valid IPv4 or IPv6 address.", 422);
      result = { address: input.input, hostnames: await settle(reverse(input.input)) };
    } else if (input.tool === "http-status") {
      const code = Number(input.input);
      result = { code, description: statusDescriptions[code] ?? "Unknown or unregistered HTTP status." };
    } else if (input.tool === "mime-lookup") {
      const extension = input.input.toLowerCase().replace(/^.*\./, "").replace(/^\./, "");
      result = { extension, mimeType: mimeTypes[extension] ?? "application/octet-stream" };
    } else result = parseUserAgent(input.input);
    await logActivity(account.username, `tool_${input.tool.replaceAll("-", "_")}`, getClientIp(request));
    return apiOk({ output: typeof result === "string" ? result : JSON.stringify(result, null, 2) });
  } catch (error) {
    if (error instanceof z.ZodError) return apiError("Invalid tool input.", 422);
    return apiError(error instanceof Error ? error.message : "Unable to run tool.", 500);
  }
}

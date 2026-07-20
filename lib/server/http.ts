import "server-only";

import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { getServerEnvironment } from "@/lib/server/env";

export class RequestBodyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "RequestBodyError";
  }
}

function normalizeIp(value: string | undefined) {
  if (!value) return null;
  const candidate = value.trim().replace(/^\[|\]$/g, "").split("%")[0];
  return isIP(candidate) ? candidate : null;
}

export function getClientIp(request: Request) {
  const trustedHops = getServerEnvironment().TRUSTED_PROXY_HOPS;
  if (trustedHops === 0) return "unknown";

  const forwarded = request.headers.get("x-forwarded-for")
    ?.split(",")
    .map((item) => normalizeIp(item))
    .filter((item): item is string => Boolean(item));
  if (forwarded?.length) {
    const index = Math.max(0, forwarded.length - trustedHops);
    return forwarded[index].slice(0, 64);
  }
  return (normalizeIp(request.headers.get("x-real-ip") ?? undefined) ?? "unknown").slice(0, 64);
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;

  try {
    const configuredOrigin = getServerEnvironment().APP_ORIGIN;
    const expected = configuredOrigin ? new URL(configuredOrigin).origin : new URL(request.url).origin;
    return new URL(origin).origin === expected;
  } catch {
    return false;
  }
}

export async function readJsonBody(request: Request, maximumBytes = 32_768) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new RequestBodyError("Content-Type must be application/json.", 415);
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new RequestBodyError("Request body is too large.", 413);
  }
  if (!request.body) throw new RequestBodyError("A JSON request body is required.", 400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maximumBytes) {
      await reader.cancel();
      throw new RequestBodyError("Request body is too large.", 413);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new RequestBodyError("Request body must contain valid UTF-8 JSON.", 400);
  }
}

export function apiError(message: string, status = 400, headers?: HeadersInit) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
}

export function requestBodyError(error: unknown) {
  return error instanceof RequestBodyError ? apiError(error.message, error.status) : null;
}

export function rateLimitError(message: string, retryAfter: number) {
  return apiError(message, 429, { "Retry-After": String(retryAfter) });
}

export function apiOk<T extends Record<string, unknown>>(body: T, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

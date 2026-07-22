import "server-only";

import { ZodError } from "zod";
import { apiError, requestBodyError } from "@/lib/server/http";

export function socialApiError(error: unknown, fallback: string) {
  const bodyError = requestBodyError(error);
  if (bodyError) return bodyError;
  if (error instanceof ZodError) return apiError(error.issues[0]?.message ?? "Invalid request.", 422);
  if (error instanceof Error) {
    const status = "status" in error && typeof error.status === "number" ? error.status : 500;
    return apiError(status < 500 ? error.message : fallback, status);
  }
  return apiError(fallback, 500);
}

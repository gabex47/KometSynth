import { z } from "zod";
import { getActivityPage } from "@/lib/server/activity";
import { getCurrentSessionContext } from "@/lib/server/auth";
import { apiError, apiOk } from "@/lib/server/http";

const cursorSchema = z.object({
  timestamp: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
}).strict();

function decodeCursor(value: string | null) {
  if (!value) return null;
  if (value.length > 512) throw new Error("invalid cursor");
  return cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
}

function encodeCursor(value: { timestamp: string; id: string } | null) {
  return value ? Buffer.from(JSON.stringify(value)).toString("base64url") : null;
}

export async function GET(request: Request) {
  const context = await getCurrentSessionContext();
  if (!context) return apiError("Authentication required.", 401);
  let cursor;
  try {
    cursor = decodeCursor(new URL(request.url).searchParams.get("cursor"));
  } catch {
    return apiError("Invalid activity cursor.", 400);
  }
  try {
    const page = await getActivityPage(context, cursor);
    return apiOk({ logs: page.logs, nextCursor: encodeCursor(page.nextCursor) });
  } catch {
    return apiError("Unable to load activity logs.", 500);
  }
}

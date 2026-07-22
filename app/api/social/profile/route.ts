import { z } from "zod";
import { getCurrentSessionContext } from "@/lib/server/auth";
import { apiError, apiOk, isSameOrigin, readJsonBody } from "@/lib/server/http";
import { getSocialBootstrap, reportSocialProfile, updateSocialProfile } from "@/lib/server/social";
import { socialApiError } from "@/lib/server/social-http";

const linkSchema = z.object({ label: z.string().trim().min(1).max(40), url: z.string().url().max(300) }).strict();
const schema = z.object({
  displayName: z.string().trim().max(80),
  bio: z.string().trim().max(500),
  statusText: z.string().trim().max(120),
  links: z.array(linkSchema).max(8),
  privacy: z.object({ activity: z.enum(["everyone", "friends", "private"]), mutuals: z.boolean(), presence: z.boolean(), friendRequests: z.boolean() }).strict(),
}).strict();
const reportSchema = z.object({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{3,32}$/), details: z.string().trim().max(1_000) }).strict();

export async function GET(request: Request) {
  const context = await getCurrentSessionContext();
  if (!context) return apiError("Authentication required.", 401);
  try {
    const username = new URL(request.url).searchParams.get("username")?.toLowerCase() ?? context.account.username;
    const social = await getSocialBootstrap(context, username);
    const profile = username === context.account.username ? social.self : social.people.find((person) => person.username === username);
    return profile ? apiOk({ profile }) : apiError("Profile not found.", 404);
  } catch (error) {
    return socialApiError(error, "Unable to load the profile.");
  }
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const context = await getCurrentSessionContext();
  if (!context) return apiError("Authentication required.", 401);
  try {
    await updateSocialProfile(context, schema.parse(await readJsonBody(request, 8_192)));
    return apiOk({ updated: true });
  } catch (error) {
    return socialApiError(error, "Unable to update the profile.");
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const context = await getCurrentSessionContext();
  if (!context) return apiError("Authentication required.", 401);
  try {
    const input = reportSchema.parse(await readJsonBody(request, 2_048));
    await reportSocialProfile(context, input.username, input.details);
    return apiOk({ reported: true }, 201);
  } catch (error) {
    return socialApiError(error, "Unable to submit the profile report.");
  }
}

import { apiOk } from "@/lib/server/http";

export async function GET() {
  return apiOk({ status: "ok", service: "synthnet" });
}

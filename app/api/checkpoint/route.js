import { getCheckpoint } from "@/lib/checkpoint";

export async function GET(req) {
  const tenantId = new URL(req.url).searchParams.get("tenantId");
  const checkpoint = await getCheckpoint(tenantId);
  return Response.json({ checkpoint });
}

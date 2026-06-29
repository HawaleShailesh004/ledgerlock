import { fetchApplicableCheckpoint, fetchLatestCheckpoint } from "@/lib/worm";

export async function GET(req) {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");
  if (!tenantId) {
    return Response.json({ error: "tenantId required" }, { status: 400 });
  }
  const eventCount = Number(url.searchParams.get("eventCount") || 0);
  const checkpoint =
    eventCount > 0
      ? await fetchApplicableCheckpoint(tenantId, eventCount)
      : await fetchLatestCheckpoint(tenantId);
  return Response.json({ checkpoint });
}

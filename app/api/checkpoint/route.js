import { fetchApplicableCheckpoint } from "@/lib/worm";
import { countTenantEvents } from "@/lib/events";

export async function GET(req) {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");
  if (!tenantId) {
    return Response.json({ error: "tenantId required" }, { status: 400 });
  }
  let eventCount = Number(url.searchParams.get("eventCount") || 0);
  if (!eventCount) eventCount = await countTenantEvents(tenantId);
  const checkpoint =
    eventCount > 0
      ? await fetchApplicableCheckpoint(tenantId, eventCount)
      : null;
  return Response.json({ checkpoint, eventCount });
}

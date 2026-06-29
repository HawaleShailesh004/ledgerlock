import { getTenantSealStatus } from "@/lib/seal-status";

export async function GET(req) {
  const tenantId = new URL(req.url).searchParams.get("tenantId");
  if (!tenantId) {
    return Response.json({ error: "tenantId required" }, { status: 400 });
  }
  return Response.json(await getTenantSealStatus(tenantId));
}

import { verifyChain } from "@/lib/verify";

export async function POST(req) {
  const { tenantId } = await req.json();
  return Response.json(await verifyChain(tenantId));
}
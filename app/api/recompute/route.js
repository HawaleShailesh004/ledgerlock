import { recomputeEventAtSeq } from "@/lib/recompute";

export async function GET(req) {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");
  const seq = url.searchParams.get("seq");

  if (!tenantId || seq == null) {
    return Response.json(
      { error: "tenantId and seq required" },
      { status: 400 },
    );
  }

  try {
    return Response.json(await recomputeEventAtSeq(tenantId, seq));
  } catch (e) {
    const msg = e.message || "recompute_failed";
    const status =
      msg === "invalid_seq" || msg === "seq_not_found" ? 404 : 400;
    return Response.json({ error: msg }, { status });
  }
}

import { appendEvent } from "@/lib/append";
import { queryEventsPage, queryEventsFromSeq } from "@/lib/events";

export async function POST(req) {
  const body = await req.json();
  try {
    const r = await appendEvent(body);
    return Response.json({ ok: true, ...r });
  } catch (e) {
    const status = e.code === 409 ? 409 : 500;
    return Response.json({ ok: false, error: e.message || e.name }, { status });
  }
}

function decodeAfterKey(raw) {
  if (!raw) return undefined;
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
}

function encodeAfterKey(key) {
  if (!key) return null;
  return Buffer.from(JSON.stringify(key)).toString("base64url");
}

export async function GET(req) {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");
  if (!tenantId) {
    return Response.json({ error: "tenantId required" }, { status: 400 });
  }

  const limit = Number(url.searchParams.get("limit") || 500);
  const fromSeqRaw = url.searchParams.get("fromSeq");
  const order = url.searchParams.get("order") || "asc";
  const afterKey = decodeAfterKey(url.searchParams.get("afterKey"));

  let page;
  if (fromSeqRaw != null && fromSeqRaw !== "") {
    page = await queryEventsFromSeq(tenantId, Number(fromSeqRaw), limit);
  } else {
    page = await queryEventsPage(tenantId, {
      limit,
      afterKey,
      ascending: order !== "desc",
    });
  }

  return Response.json({
    items: page.items,
    nextKey: encodeAfterKey(page.nextKey),
    hasMore: Boolean(page.nextKey),
  });
}

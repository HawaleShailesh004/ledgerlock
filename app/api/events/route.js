import { appendEvent } from "@/lib/append";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "@/lib/ddb";
import { sealCheckpoint, CHECKPOINT_INTERVAL } from "@/lib/checkpoint";

export async function POST(req) {
  const body = await req.json();
  try {
    const r = await appendEvent(body);
    // When the event count crosses a checkpoint interval, seal a fresh WORM root.
    if ((r.seq + 1) % CHECKPOINT_INTERVAL === 0) {
      const all = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :p)",
        ExpressionAttributeValues: { ":pk": `TENANT#${body.tenantId}`, ":p": "EVENT#" },
        ScanIndexForward: true,
      }));
      await sealCheckpoint(body.tenantId, all.Items);
    }
    return Response.json({ ok: true, ...r });
  } catch (e) {
    const status = e.code === 409 ? 409 : 500;
    return Response.json({ ok: false, error: e.message || e.name }, { status });
  }
}

export async function GET(req) {
  const tenantId = new URL(req.url).searchParams.get("tenantId");
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :p)",
    ExpressionAttributeValues: { ":pk": `TENANT#${tenantId}`, ":p": "EVENT#" },
    ScanIndexForward: true,
  }));
  return Response.json({ items: res.Items });
}

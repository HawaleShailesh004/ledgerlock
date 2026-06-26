import { appendEvent } from "@/lib/append";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "@/lib/ddb";

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
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "@/lib/ddb";

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

  const limit = Math.min(
    Math.max(1, Number(url.searchParams.get("limit") || 50)),
    1000,
  );
  const afterKey = decodeAfterKey(url.searchParams.get("afterKey"));

  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": `ALERT#${tenantId}` },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: afterKey || undefined,
    }),
  );

  const items = (res.Items || []).map(({ GSI1PK, GSI1SK, ...rest }) => rest);
  return Response.json({
    items,
    count: items.length,
    nextKey: encodeAfterKey(res.LastEvaluatedKey),
    hasMore: Boolean(res.LastEvaluatedKey),
  });
}

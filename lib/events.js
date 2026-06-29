import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "./ddb.js";
import { CHECKPOINT_EVERY } from "./constants.js";

const DEFAULT_PAGE = 500;
const MAX_PAGE = 1000;

function tenantPk(tenantId) {
  return `TENANT#${tenantId}`;
}

/** O(1) event count — reads only the highest-seq row. */
export async function countTenantEvents(tenantId) {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :p)",
      ExpressionAttributeValues: {
        ":pk": tenantPk(tenantId),
        ":p": "EVENT#",
      },
      ScanIndexForward: false,
      Limit: 1,
    }),
  );
  const last = res.Items?.[0];
  return last?.seq != null ? last.seq + 1 : 0;
}

/** Paginated event query (ascending seq by default). */
export async function queryEventsPage(
  tenantId,
  { limit = DEFAULT_PAGE, afterKey, ascending = true } = {},
) {
  const pageSize = Math.min(Math.max(1, limit), MAX_PAGE);
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :p)",
      ExpressionAttributeValues: {
        ":pk": tenantPk(tenantId),
        ":p": "EVENT#",
      },
      ScanIndexForward: ascending,
      Limit: pageSize,
      ExclusiveStartKey: afterKey || undefined,
    }),
  );
  return {
    items: res.Items || [],
    nextKey: res.LastEvaluatedKey || null,
    scanned: (res.Items || []).length,
  };
}

/** Jump to a page by sequence offset (page N → fromSeq = N × limit). */
export async function queryEventsFromSeq(tenantId, fromSeq, limit) {
  const pageSize = Math.min(Math.max(1, limit), MAX_PAGE);
  const start = Math.max(0, Number(fromSeq) || 0);
  const pk = tenantPk(tenantId);
  const exclusiveStartKey =
    start > 0
      ? {
          PK: pk,
          SK: `EVENT#${String(start - 1).padStart(10, "0")}`,
        }
      : undefined;

  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :p)",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":p": "EVENT#",
      },
      ScanIndexForward: true,
      Limit: pageSize,
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );
  return {
    items: res.Items || [],
    nextKey: res.LastEvaluatedKey || null,
    scanned: (res.Items || []).length,
  };
}

/** Load first `maxCount` events only (for Merkle proof prefix). */
export async function queryEventPrefix(tenantId, maxCount) {
  const items = [];
  let afterKey;
  while (items.length < maxCount) {
    const page = await queryEventsPage(tenantId, {
      limit: Math.min(MAX_PAGE, maxCount - items.length),
      afterKey,
    });
    items.push(...page.items);
    afterKey = page.nextKey;
    if (!afterKey || page.items.length === 0) break;
  }
  return items.slice(0, maxCount);
}

/** Load full tenant chain (paginated internally). */
export async function queryAllEvents(tenantId, { onProgress } = {}) {
  const items = [];
  let afterKey;
  do {
    const page = await queryEventsPage(tenantId, { limit: MAX_PAGE, afterKey });
    items.push(...page.items);
    afterKey = page.nextKey;
    onProgress?.(items.length);
  } while (afterKey);
  return items;
}

export { CHECKPOINT_EVERY };

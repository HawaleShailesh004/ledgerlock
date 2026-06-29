import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const tenantId = process.argv[2];
if (!tenantId) {
  console.error("Usage: node scripts/wipe-tenant.mjs <tenantId>");
  process.exit(1);
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "ap-south-1" }));
const pk = `TENANT#${tenantId}`;
const items = [];
let lastKey;

do {
  const res = await ddb.send(new QueryCommand({
    TableName: "LedgerLock",
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: { ":pk": pk },
    ProjectionExpression: "PK, SK",
    ExclusiveStartKey: lastKey,
  }));
  items.push(...(res.Items || []));
  lastKey = res.LastEvaluatedKey;
} while (lastKey);

for (const it of items) {
  await ddb.send(new DeleteCommand({
    TableName: "LedgerLock",
    Key: { PK: it.PK, SK: it.SK },
  }));
}

console.log(`Deleted ${items.length} items for ${tenantId}`);
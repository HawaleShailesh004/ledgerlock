// Delete all DynamoDB items for a tenant (requires admin DeleteItem).
// Usage: node scripts/wipe-tenant.mjs <tenantId> [--use-aws-profile]

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { loadEnvLocal } from "../lib/load-env.mjs";

const useAwsProfile = process.argv.includes("--use-aws-profile");
loadEnvLocal();

if (useAwsProfile) {
  delete process.env.LL_ACCESS_KEY_ID;
  delete process.env.LL_SECRET_ACCESS_KEY;
  delete process.env.LL_ADMIN_ACCESS_KEY_ID;
  delete process.env.LL_ADMIN_SECRET_ACCESS_KEY;
}

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const tid = args[0];

if (!tid) {
  console.error("Usage: node scripts/wipe-tenant.mjs <tenantId> [--use-aws-profile]");
  process.exit(1);
}

const accessKeyId =
  process.env.LL_ADMIN_ACCESS_KEY_ID || process.env.LL_ACCESS_KEY_ID;
const secretAccessKey =
  process.env.LL_ADMIN_SECRET_ACCESS_KEY || process.env.LL_SECRET_ACCESS_KEY;

const clientConfig = { region: "ap-south-1" };
if (accessKeyId && secretAccessKey) {
  clientConfig.credentials = { accessKeyId, secretAccessKey };
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient(clientConfig));
const pk = `TENANT#${tid}`;
const items = [];
let lastKey;

do {
  const res = await ddb.send(
    new QueryCommand({
      TableName: "LedgerLock",
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": pk },
      ProjectionExpression: "PK, SK",
      ExclusiveStartKey: lastKey,
    }),
  );
  items.push(...(res.Items || []));
  lastKey = res.LastEvaluatedKey;
} while (lastKey);

for (const it of items) {
  await ddb.send(
    new DeleteCommand({
      TableName: "LedgerLock",
      Key: { PK: it.PK, SK: it.SK },
    }),
  );
}

console.log(`Deleted ${items.length} DynamoDB items for ${tid}`);

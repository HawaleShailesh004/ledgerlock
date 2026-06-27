import { QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "./ddb.js";
import { computeHash } from "./chain.js";

const MAX_RETRIES = 5;

export async function appendEvent({
  tenantId,
  actor,
  action,
  payload,
  flagged = false,
}) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // AP3: read the tenant's most recent event to chain onto it
    const last = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :p)",
        ExpressionAttributeValues: {
          ":pk": `TENANT#${tenantId}`,
          ":p": "EVENT#",
        },
        ScanIndexForward: false, // newest (highest seq) first
        Limit: 1,
      }),
    );
    const prev = last.Items?.[0];
    const prevHash = prev ? prev.hash : "GENESIS";
    const seq = prev ? prev.seq + 1 : 0;

    const ts = new Date().toISOString();
    const sk = `EVENT#${String(seq).padStart(10, "0")}`; // seq IS the uniqueness constraint
    // ts is a normal attribute (for display + time queries) and IS part of the hash
    const base = {
      PK: `TENANT#${tenantId}`,
      SK: sk,
      seq,
      prevHash,
      actor,
      action,
      payload,
      flagged,
      ts,
    };
    const hash = computeHash(base, prevHash);

    const item = { ...base, hash };
    if (flagged) {
      item.GSI1PK = `ALERT#${tenantId}`;
      item.GSI1SK = `EVENT#${ts}`;
    } // sparse index

    try {
      await ddb.send(
        new PutCommand({
          TableName: TABLE,
          Item: item,
          ConditionExpression: "attribute_not_exists(SK)", // append-only AND fork-prevention
        }),
      );
      return { seq, hash, sk, attempts: attempt + 1 };
    } catch (e) {
      if (e.name === "ConditionalCheckFailedException") {
        // another writer claimed this seq first - wait briefly, re-read tail, recompute
        await new Promise((r) =>
          setTimeout(r, 20 * (attempt + 1) + Math.random() * 20),
        );
        continue;
      }
      throw e; // a real error, not a race
    }
  }
  const err = new Error("append_conflict_exhausted"); // sustained contention (rare here)
  err.code = 409;
  throw err;
}

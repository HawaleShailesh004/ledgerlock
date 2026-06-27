import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "./ddb.js";
import { merkleRoot } from "./merkle.js";

// How many events each WORM checkpoint seals. In production this is the cadence
// at which the Merkle root is sealed into S3 Object Lock (immutable).
export const CHECKPOINT_INTERVAL = 30;

// The independent, immutable checkpoint sealed to WORM storage. We model it as a
// single meta record per tenant (SK = "CHECKPOINT") holding the most recent seal.
export async function getCheckpoint(tenantId) {
  const r = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: `TENANT#${tenantId}`, SK: "CHECKPOINT" },
    })
  );
  if (!r.Item) return null;
  return {
    count: r.Item.count,
    merkleRoot: r.Item.merkleRoot,
    lastSeq: r.Item.lastSeq,
    lastHash: r.Item.lastHash,
    ts: r.Item.ts,
  };
}

// Seal a checkpoint over the first `count` events (called when a boundary is crossed).
// In a real deployment this object would be written to S3 with Object Lock; here we
// persist it once and never recompute it from live data, so later tampering diverges.
export async function sealCheckpoint(tenantId, orderedEvents) {
  const count =
    Math.floor(orderedEvents.length / CHECKPOINT_INTERVAL) * CHECKPOINT_INTERVAL;
  if (count === 0) return null;
  const sealed = orderedEvents.slice(0, count);
  const item = {
    PK: `TENANT#${tenantId}`,
    SK: "CHECKPOINT",
    count,
    merkleRoot: merkleRoot(sealed.map((e) => e.hash)),
    lastSeq: sealed[sealed.length - 1].seq,
    lastHash: sealed[sealed.length - 1].hash,
    ts: new Date().toISOString(),
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
  return item;
}

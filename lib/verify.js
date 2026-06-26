import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "./ddb.js";
import { computeHash, merkleRoot } from "./chain.js";

const CHECKPOINT_EVERY = 10;   // must match Lambda

export async function verifyChain(tenantId) {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :p)",
    ExpressionAttributeValues: { ":pk": `TENANT#${tenantId}`, ":p": "EVENT#" },
    ScanIndexForward: true,
  }));

  let prevHash = "GENESIS";
  let expectedSeq = 0;
  const breaks = [];
  for (const it of res.Items) {
    const { hash, GSI1PK, GSI1SK, ...rest } = it;
    const recomputed = computeHash(rest, prevHash);
    const linkOk = it.prevHash === prevHash;
    const hashOk = recomputed === hash;
    const seqOk = it.seq === expectedSeq;
    if (!linkOk || !hashOk || !seqOk) {
      breaks.push({ seq: it.seq, SK: it.SK, linkOk, hashOk, seqOk });
    }
    prevHash = hash;
    expectedSeq = it.seq + 1;
  }

  const n = res.Items.length;
  const boundary = Math.floor(n / CHECKPOINT_EVERY) * CHECKPOINT_EVERY;
  const liveRootAtBoundary =
    boundary > 0 ? merkleRoot(res.Items.slice(0, boundary).map(i => i.hash)) : null;

  return { intact: breaks.length === 0, count: n, breaks, boundary, liveRootAtBoundary };
}
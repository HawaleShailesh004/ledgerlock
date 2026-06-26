import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "./ddb.js";
import { computeHash } from "./chain.js";

export async function verifyChain(tenantId) {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :p)",
    ExpressionAttributeValues: { ":pk": `TENANT#${tenantId}`, ":p": "EVENT#" },
    ScanIndexForward: true,    // oldest first
  }));

  let prevHash = "GENESIS";
  let expectedSeq = 0;
  const breaks = [];
  for (const it of res.Items) {
    const { hash, GSI1PK, GSI1SK, ...rest } = it;     // strip stored hash + index attrs (ts/seq stay — they were hashed)
    const recomputed = computeHash(rest, prevHash);
    const linkOk = it.prevHash === prevHash;          // continuity
    const hashOk = recomputed === hash;               // integrity
    const seqOk  = it.seq === expectedSeq;            // no fork, no deletion gap
    if (!linkOk || !hashOk || !seqOk) {
      breaks.push({ seq: it.seq, SK: it.SK, linkOk, hashOk, seqOk });
    }
    prevHash = hash;                                  // advance using stored hash
    expectedSeq = it.seq + 1;
  }
  return { intact: breaks.length === 0, count: res.Items.length, breaks };
}
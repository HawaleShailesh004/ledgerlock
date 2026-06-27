import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "./ddb.js";
import { computeHash } from "./chain.js";
import { merkleRoot } from "./merkle.js";
import { getCheckpoint } from "./checkpoint.js";

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
  const recomputedHashes = [];                        // content-derived, used for the WORM cross-check
  for (const it of res.Items) {
    const { hash, GSI1PK, GSI1SK, ...rest } = it;     // strip stored hash + index attrs (ts/seq stay — they were hashed)
    const recomputed = computeHash(rest, prevHash);
    recomputedHashes.push(recomputed);
    const linkOk = it.prevHash === prevHash;          // continuity
    const hashOk = recomputed === hash;               // integrity
    const seqOk  = it.seq === expectedSeq;            // no fork, no deletion gap
    if (!linkOk || !hashOk || !seqOk) {
      breaks.push({ seq: it.seq, SK: it.SK, linkOk, hashOk, seqOk });
    }
    prevHash = hash;                                  // advance using stored hash
    expectedSeq = it.seq + 1;
  }

  // WORM cross-check: recompute the Merkle root over the SAME slice the checkpoint
  // sealed — straight from each record's live CONTENT (not its stored hash). If any
  // field inside that window was altered after sealing, its recomputed leaf changes
  // and the live root diverges from the immutable checkpoint root.
  const checkpoint = await getCheckpoint(tenantId);
  const boundary = checkpoint ? checkpoint.count : res.Items.length;
  const liveRootAtBoundary = merkleRoot(recomputedHashes.slice(0, boundary));

  return {
    intact: breaks.length === 0,
    count: res.Items.length,
    breaks,
    boundary,
    liveRootAtBoundary,
  };
}

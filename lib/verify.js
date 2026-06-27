import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "./ddb.js";
import { computeHash, merkleRoot } from "./chain.js";

const CHECKPOINT_EVERY = 10;   // must match lambda/checkpointer.mjs

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
  const recomputedHashes = [];                        // content-derived, used for the WORM cross-check
  for (const it of res.Items) {
    const { hash, GSI1PK, GSI1SK, ...rest } = it;
    const recomputed = computeHash(rest, prevHash);
    recomputedHashes.push(recomputed);
    const linkOk = it.prevHash === prevHash;          // continuity
    const hashOk = recomputed === hash;               // integrity
    const seqOk  = it.seq === expectedSeq;            // no fork, no deletion gap
    if (!linkOk || !hashOk || !seqOk) {
      breaks.push({ seq: it.seq, SK: it.SK, linkOk, hashOk, seqOk });
    }
    prevHash = hash;
    expectedSeq = it.seq + 1;
  }

  // WORM cross-check: recompute the Merkle root over the SAME slice the seal
  // covers — straight from each record's live CONTENT (not its stored hash). If any
  // field inside that window was altered after sealing, its recomputed leaf changes
  // and the live root diverges from the immutable checkpoint root in S3.
  const n = res.Items.length;
  const boundary = Math.floor(n / CHECKPOINT_EVERY) * CHECKPOINT_EVERY;
  const liveRootAtBoundary =
    boundary > 0 ? merkleRoot(recomputedHashes.slice(0, boundary)) : null;

  return { intact: breaks.length === 0, count: n, breaks, boundary, liveRootAtBoundary };
}

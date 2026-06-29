import { queryAllEvents } from "./events.js";
import { fetchApplicableCheckpoint } from "./worm.js";
import { buildProof, verifyProof } from "./merkle-proof.js";
import { CHECKPOINT_EVERY } from "./constants.js";

function checkpointBoundaryForSeq(seq) {
  return Math.floor((seq + 1) / CHECKPOINT_EVERY) * CHECKPOINT_EVERY;
}

/** Merkle inclusion proof for event `seq` within its checkpoint window. */
export async function getInclusionProof(tenantId, seq) {
  const seqNum = Number(seq);
  if (!Number.isInteger(seqNum) || seqNum < 0) {
    throw new Error("invalid_seq");
  }

  const boundary = checkpointBoundaryForSeq(seqNum);
  if (boundary === 0) {
    throw new Error("seq_before_first_checkpoint");
  }

  const [items, checkpoint] = await Promise.all([
    queryEventPrefix(tenantId, boundary),
    fetchApplicableCheckpoint(tenantId, seqNum + 1),
  ]);

  if (seqNum >= boundary) throw new Error("seq_not_found");
  const event = items[seqNum];
  if (event.seq !== seqNum) throw new Error("seq_gap");

  const leaves = items.slice(0, boundary).map((e) => e.hash);
  const proof = buildProof(leaves, seqNum);

  const cpRoot =
    checkpoint && checkpoint.count >= boundary ? checkpoint.merkleRoot : null;
  const proofValid = cpRoot ? verifyProof(proof.leaf, proof.siblings, cpRoot) : null;

  return {
    tenantId,
    seq: seqNum,
    boundary,
    leaf: proof.leaf,
    leafIndex: proof.leafIndex,
    siblings: proof.siblings,
    computedRoot: proof.root,
    checkpointRoot: cpRoot,
    proofValid,
    event: {
      seq: event.seq,
      action: event.action,
      actor: event.actor,
      ts: event.ts,
      hash: event.hash,
    },
  };
}

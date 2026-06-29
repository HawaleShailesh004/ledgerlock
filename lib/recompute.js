import { queryEventPrefix } from "./events.js";
import { computeHash, canonical } from "./chain.js";

function contentOf(event) {
  const { hash, GSI1PK, GSI1SK, ...rest } = event;
  return rest;
}

export async function recomputeEventAtSeq(tenantId, seq) {
  const seqNum = Number(seq);
  if (!Number.isInteger(seqNum) || seqNum < 0) {
    throw new Error("invalid_seq");
  }

  const items = await queryEventPrefix(tenantId, seqNum + 1);
  const event = items[seqNum];
  if (!event || event.seq !== seqNum) {
    throw new Error("seq_not_found");
  }

  const prevHash = seqNum === 0 ? "GENESIS" : items[seqNum - 1].hash;
  const content = contentOf(event);
  const recomputed = await computeHash(content, prevHash);

  return {
    seq: event.seq,
    prevHash,
    content: canonical(content),
    recomputed,
    stored: event.hash,
    match: recomputed === event.hash && event.prevHash === prevHash,
  };
}

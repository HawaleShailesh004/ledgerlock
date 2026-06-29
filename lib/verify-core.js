import { computeHash, merkleRoot } from "./chain.js";
import { CHECKPOINT_EVERY } from "./constants.js";

function stripForHash(item) {
  const { hash, GSI1PK, GSI1SK, ...rest } = item;
  return rest;
}

/** Walk chain from `startIdx`, chaining from `prevHash`. */
export function walkSegment(items, startIdx, prevHash, { onProgress, progressEvery = 250 } = {}) {
  const breaks = [];
  const recomputedHashes = [];
  let expectedSeq = startIdx === 0 ? 0 : items[startIdx]?.seq ?? startIdx;

  for (let i = startIdx; i < items.length; i++) {
    const it = items[i];
    const rest = stripForHash(it);
    const recomputed = computeHash(rest, prevHash);
    recomputedHashes.push(recomputed);
    const linkOk = it.prevHash === prevHash;
    const hashOk = recomputed === it.hash;
    const seqOk = it.seq === expectedSeq;
    if (!linkOk || !hashOk || !seqOk) {
      breaks.push({ seq: it.seq, SK: it.SK, linkOk, hashOk, seqOk });
    }
    prevHash = it.hash;
    expectedSeq = it.seq + 1;
    if (onProgress && (i - startIdx + 1) % progressEvery === 0) {
      onProgress(i - startIdx + 1);
    }
  }
  if (onProgress && items.length > startIdx) {
    onProgress(items.length - startIdx);
  }
  return { breaks, recomputedHashes, finalHash: prevHash };
}

/** Confirm WORM seal covers stored hashes (not content-recomputed). */
export function verifySealPrefix(items, checkpoint) {
  const sealCount = checkpoint.count;
  if (sealCount <= 0 || items.length < sealCount) {
    return { sealOk: false, reason: "seal_count_mismatch" };
  }

  // Fully caught up — merkle over stored hashes + last-event anchor (not O(1) last-only).
  if (sealCount === items.length) {
    const storedRoot = merkleRoot(items.map((e) => e.hash));
    const last = items[items.length - 1];
    const sealOk =
      storedRoot === checkpoint.merkleRoot &&
      last.seq === checkpoint.lastSeq &&
      last.hash === checkpoint.lastHash;
    return {
      sealOk,
      storedRoot,
      prefixCount: sealCount,
    };
  }

  const prefix = items.slice(0, sealCount);
  const last = prefix[prefix.length - 1];
  const storedRoot = merkleRoot(prefix.map((e) => e.hash));
  const sealOk =
    storedRoot === checkpoint.merkleRoot &&
    last.hash === checkpoint.lastHash &&
    last.seq === checkpoint.lastSeq;
  return { sealOk, storedRoot, prefixCount: sealCount };
}

/** Full in-memory chain verify (pure — no I/O). */
export function verifyChainInMemory(items, checkpoint = null, { onProgress } = {}) {
  const n = items.length;
  const boundary = Math.floor(n / CHECKPOINT_EVERY) * CHECKPOINT_EVERY;
  const emit = (phase, verified, label) =>
    onProgress?.({ phase, verified, total: n, label });

  if (!checkpoint || checkpoint.count <= 0) {
    emit("walk", 0, "Recomputing full chain");
    const { breaks, recomputedHashes } = walkSegment(items, 0, "GENESIS", {
      onProgress: (walked) => emit("walk", walked, "Recomputing full chain"),
    });
    emit("done", n, "Verification complete");
    const liveRootAtBoundary =
      boundary > 0 ? merkleRoot(recomputedHashes.slice(0, boundary)) : null;
    return {
      mode: "full",
      intact: breaks.length === 0,
      count: n,
      breaks,
      boundary,
      liveRootAtBoundary,
      sealAt: 0,
      tailVerified: n,
      sealVerified: false,
      wormMatch: null,
    };
  }

  emit("seal-check", 0, "Validating WORM seal");
  const { sealOk, storedRoot } = verifySealPrefix(items, checkpoint);
  const sealAt = checkpoint.count;
  const tailLen = Math.max(0, n - sealAt);

  if (sealOk && sealAt > 0) {
    emit("seal-trusted", sealAt, `WORM seal trusted through event ${sealAt.toLocaleString()}`);
  }

  const tail =
    tailLen > 0
      ? walkSegment(items, sealAt, checkpoint.lastHash, {
          onProgress: (walked) =>
            emit("tail-walk", sealAt + walked, `Walking tail (${walked.toLocaleString()} / ${tailLen.toLocaleString()})`),
        })
      : { breaks: [], recomputedHashes: [] };

  let liveRootAtBoundary = null;
  let prefixBreaks = [];

  if (tailLen === 0) {
    // Fully sealed — WORM proves what was committed; still recompute every row
    // because DynamoDB can be tampered after the seal was written.
    emit("walk", 0, "Recomputing full chain");
    const fullWalk = walkSegment(items, 0, "GENESIS", {
      onProgress: (walked) => emit("walk", walked, "Recomputing full chain"),
      progressEvery: n >= 1000 ? 500 : 250,
    });
    prefixBreaks = fullWalk.breaks;
    if (
      fullWalk.breaks.length === 0 &&
      boundary > 0 &&
      boundary <= fullWalk.recomputedHashes.length
    ) {
      liveRootAtBoundary = merkleRoot(
        fullWalk.recomputedHashes.slice(0, boundary),
      );
    }
  } else if (boundary > 0) {
    emit("prefix-walk", sealOk ? sealAt : 0, "Recomputing prefix for Merkle boundary");
    const prefixWalk = walkSegment(items, 0, "GENESIS", {
      onProgress: (walked) =>
        emit("prefix-walk", walked, "Recomputing prefix for Merkle boundary"),
    });
    prefixBreaks = prefixWalk.breaks;
    if (
      prefixWalk.breaks.length === 0 &&
      boundary <= prefixWalk.recomputedHashes.length
    ) {
      liveRootAtBoundary = merkleRoot(
        prefixWalk.recomputedHashes.slice(0, boundary),
      );
    }
  }

  emit("done", n, "Verification complete");

  const breaks = sealOk
    ? [...prefixBreaks, ...tail.breaks]
    : [{ seq: -1, sealOk: false }, ...prefixBreaks, ...tail.breaks];

  return {
    mode: "since-seal",
    intact: sealOk && breaks.length === 0,
    count: n,
    breaks,
    boundary,
    liveRootAtBoundary,
    sealAt,
    tailVerified: tailLen,
    sealVerified: sealOk,
    wormMatch: sealOk ? storedRoot === checkpoint.merkleRoot : false,
    checkpoint,
  };
}

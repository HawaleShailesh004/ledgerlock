import { queryAllEvents, countTenantEvents } from "./events.js";
import { resolveValidCheckpoint } from "./worm.js";
import { verifyChainInMemory, verifySealPrefix } from "./verify-core.js";

export { verifyChainInMemory } from "./verify-core.js";

/** Full O(n) walk — every event recomputed from genesis. */
export async function verifyChainFull(tenantId, { onProgress } = {}) {
  const started = Date.now();
  const totalHint = await countTenantEvents(tenantId);
  onProgress?.({
    phase: "loading",
    verified: 0,
    total: totalHint,
    label: "Loading chain from DynamoDB",
  });
  const items = await queryAllEvents(tenantId, {
    onProgress: (loaded) =>
      onProgress?.({
        phase: "loading",
        verified: loaded,
        total: Math.max(totalHint, loaded),
        label: "Loading chain from DynamoDB",
      }),
  });
  const result = verifyChainInMemory(items, null, { onProgress });
  return { ...result, durationMs: Date.now() - started };
}

/** Incremental verify: trust WORM seal prefix, walk tail only. */
export async function verifyChainSinceSeal(tenantId, { onProgress } = {}) {
  const started = Date.now();
  const totalHint = await countTenantEvents(tenantId);
  onProgress?.({
    phase: "loading",
    verified: 0,
    total: totalHint,
    label: "Loading chain from DynamoDB",
  });
  const items = await queryAllEvents(tenantId, {
    onProgress: (loaded) =>
      onProgress?.({
        phase: "loading",
        verified: loaded,
        total: Math.max(totalHint, loaded),
        label: "Loading chain from DynamoDB",
      }),
  });
  const checkpoint = await resolveValidCheckpoint(
    tenantId,
    items,
    verifySealPrefix,
  );
  const result = verifyChainInMemory(items, checkpoint, { onProgress });
  return { ...result, durationMs: Date.now() - started, checkpoint };
}

/** Default verify path — since-seal when a valid checkpoint exists, else full. */
export async function verifyChain(tenantId, { mode = "since-seal", onProgress } = {}) {
  if (mode === "full") return verifyChainFull(tenantId, { onProgress });
  return verifyChainSinceSeal(tenantId, { onProgress });
}

import { countTenantEvents } from "./events.js";
import { listCheckpointKeys } from "./worm.js";
import { CHECKPOINT_EVERY } from "./constants.js";

/**
 * Checkpointer lag status for UI — lists S3 key boundaries only (fast).
 * pendingSeal = events written but not yet covered by the newest S3 seal key.
 */
export async function getTenantSealStatus(tenantId) {
  const totalEvents = await countTenantEvents(tenantId);
  const keys = await listCheckpointKeys(tenantId);

  // Newest seal key at or below live count (ignore stale keys from wiped data).
  const applicable = keys.filter((k) => k.boundary <= totalEvents);
  const sealedThrough = applicable[0]?.boundary ?? 0;
  const pendingSeal = Math.max(0, totalEvents - sealedThrough);

  const maxBoundary =
    totalEvents >= CHECKPOINT_EVERY
      ? Math.floor(totalEvents / CHECKPOINT_EVERY) * CHECKPOINT_EVERY
      : 0;
  const fullySealed = pendingSeal === 0 && totalEvents > 0 && sealedThrough >= maxBoundary;

  let status = "caught-up";
  if (pendingSeal > CHECKPOINT_EVERY) status = "behind";
  else if (pendingSeal > 0) status = "catching-up";

  return {
    tenantId,
    totalEvents,
    sealedThrough,
    pendingSeal,
    status,
    fullySealed,
    checkpointEvery: CHECKPOINT_EVERY,
    sealKeys: keys.length,
  };
}

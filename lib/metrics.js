// Derived analytics from a ledger (array of events, any order).
// Pure + cheap so it can run inside a useMemo on every render.

import { ACTION_META } from "@/components/format";

const BUCKETS = 12;

export function computeMetrics(events) {
  const total = events.length;
  if (total === 0) {
    return {
      total: 0,
      flaggedCount: 0,
      breakGlassCount: 0,
      actorCount: 0,
      volumeSeries: [],
      flaggedSeries: [],
      actionDistribution: [],
      topActors: [],
      timeline: [],
    };
  }

  const sorted = [...events].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
  );
  const start = new Date(sorted[0].ts).getTime();
  const end = new Date(sorted[sorted.length - 1].ts).getTime();
  const span = Math.max(end - start, 1);
  const bucketMs = span / BUCKETS;

  const volume = new Array(BUCKETS).fill(0);
  const flaggedBucket = new Array(BUCKETS).fill(0);
  const actionCounts = {};
  const actorCounts = {};
  let flaggedCount = 0;
  let breakGlassCount = 0;

  for (const e of sorted) {
    const t = new Date(e.ts).getTime();
    let idx = Math.floor((t - start) / bucketMs);
    if (idx >= BUCKETS) idx = BUCKETS - 1;
    if (idx < 0) idx = 0;
    volume[idx] += 1;
    if (e.flagged) {
      flaggedBucket[idx] += 1;
      flaggedCount += 1;
    }
    if (e.action === "BREAK_THE_GLASS") breakGlassCount += 1;
    actionCounts[e.action] = (actionCounts[e.action] || 0) + 1;
    actorCounts[e.actor] = (actorCounts[e.actor] || 0) + 1;
  }

  const timeline = volume.map((v, i) => {
    const bucketStart = start + i * bucketMs;
    return {
      label: new Date(bucketStart).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      events: v,
      flagged: flaggedBucket[i],
    };
  });

  const actionDistribution = Object.entries(actionCounts)
    .map(([action, value]) => ({
      action,
      label: ACTION_META[action]?.short || action,
      value,
    }))
    .sort((a, b) => b.value - a.value);

  const topActors = Object.entries(actorCounts)
    .map(([actor, count]) => ({ actor, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    total,
    flaggedCount,
    breakGlassCount,
    actorCount: Object.keys(actorCounts).length,
    volumeSeries: volume,
    flaggedSeries: flaggedBucket,
    actionDistribution,
    topActors,
    timeline,
  };
}

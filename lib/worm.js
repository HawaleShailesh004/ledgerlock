import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: "ap-south-1",
  credentials: {
    accessKeyId: process.env.LL_ACCESS_KEY_ID,
    secretAccessKey: process.env.LL_SECRET_ACCESS_KEY,
  },
});

function bucket() {
  return process.env.WORM_BUCKET;
}

function tenantPrefix(tenantId) {
  return `TENANT_${tenantId}/`;
}

function boundaryFromKey(key) {
  return Number(key.match(/checkpoint-(\d+)\.json/)?.[1] || 0);
}

async function fetchCheckpointBody(key) {
  const obj = await s3.send(
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
  );
  return JSON.parse(await obj.Body.transformToString());
}

/** Checkpoint keys sorted newest boundary first (keys only — no body fetch). */
export async function listCheckpointKeys(tenantId) {
  const BUCKET = bucket();
  if (!BUCKET) return [];

  const list = await s3.send(
    new ListObjectsV2Command({ Bucket: BUCKET, Prefix: tenantPrefix(tenantId) }),
  );
  return (list.Contents || [])
    .map((o) => o.Key)
    .filter((k) => k?.endsWith(".json"))
    .map((key) => ({ key, boundary: boundaryFromKey(key) }))
    .sort((a, b) => b.boundary - a.boundary);
}

/** All WORM checkpoints for a tenant, newest boundary first. */
export async function listCheckpoints(tenantId) {
  const keys = await listCheckpointKeys(tenantId);
  const out = [];
  for (const { key } of keys) {
    out.push(await fetchCheckpointBody(key));
  }
  return out;
}

/** Latest WORM checkpoint object for a tenant, or null. */
export async function fetchLatestCheckpoint(tenantId) {
  const keys = await listCheckpointKeys(tenantId);
  if (keys.length === 0) return null;
  return fetchCheckpointBody(keys[0].key);
}

/** Newest checkpoint whose boundary fits within `eventCount`. */
export async function fetchApplicableCheckpoint(tenantId, eventCount) {
  const keys = await listCheckpointKeys(tenantId);
  const match = keys.find((k) => k.boundary <= eventCount);
  if (!match) return null;
  return fetchCheckpointBody(match.key);
}

/** Resolve the newest seal that cryptographically matches live items. */
export async function resolveValidCheckpoint(tenantId, items, verifySealPrefix) {
  const keys = await listCheckpointKeys(tenantId);
  const applicable = keys.filter((k) => k.boundary <= items.length);
  // Try newest boundary first — usually one S3 GET.
  for (const { key } of applicable) {
    const cp = await fetchCheckpointBody(key);
    const { sealOk } = verifySealPrefix(items, cp);
    if (sealOk) return cp;
  }
  return null;
}

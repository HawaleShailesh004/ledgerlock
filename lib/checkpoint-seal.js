import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { merkleRoot } from "./chain.js";
import { CHECKPOINT_EVERY } from "./constants.js";

function s3Credentials() {
  const accessKeyId =
    process.env.LL_ADMIN_ACCESS_KEY_ID || process.env.LL_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.LL_ADMIN_SECRET_ACCESS_KEY || process.env.LL_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) return undefined;
  return { accessKeyId, secretAccessKey };
}

function s3() {
  const config = { region: "ap-south-1" };
  const credentials = s3Credentials();
  if (credentials) config.credentials = credentials;
  return new S3Client(config);
}

export function tenantPk(tenantId) {
  return `TENANT#${tenantId}`;
}

export function checkpointKey(tenantId, boundary) {
  return `${tenantPk(tenantId).replace("#", "_")}/checkpoint-${boundary}.json`;
}

export function maxBoundary(eventCount) {
  return Math.floor(eventCount / CHECKPOINT_EVERY) * CHECKPOINT_EVERY;
}

/** Build checkpoint payload — byte-aligned with lambda/checkpointer.mjs */
export function buildCheckpoint(tenantId, items, boundary) {
  const pk = tenantPk(tenantId);
  const upTo = items.slice(0, boundary);
  const last = upTo[upTo.length - 1];
  return {
    tenant: pk,
    count: boundary,
    lastSeq: last.seq,
    lastHash: last.hash,
    merkleRoot: merkleRoot(upTo.map((i) => i.hash)),
    ts: new Date().toISOString(),
  };
}

export async function writeCheckpoint(tenantId, items, boundary) {
  const BUCKET = process.env.WORM_BUCKET;
  if (!BUCKET) throw new Error("WORM_BUCKET not set");

  const checkpoint = buildCheckpoint(tenantId, items, boundary);
  await s3().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: checkpointKey(tenantId, boundary),
      Body: JSON.stringify(checkpoint),
      ContentType: "application/json",
    }),
  );
  return checkpoint;
}

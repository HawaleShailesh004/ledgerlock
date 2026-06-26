import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "ap-south-1" }));
const s3 = new S3Client({ region: "ap-south-1" });
const TABLE = "LedgerLock";
const BUCKET = process.env.WORM_BUCKET;
const CHECKPOINT_EVERY = 10;

function merkleRoot(hashes) {
  if (hashes.length === 0) return crypto.createHash("sha256").update("EMPTY").digest("hex");
  let level = hashes;
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i], b = level[i + 1] ?? level[i];
      next.push(crypto.createHash("sha256").update(a + b).digest("hex"));
    }
    level = next;
  }
  return level[0];
}

export const handler = async (event) => {
  const tenants = new Set();
  for (const r of event.Records) {
    if (r.eventName === "INSERT") tenants.add(r.dynamodb.NewImage.PK.S);
  }
  for (const pk of tenants) {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :p)",
      ExpressionAttributeValues: { ":pk": pk, ":p": "EVENT#" },
      ScanIndexForward: true,
    }));
    const n = res.Items.length;
    if (n === 0) continue;

    // Use a BOUNDARY, not a modulo. `n % 10 === 0` silently breaks when a
    // Stream batch jumps the count past a multiple of 10 (e.g. 9 -> 24).
    // The boundary = highest multiple of 10 reached, so bursts still checkpoint.
    const boundary = Math.floor(n / CHECKPOINT_EVERY) * CHECKPOINT_EVERY;
    if (boundary === 0) continue;                       // fewer than 10 events yet

    // IDEMPOTENT by design: the S3 key is a pure function of `boundary`, so if
    // Streams retries or parallel shards re-run this, they write the SAME object
    // instead of racing. No tracker item -> no second read-then-write conflict.
    const upTo = res.Items.slice(0, boundary);          // checkpoint the boundary prefix
    const last = upTo[upTo.length - 1];
    const checkpoint = {
      tenant: pk, count: boundary, lastSeq: last.seq, lastHash: last.hash,
      merkleRoot: merkleRoot(upTo.map(i => i.hash)), ts: new Date().toISOString(),
    };
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: `${pk.replace("#", "_")}/checkpoint-${boundary}.json`,
      Body: JSON.stringify(checkpoint), ContentType: "application/json",
    }));
  }
  return { statusCode: 200 };
};
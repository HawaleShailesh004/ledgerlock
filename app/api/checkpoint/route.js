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
const BUCKET = process.env.WORM_BUCKET;

export async function GET(req) {
  const tenantId = new URL(req.url).searchParams.get("tenantId");
  const prefix = `TENANT_${tenantId}/`;
  const list = await s3.send(
    new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }),
  );
  const keys = (list.Contents || [])
    .map((o) => o.Key)
    .filter((k) => k.endsWith(".json"))
    .sort(
      (a, b) =>
        Number(b.match(/checkpoint-(\d+)\.json/)?.[1] || 0) -
        Number(a.match(/checkpoint-(\d+)\.json/)?.[1] || 0),
    );
  if (keys.length === 0) return Response.json({ checkpoint: null });
  const obj = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: keys[0] }),
  );
  const body = await obj.Body.transformToString();
  return Response.json({ checkpoint: JSON.parse(body) });
}

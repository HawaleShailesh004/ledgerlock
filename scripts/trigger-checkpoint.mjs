// Trigger the deployed checkpointer Lambda for a tenant (uses Lambda's S3 write role).
// Requires lambda:InvokeFunction — use ledgerlock-admin creds in .env.local:
//   LL_ADMIN_ACCESS_KEY_ID / LL_ADMIN_SECRET_ACCESS_KEY
//
// Usage: node scripts/trigger-checkpoint.mjs scale-test

import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { loadEnvLocal } from "../lib/load-env.mjs";

const useAwsProfile = process.argv.includes("--use-aws-profile");
loadEnvLocal();
if (useAwsProfile) {
  delete process.env.LL_ACCESS_KEY_ID;
  delete process.env.LL_SECRET_ACCESS_KEY;
  delete process.env.LL_ADMIN_ACCESS_KEY_ID;
  delete process.env.LL_ADMIN_SECRET_ACCESS_KEY;
}

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const tenantId = args[0];
const fn = process.env.CHECKPOINTER_FUNCTION || "ledgerlock-checkpointer";

if (!tenantId) {
  console.error("Usage: node scripts/trigger-checkpoint.mjs <tenantId>");
  process.exit(1);
}

const accessKeyId =
  process.env.LL_ADMIN_ACCESS_KEY_ID || process.env.LL_ACCESS_KEY_ID;
const secretAccessKey =
  process.env.LL_ADMIN_SECRET_ACCESS_KEY || process.env.LL_SECRET_ACCESS_KEY;

const lambdaConfig = { region: "ap-south-1" };
if (accessKeyId && secretAccessKey) {
  lambdaConfig.credentials = { accessKeyId, secretAccessKey };
}

if (!accessKeyId && !useAwsProfile) {
  console.error("Missing AWS credentials in .env.local");
  process.exit(1);
}

const lambda = new LambdaClient(lambdaConfig);

const payload = {
  Records: [
    {
      eventName: "INSERT",
      dynamodb: {
        NewImage: { PK: { S: `TENANT#${tenantId}` } },
      },
    },
  ],
};

console.log(`Invoking ${fn} for TENANT#${tenantId}...`);

const res = await lambda.send(
  new InvokeCommand({
    FunctionName: fn,
    Payload: Buffer.from(JSON.stringify(payload)),
  }),
);

const body = res.Payload ? Buffer.from(res.Payload).toString("utf8") : "";
console.log("Status:", res.StatusCode, body || "(no payload)");

if (res.FunctionError) {
  console.error("Lambda error:", res.FunctionError);
  process.exit(1);
}

console.log("Done — check S3 for latest checkpoint boundary.");

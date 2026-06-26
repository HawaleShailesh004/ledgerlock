import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export const TABLE = "LedgerLock";
export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: "ap-south-1",
  credentials: {
    accessKeyId: process.env.LL_ACCESS_KEY_ID,
    secretAccessKey: process.env.LL_SECRET_ACCESS_KEY,
  },
}));
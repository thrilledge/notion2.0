import { S3Client } from "@aws-sdk/client-s3";

export const R2_CONFIG = {
  accountId: process.env.R2_ACCOUNT_ID,
  bucketName: process.env.R2_BUCKET_NAME,
  publicUrl: process.env.R2_PUBLIC_URL,
};

export const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_CONFIG.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export function buildR2Key(folder: string, id: string, filename: string) {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${folder}/${id}/${safe}`;
}

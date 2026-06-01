import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { env } from "../config/env";

console.log("[s3] Initializing S3 client with:", {
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  bucket: env.S3_BUCKET,
  accessKey: env.S3_ACCESS_KEY ? "***set***" : "missing",
});

const s3Client = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
  forcePathStyle: true,
  requestHandler: {
    requestTimeout: 30000,
  } as any,
});

const BUCKET = env.S3_BUCKET;

export async function ensureBucketExists(): Promise<void> {
  console.log("[s3] ensureBucketExists: checking/creating bucket:", BUCKET);
  try {
    // First check if bucket exists
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET }));
      console.log(`[s3] Bucket '${BUCKET}' already exists`);
      return;
    } catch (headErr: any) {
      if (headErr.name === "NotFound" || headErr.$metadata?.httpStatusCode === 404) {
        console.log(`[s3] Bucket '${BUCKET}' not found, creating...`);
      } else {
        // Some other error, try creating anyway
        console.log(`[s3] HeadBucket check: ${headErr.message}, will try creating`);
      }
    }

    await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET }));
    console.log(`[s3] ✅ Bucket '${BUCKET}' created successfully`);
  } catch (err: any) {
    if (err.name === "BucketAlreadyOwnedByYou" || err.name === "BucketAlreadyExists") {
      console.log(`[s3] Bucket '${BUCKET}' already exists (from create attempt)`);
    } else {
      console.error(`[s3] ❌ Failed to create bucket '${BUCKET}':`, err.message || err);
      throw err;
    }
  }
}

export async function uploadFile(
  key: string,
  buffer: Buffer,
  mimeType: string
): Promise<void> {
  const sizeKB = (buffer.length / 1024).toFixed(1);
  console.log(`[s3] uploadFile: uploading to bucket='${BUCKET}' key='${key}' size=${sizeKB}KB type='${mimeType}'`);
  try {
    const result = await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      })
    );
    console.log(`[s3] ✅ uploadFile: success key='${key}' ETag='${result.ETag}'`);
  } catch (err: any) {
    console.error(`[s3] ❌ uploadFile: FAILED key='${key}'`, err.message || err);
    console.error(`[s3]    Error details:`, {
      name: err.name,
      code: err.code,
      statusCode: err.$metadata?.httpStatusCode,
      message: err.message,
    });
    throw err;
  }
}

export async function getFileStream(key: string) {
  console.log(`[s3] getFileStream: fetching object bucket='${BUCKET}' key='${key}'`);
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
      })
    );
    console.log(`[s3] ✅ getFileStream: success key='${key}' ContentType='${response.ContentType}' ContentLength='${response.ContentLength}'`);
    return response;
  } catch (err: any) {
    console.error(`[s3] ❌ getFileStream: FAILED key='${key}'`, err.message || err);
    console.error(`[s3]    Error details:`, {
      name: err.name,
      code: err.code,
      statusCode: err.$metadata?.httpStatusCode,
      message: err.message,
    });
    throw err;
  }
}

export async function deleteFile(key: string): Promise<void> {
  console.log(`[s3] deleteFile: deleting key='${key}' from bucket='${BUCKET}'`);
  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: key,
      })
    );
    console.log(`[s3] ✅ deleteFile: success key='${key}'`);
  } catch (err: any) {
    console.error(`[s3] ❌ deleteFile: FAILED key='${key}'`, err.message || err);
    throw err;
  }
}


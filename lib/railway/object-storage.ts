import "server-only"

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

type ObjectBytes = Buffer | Uint8Array | string

let cachedClient: S3Client | null = null

function required(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]
    if (value) return value
  }
  throw new Error(`Missing Railway bucket variable: ${names.join(" or ")}.`)
}

export function railwayBucketEnabled(): boolean {
  return Boolean(
    (process.env.RAILWAY_BUCKET_NAME ||
      process.env.AWS_S3_BUCKET_NAME ||
      process.env.BUCKET) &&
    (process.env.RAILWAY_BUCKET_ENDPOINT ||
      process.env.AWS_ENDPOINT_URL ||
      process.env.ENDPOINT) &&
    (process.env.RAILWAY_BUCKET_ACCESS_KEY_ID ||
      process.env.AWS_ACCESS_KEY_ID ||
      process.env.ACCESS_KEY_ID) &&
    (process.env.RAILWAY_BUCKET_SECRET_ACCESS_KEY ||
      process.env.AWS_SECRET_ACCESS_KEY ||
      process.env.SECRET_ACCESS_KEY)
  )
}

export function railwayBucketName(): string {
  return required("RAILWAY_BUCKET_NAME", "AWS_S3_BUCKET_NAME", "BUCKET")
}

export function getRailwayBucketClient(): S3Client {
  if (cachedClient) return cachedClient
  cachedClient = new S3Client({
    endpoint: required(
      "RAILWAY_BUCKET_ENDPOINT",
      "AWS_ENDPOINT_URL",
      "ENDPOINT"
    ),
    region:
      process.env.RAILWAY_BUCKET_REGION ??
      process.env.AWS_DEFAULT_REGION ??
      process.env.REGION ??
      "auto",
    forcePathStyle:
      (process.env.AWS_S3_URL_STYLE ?? "virtual").toLowerCase() === "path",
    credentials: {
      accessKeyId: required(
        "RAILWAY_BUCKET_ACCESS_KEY_ID",
        "AWS_ACCESS_KEY_ID",
        "ACCESS_KEY_ID"
      ),
      secretAccessKey: required(
        "RAILWAY_BUCKET_SECRET_ACCESS_KEY",
        "AWS_SECRET_ACCESS_KEY",
        "SECRET_ACCESS_KEY"
      ),
    },
  })
  return cachedClient
}

/** Preserve the Appwrite bucket/file identity during the storage cutover. */
export function railwayObjectKey(bucketId: string, fileId: string): string {
  return `appwrite/${encodeURIComponent(bucketId)}/${encodeURIComponent(fileId)}`
}

export async function putRailwayObject(input: {
  key: string
  body: ObjectBytes
  contentType?: string
}): Promise<void> {
  await getRailwayBucketClient().send(
    new PutObjectCommand({
      Bucket: railwayBucketName(),
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    })
  )
}

export async function railwayObjectExists(key: string): Promise<boolean> {
  try {
    await getRailwayBucketClient().send(
      new HeadObjectCommand({ Bucket: railwayBucketName(), Key: key })
    )
    return true
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode
    if (status === 404) return false
    throw error
  }
}

export async function readRailwayObject(key: string): Promise<Buffer> {
  const response = await getRailwayBucketClient().send(
    new GetObjectCommand({ Bucket: railwayBucketName(), Key: key })
  )
  if (!response.Body) throw new Error(`Railway object ${key} had no body.`)
  return Buffer.from(await response.Body.transformToByteArray())
}

export async function deleteRailwayObject(key: string): Promise<void> {
  await getRailwayBucketClient().send(
    new DeleteObjectCommand({ Bucket: railwayBucketName(), Key: key })
  )
}

export async function railwayObjectDownloadUrl(
  key: string,
  expiresIn = 900
): Promise<string> {
  return getSignedUrl(
    getRailwayBucketClient(),
    new GetObjectCommand({ Bucket: railwayBucketName(), Key: key }),
    { expiresIn }
  )
}

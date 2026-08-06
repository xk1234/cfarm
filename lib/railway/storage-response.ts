import "server-only"

import { GetObjectCommand } from "@aws-sdk/client-s3"

import {
  getRailwayBucketClient,
  railwayBucketName,
  railwayObjectKey,
} from "@/lib/railway/object-storage"

export async function railwayFileResponse(input: {
  bucketId: string
  fileId: string
  contentType: string
  range?: string | null
}): Promise<Response> {
  try {
    const object = await getRailwayBucketClient().send(
      new GetObjectCommand({
        Bucket: railwayBucketName(),
        Key: railwayObjectKey(input.bucketId, input.fileId),
        Range: input.range ?? undefined,
      })
    )
    if (!object.Body) {
      return Response.json({ error: "Asset unavailable" }, { status: 502 })
    }
    const headers = new Headers({
      "Accept-Ranges": object.AcceptRanges ?? "bytes",
      "Cache-Control": "private, max-age=3600",
      "Content-Type": object.ContentType ?? input.contentType,
      Vary: "Range",
    })
    if (object.ContentLength != null) {
      headers.set("Content-Length", String(object.ContentLength))
    }
    if (object.ContentRange) headers.set("Content-Range", object.ContentRange)
    if (object.ETag) headers.set("ETag", object.ETag)
    if (object.LastModified) {
      headers.set("Last-Modified", object.LastModified.toUTCString())
    }
    return new Response(object.Body.transformToWebStream(), {
      status: input.range ? 206 : 200,
      headers,
    })
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode
    return Response.json(
      { error: status === 404 ? "Asset not found" : "Asset unavailable" },
      { status: status === 404 ? 404 : 502 }
    )
  }
}

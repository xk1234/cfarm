import { serveFile } from "@/lib/files/serve"

export const dynamic = "force-dynamic"

/** Owner-checked file access for the private `media` and `renders` buckets. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ bucket: string; id: string }> }
) {
  const { bucket, id } = await params
  return serveFile(request, bucket, id)
}

import { NextResponse } from "next/server"

import { ApiError, withHandler } from "@/lib/api"
import { createUploadedAssetRecord } from "@/lib/assets"
import { MAX_MEDIA_BYTES, MediaRejectedError } from "@/lib/files/ingest"
import { requireWorkspaceId } from "@/lib/workspace"

export const dynamic = "force-dynamic"

export const POST = withHandler(async (request: Request) => {
  const workspaceId = await requireWorkspaceId()
  const formData = await request.formData()
  const file = formData.get("file")
  const name = stringValue(formData.get("name"))

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 })
  }
  if (file.size > MAX_MEDIA_BYTES) {
    throw new ApiError(413, `Files must be ${MAX_MEDIA_BYTES / 1024 / 1024} MB or smaller.`)
  }

  try {
    const asset = await createUploadedAssetRecord(workspaceId, {
      fileName: file.name,
      mimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
      name,
    })
    return NextResponse.json({ asset }, { status: 201 })
  } catch (error) {
    if (error instanceof MediaRejectedError) throw new ApiError(400, error.message)
    throw error
  }
})

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : ""
}

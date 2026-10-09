import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import {
  createUploadedAssetRecord,
  parseAssetCategory,
  parseAssetScope,
} from "@/lib/assets"

export const dynamic = "force-dynamic"

export const POST = withHandler(async (request: Request) => {
  const formData = await request.formData()
  const file = formData.get("file")
  const scope = parseAssetScope(formData.get("scope")) ?? "global"
  const category = parseAssetCategory(formData.get("category"))
  const name = stringValue(formData.get("name"))

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 })
  }

  const asset = await createUploadedAssetRecord({
    fileName: file.name,
    mimeType: file.type,
    bytes: Buffer.from(await file.arrayBuffer()),
    scope,
    category,
    name,
  })

  return NextResponse.json({ asset }, { status: 201 })
})

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : ""
}

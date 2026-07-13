import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import {
  listAssetRecords,
  parseAssetCategory,
  parseAssetKind,
  parseAssetScope,
} from "@/lib/assets"

export const dynamic = "force-dynamic"

export const GET = withHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url)
  const assets = await listAssetRecords({
    scope: parseAssetScope(searchParams.get("scope")),
    category: parseAssetCategory(searchParams.get("category")),
    kind: parseAssetKind(searchParams.get("kind")),
  })

  return NextResponse.json({ assets })
})

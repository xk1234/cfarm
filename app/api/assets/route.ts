import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import {
  listAssetRecords,
  parseAssetCategory,
  parseAssetKind,
  parseAssetScope,
} from "@/lib/assets"
import { requireWorkspaceId } from "@/lib/workspace"

export const dynamic = "force-dynamic"

export const GET = withHandler(async (request: Request) => {
  const workspaceId = await requireWorkspaceId()
  const { searchParams } = new URL(request.url)
  const assets = await listAssetRecords(workspaceId, {
    scope: parseAssetScope(searchParams.get("scope")),
    category: parseAssetCategory(searchParams.get("category")),
    kind: parseAssetKind(searchParams.get("kind")),
  })

  return NextResponse.json({ assets })
})

import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import { loadRealFarmData } from "@/lib/realfarm-data"

export const dynamic = "force-dynamic"

export const GET = withHandler(async () => {
  const data = await loadRealFarmData()
  return NextResponse.json({ assets: data.assets })
})

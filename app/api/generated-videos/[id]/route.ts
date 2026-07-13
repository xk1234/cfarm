import { NextResponse } from "next/server"

import { withHandler, readRouteId } from "@/lib/api"
import { deleteGeneratedVideoExport } from "@/lib/generated-videos"

export const dynamic = "force-dynamic"

export const DELETE = withHandler<{ params: Promise<{ id: string }> }>(
  async (_request, { params }) => {
    const id = await readRouteId(params)
    if (!id) {
      return NextResponse.json(
        { error: "A generated video export id is required" },
        { status: 400 }
      )
    }

    const generatedExport = await deleteGeneratedVideoExport({ id })
    if (!generatedExport) {
      return NextResponse.json(
        { error: "Generated video export not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({ export: generatedExport })
  }
)

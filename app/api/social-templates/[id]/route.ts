import { NextResponse } from "next/server"

import { ApiError, readRouteId, withHandler } from "@/lib/api"
import { deleteXAutomation } from "@/lib/x-automation-store"

export const DELETE = withHandler<{ params: Promise<{ id: string }> }>(
  async (_request, context) => {
    const id = await readRouteId(context.params)
    if (!id) throw new ApiError(400, "A template id is required")
    const deleted = await deleteXAutomation(id)
    if (!deleted) throw new ApiError(404, "Social template not found")
    return NextResponse.json({ deleted })
  }
)

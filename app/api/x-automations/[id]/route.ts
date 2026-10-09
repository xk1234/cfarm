import { NextResponse } from "next/server"

import { ApiError, readRouteId, withHandler } from "@/lib/api"
import { deleteXAutomation } from "@/lib/x-automation-store"

export const DELETE = withHandler<RouteContext<"/api/x-automations/[id]">>(
  async (_request, context) => {
    const id = await readRouteId(context.params)
    if (!id) throw new ApiError(400, "An automation id is required")
    const deleted = await deleteXAutomation(id)
    if (!deleted) throw new ApiError(404, "X automation not found")
    return NextResponse.json({ deleted })
  }
)

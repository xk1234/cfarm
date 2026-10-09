import { NextResponse } from "next/server"

import { withHandler, readRouteId } from "@/lib/api"
import { deleteAutomationCascade } from "@/lib/delete-automation"

export const dynamic = "force-dynamic"

export const DELETE = withHandler<{ params: Promise<{ id: string }> }>(
  async (_request, { params }) => {
    const id = await readRouteId(params)

    if (!id) {
      return NextResponse.json(
        { error: "An automation id is required" },
        { status: 400 }
      )
    }

    const result = await deleteAutomationCascade({ id })
    if (
      result.alreadyDeleted &&
      result.deletedSlideshowsCount === 0 &&
      result.deletedRunsCount === 0 &&
      result.deletedJobsCount === 0 &&
      result.deletedPostFastPostsCount === 0
    ) {
      return NextResponse.json(
        { error: "Automation not found" },
        { status: 404 }
      )
    }
    return NextResponse.json(result)
  }
)

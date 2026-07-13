import { NextResponse } from "next/server"

import { withHandler, readRouteId } from "@/lib/api"
import {
  automationRecordToSummary,
  deleteAutomationRecord,
} from "@/lib/automations"
import {
  deleteAutomationRuns,
  listAutomationRuns,
} from "@/lib/automation-runner"
import { deletePostFastPostRecords } from "@/lib/postfast-posts"
import { deleteSlideshowRecordsForAutomation } from "@/lib/slideshows"

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

    const record = await deleteAutomationRecord({ id })
    if (!record) {
      return NextResponse.json(
        { error: "Automation not found" },
        { status: 404 }
      )
    }
    const automationRuns = await listAutomationRuns({
      automationId: id,
      limit: Number.MAX_SAFE_INTEGER,
    })
    const deletedSlideshows = await deleteSlideshowRecordsForAutomation({
      automationId: id,
      slideshowIds: automationRuns
        .map((run) => run.slideshowId)
        .filter((slideshowId): slideshowId is string => Boolean(slideshowId)),
    })
    const slideshowIds = new Set(
      [
        ...automationRuns
          .map((run) => run.slideshowId)
          .filter((slideshowId): slideshowId is string => Boolean(slideshowId)),
        ...deletedSlideshows.map((slideshow) => slideshow.id),
      ].filter(Boolean)
    )
    const deletedPostFastSlideshowPosts = await deletePostFastPostRecords({
      sourceType: "slideshow",
      sourceIds: [...slideshowIds],
    })
    const deletedPostFastAutomationPosts = await deletePostFastPostRecords({
      sourceType: "automation",
      sourceIds: automationRuns.map((run) => run.id),
    })
    const deletedRuns = await deleteAutomationRuns({
      automationId: id,
      slideshowIds: [...slideshowIds],
    })

    return NextResponse.json({
      record,
      automation: automationRecordToSummary(record),
      deletedSlideshows,
      deletedSlideshowsCount: deletedSlideshows.length,
      deletedResultsCount: deletedSlideshows.length,
      deletedRuns,
      deletedRunsCount: deletedRuns.length,
      deletedPostFastPosts: [
        ...deletedPostFastSlideshowPosts,
        ...deletedPostFastAutomationPosts,
      ],
      deletedPostFastPostsCount:
        deletedPostFastSlideshowPosts.length +
        deletedPostFastAutomationPosts.length,
    })
  }
)

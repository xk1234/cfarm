import { NextResponse } from "next/server"

import { withHandler, readRouteId } from "@/lib/api"
import {
  deleteAutomationRuns,
  listAutomationRuns,
  removeAutomationRunSlide,
} from "@/lib/automation-runner"
import {
  deletePostFastPostRecords,
  listPostFastPostRecords,
} from "@/lib/postfast-posts"
import { deleteGeneratedSlideshowBenchmarks } from "@/lib/slideshow-benchmarks"
import { slideshowDeletionBlockReason } from "@/lib/slideshow-lifecycle"
import {
  deleteSlideshowRecord,
  listSlideshowRecords,
  removeSlideshowSlide,
} from "@/lib/slideshows"

export const dynamic = "force-dynamic"

export const PATCH = withHandler<{ params: Promise<{ id: string }> }>(
  async (request, { params }) => {
    const id = await readRouteId(params)
    if (!id) {
      return NextResponse.json(
        { error: "A slideshow id is required" },
        { status: 400 }
      )
    }
    const payload = (await request.json().catch(() => null)) as {
      action?: string
      slideIndex?: number
    } | null
    if (
      payload?.action !== "removeSlide" ||
      !Number.isInteger(payload.slideIndex)
    ) {
      return NextResponse.json(
        { error: "Unsupported slideshow update" },
        { status: 400 }
      )
    }

    const runs = await listAutomationRuns({ limit: Number.MAX_SAFE_INTEGER })
    const run = runs.find((item) => item.slideshowId === id)
    const posts = await listPostFastPostRecords().catch(() => [])
    const blocked = slideshowDeletionBlockReason({
      slideshowStatus: "exported",
      runStatus: run?.status,
      slideshowId: id,
      runId: run?.id,
      posts,
    })
    if (blocked === "published" || blocked === "scheduled") {
      return NextResponse.json(
        {
          error:
            blocked === "published"
              ? "Published slideshows cannot be edited."
              : "Scheduled slideshows cannot be edited before the scheduled post is cancelled.",
        },
        { status: 409 }
      )
    }

    let slideshow
    try {
      slideshow = await removeSlideshowSlide({
        id,
        slideIndex: payload.slideIndex!,
      })
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "The slide could not be removed.",
        },
        { status: 400 }
      )
    }
    if (!slideshow) {
      return NextResponse.json(
        { error: "Slideshow not found" },
        { status: 404 }
      )
    }
    const updatedRun = await removeAutomationRunSlide({
      slideshowId: id,
      slideIndex: payload.slideIndex!,
    })

    return NextResponse.json({ slideshow, run: updatedRun })
  }
)

export const DELETE = withHandler<{ params: Promise<{ id: string }> }>(
  async (_request, { params }) => {
    const id = await readRouteId(params)
    if (!id) {
      return NextResponse.json(
        { error: "A slideshow id is required" },
        { status: 400 }
      )
    }

    const [slideshow] = await listSlideshowRecords({ id, limit: 1 })
    if (!slideshow) {
      return NextResponse.json(
        { error: "Slideshow not found" },
        { status: 404 }
      )
    }

    const runs = await listAutomationRuns({ limit: Number.MAX_SAFE_INTEGER })
    const run = runs.find((item) => item.slideshowId === id)
    const posts = await listPostFastPostRecords().catch(() => [])
    const blocked = slideshowDeletionBlockReason({
      slideshowStatus: slideshow.status,
      runStatus: run?.status,
      slideshowId: id,
      runId: run?.id,
      posts,
    })
    if (blocked) {
      const error =
        blocked === "published"
          ? "Published slideshows cannot be deleted."
          : blocked === "scheduled"
            ? "Scheduled slideshows cannot be deleted before the scheduled post is cancelled."
            : "Only completed slideshows can be deleted."
      return NextResponse.json({ error }, { status: 409 })
    }

    const deletedSlideshow = await deleteSlideshowRecord({ id })
    if (!deletedSlideshow) {
      return NextResponse.json(
        { error: "Slideshow not found" },
        { status: 404 }
      )
    }

    const [deletedRuns] = await Promise.all([
      deleteAutomationRuns({ slideshowIds: [id] }),
      deleteGeneratedSlideshowBenchmarks(id),
      deletePostFastPostRecords({
        sourceType: "slideshow",
        sourceIds: [id],
      }),
      ...(run
        ? [
            deletePostFastPostRecords({
              sourceType: "automation" as const,
              sourceIds: [run.id],
            }),
          ]
        : []),
    ])

    return NextResponse.json({
      slideshow: deletedSlideshow,
      deletedRunIds: deletedRuns.map((item) => item.id),
    })
  }
)

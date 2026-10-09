import { NextResponse } from "next/server"

import { withHandler, readRouteId } from "@/lib/api"
import {
  deletePosts,
  listPublicationRecordsForRead,
} from "@/lib/post-repository"
import { slideshowDeletionBlockReason } from "@/lib/slideshow-lifecycle"
import {
  deleteSlideshowRecord,
  listSlideshowRecords,
  updateSlideshowMetadata,
} from "@/lib/slideshows"

export const dynamic = "force-dynamic"

export const GET = withHandler<{ params: Promise<{ id: string }> }>(
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
    return NextResponse.json({ slideshow })
  }
)

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
      title?: string
      caption?: string
      hashtags?: string
    } | null
    if (
      payload?.action !== "updateMetadata" ||
      typeof payload.title !== "string" ||
      typeof payload.caption !== "string" ||
      typeof payload.hashtags !== "string" ||
      !payload.title.trim()
    ) {
      return NextResponse.json(
        { error: "Unsupported slideshow update" },
        { status: 400 }
      )
    }

    const posts = await listPublicationRecordsForRead({
      surface: "slideshow_edit_guard",
      filters: { sourceIds: [id] },
    }).catch(() => [])
    const blocked = slideshowDeletionBlockReason({
      slideshowStatus: "exported",
      slideshowId: id,
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
      slideshow = await updateSlideshowMetadata({
        id,
        title: payload.title,
        caption: payload.caption,
        hashtags: payload.hashtags,
      })
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "The slideshow details could not be saved.",
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
    return NextResponse.json({ slideshow })
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

    const posts = await listPublicationRecordsForRead({
      surface: "slideshow_deletion_guard",
      filters: { sourceIds: [id] },
    }).catch(() => [])
    const blocked = slideshowDeletionBlockReason({
      slideshowStatus: slideshow.status,
      slideshowId: id,
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

    await deletePosts({
      sourceType: "slideshow",
      sourceIds: [id],
    })

    return NextResponse.json({ slideshow: deletedSlideshow })
  }
)

import { NextResponse } from "next/server"

import { withHandler, readRouteId } from "@/lib/api"
import {
  deleteGeneratedVideoExport,
  getGeneratedVideoExport,
  markGeneratedVideoExportPublished,
} from "@/lib/generated-videos"
import { generatedVideoDeletionBlockReason } from "@/lib/generated-video-deletion"
import { listPostFastPostRecords } from "@/lib/postfast-posts"

export const dynamic = "force-dynamic"

export const PATCH = withHandler<{ params: Promise<{ id: string }> }>(
  async (request, { params }) => {
    const id = await readRouteId(params)
    const payload = await request.json().catch(() => null)
    if (!id || payload?.action !== "markPublished") {
      return NextResponse.json(
        { error: "A generated video id and markPublished action are required" },
        { status: 400 }
      )
    }
    const generatedExport = await markGeneratedVideoExportPublished({ id })
    if (!generatedExport) {
      return NextResponse.json(
        { error: "Generated video export not found" },
        { status: 404 }
      )
    }
    return NextResponse.json({ export: generatedExport })
  }
)

export const DELETE = withHandler<{ params: Promise<{ id: string }> }>(
  async (_request, { params }) => {
    const id = await readRouteId(params)
    if (!id) {
      return NextResponse.json(
        { error: "A generated video export id is required" },
        { status: 400 }
      )
    }

    const [existingExport, posts] = await Promise.all([
      getGeneratedVideoExport(id),
      listPostFastPostRecords(),
    ])
    if (!existingExport) {
      return NextResponse.json(
        { error: "Generated video export not found" },
        { status: 404 }
      )
    }
    const blockedBy = existingExport.manuallyPublishedAt
      ? "published"
      : generatedVideoDeletionBlockReason(id, posts)
    if (blockedBy) {
      return NextResponse.json(
        {
          error:
            blockedBy === "published"
              ? "Published videos cannot be deleted"
              : "Scheduled videos cannot be deleted",
        },
        { status: 409 }
      )
    }

    const generatedExport = await deleteGeneratedVideoExport({ id })

    return NextResponse.json({ export: generatedExport })
  }
)

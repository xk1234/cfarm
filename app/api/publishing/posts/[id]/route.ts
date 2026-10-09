import { NextResponse } from "next/server"
import { z } from "zod"

import { ApiError, readRouteId, validate } from "@/lib/api"
import { publishingRoute, readJson, requireWorkspace } from "@/lib/publishing/http"
import { cancelPost, getPost, reschedulePost } from "@/lib/publishing/service"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

async function postId(context: Context) {
  const id = await readRouteId(context.params)
  if (!id) throw new ApiError(400, "Post id is required")
  return id
}

export const GET = publishingRoute<Context>(async (_request, context) => {
  const { workspaceId } = await requireWorkspace()
  return NextResponse.json({ post: await getPost(workspaceId, await postId(context)) })
})

const RescheduleBody = z
  .object({
    publishAt: z.string().datetime({ offset: true }).optional(),
    /** Calendar drag-and-drop sends `scheduledAt`. */
    scheduledAt: z.string().datetime({ offset: true }).optional(),
  })
  .refine((body) => body.publishAt || body.scheduledAt, { message: "publishAt is required" })

/** Reschedules a scheduled post (`{ publishAt }`). */
export const PATCH = publishingRoute<Context>(async (request, context) => {
  const { workspaceId } = await requireWorkspace()
  const body = validate(RescheduleBody, await readJson(request))
  const post = await reschedulePost(workspaceId, await postId(context), (body.publishAt ?? body.scheduledAt)!)
  return NextResponse.json({ post })
})

/** Cancels a scheduled post (also deletes it in SocialBu). */
export const DELETE = publishingRoute<Context>(async (_request, context) => {
  const { workspaceId } = await requireWorkspace()
  return NextResponse.json({ post: await cancelPost(workspaceId, await postId(context)) })
})

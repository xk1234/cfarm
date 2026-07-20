import { NextResponse } from "next/server"

import { postfastRequest } from "@/lib/postfast-client"
import {
  deletePostFastPostRecordById,
  getPostFastPostRecord,
} from "@/lib/postfast-posts"
import { postfastRouteError } from "@/lib/postfast-route"
import { reschedulePost } from "@/lib/publishing"

export const dynamic = "force-dynamic"

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  if (id.startsWith("postfast:")) {
    return NextResponse.json(
      { error: "Only posts created by this app can be rescheduled" },
      { status: 409 }
    )
  }

  let scheduledAt = ""
  try {
    const body = (await request.json()) as { scheduledAt?: unknown }
    scheduledAt =
      typeof body.scheduledAt === "string" ? body.scheduledAt.trim() : ""
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const timestamp = Date.parse(scheduledAt)
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
    return NextResponse.json(
      { error: "Choose a valid future time for the post" },
      { status: 400 }
    )
  }

  const record = await getPostFastPostRecord(id)
  if (!record || record.status !== "scheduled" || !record.postfastPostId) {
    return NextResponse.json(
      { error: "Scheduled PostFast post not found" },
      { status: 404 }
    )
  }

  try {
    const updated = await reschedulePost({
      record,
      scheduledFor: new Date(timestamp).toISOString(),
    })
    return NextResponse.json({ record: updated })
  } catch (error) {
    return postfastRouteError(error)
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const remoteOnlyId = id.startsWith("postfast:") ? id.slice(9) : ""
  const record = remoteOnlyId ? null : await getPostFastPostRecord(id)
  const postfastPostId = remoteOnlyId || record?.postfastPostId
  if (!postfastPostId) {
    return NextResponse.json(
      { error: "Scheduled PostFast post not found" },
      { status: 404 }
    )
  }

  try {
    await postfastRequest(
      `/social-posts/${encodeURIComponent(postfastPostId)}`,
      { method: "DELETE" }
    )
    if (record) await deletePostFastPostRecordById(record.id)
    return NextResponse.json({ deleted: true })
  } catch (error) {
    return postfastRouteError(error)
  }
}

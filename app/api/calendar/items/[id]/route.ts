import { NextResponse } from "next/server"

import { postfastRequest } from "@/lib/postfast-client"
import {
  deletePostFastPostRecordById,
  getPostFastPostRecord,
} from "@/lib/postfast-posts"
import { postfastRouteError } from "@/lib/postfast-route"

export const dynamic = "force-dynamic"

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

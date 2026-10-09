import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import { getRepositories } from "@/lib/data"
import { requireWorkspaceId } from "@/lib/workspace"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

function postIdFrom(raw: string) {
  const id = decodeURIComponent(raw).trim()
  return id.startsWith("post:") ? id.slice(5) : id
}

/**
 * Reschedules a post that is still only scheduled locally. Posts already
 * handed to SocialBu (`providerPostId`) are changed by the publishing flow.
 */
export const PATCH = withHandler<Context>(async (request, context) => {
  const workspaceId = await requireWorkspaceId()
  const id = postIdFrom((await context.params).id)
  let publishAt = ""
  try {
    const body = (await request.json()) as { scheduledAt?: unknown }
    publishAt = typeof body.scheduledAt === "string" ? body.scheduledAt.trim() : ""
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const timestamp = Date.parse(publishAt)
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
    return NextResponse.json({ error: "Choose a valid future time for the post" }, { status: 400 })
  }

  const repos = getRepositories()
  const post = await repos.posts.get(workspaceId, id)
  if (!post || post.status !== "scheduled") {
    return NextResponse.json({ error: "Scheduled post not found" }, { status: 404 })
  }
  if (post.providerPostId) {
    return NextResponse.json(
      { error: "This post is already scheduled with SocialBu; change it from the publishing dialog." },
      { status: 409 }
    )
  }
  await repos.notifications.cancelForPost(workspaceId, post.id)
  const updated = await repos.posts.update(workspaceId, post.id, {
    publishAt: new Date(timestamp).toISOString(),
  })
  return NextResponse.json({ record: updated })
})

/** Cancels a locally scheduled post (and its pending reminders). */
export const DELETE = withHandler<Context>(async (_request, context) => {
  const workspaceId = await requireWorkspaceId()
  const id = postIdFrom((await context.params).id)
  const repos = getRepositories()
  const post = await repos.posts.get(workspaceId, id)
  if (!post || (post.status !== "scheduled" && post.status !== "draft")) {
    return NextResponse.json({ error: "Scheduled post not found" }, { status: 404 })
  }
  if (post.providerPostId) {
    return NextResponse.json(
      { error: "This post is already scheduled with SocialBu; cancel it from the publishing dialog." },
      { status: 409 }
    )
  }
  await repos.notifications.cancelForPost(workspaceId, post.id)
  await repos.posts.cancel(workspaceId, post.id)
  return NextResponse.json({ deleted: true })
})

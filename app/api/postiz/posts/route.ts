import { NextResponse } from "next/server"

import { createPostizPostPayload, postizRequest, type PostizCreatePostType, type PostizMedia } from "@/lib/postiz-client"
import { defaultPostizProviderSettings } from "@/lib/postiz-provider-settings"
import { upsertPostizPostRecord, type PostizPostStatus, type PostizSourceType } from "@/lib/postiz-posts"
import { postizRouteError } from "@/lib/postiz-route"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  try {
    const posts = await postizRequest("/posts", {
      query: {
        startDate: searchParams.get("startDate") ?? undefined,
        endDate: searchParams.get("endDate") ?? undefined,
        customer: searchParams.get("customer") ?? undefined,
      },
    })
    return NextResponse.json({ posts: postizPostsResponse(posts), configured: true })
  } catch (error) {
    const response = postizRouteError(error)
    if (response.status === 503) {
      return NextResponse.json({
        posts: { posts: [] },
        configured: false,
        error: "POSTIZ_API_KEY is not configured",
      }, { status: 200 })
    }
    return response
  }
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null)
  const integrationId = stringValue(payload?.integrationId)
  const provider = stringValue(payload?.provider)
  const content = stringValue(payload?.content)
  const sourceType = sourceTypeValue(payload?.sourceType)
  const sourceId = stringValue(payload?.sourceId)

  if (!integrationId || !provider || !content || !sourceType || !sourceId) {
    return NextResponse.json({ error: "sourceType, sourceId, integrationId, provider, and content are required" }, { status: 400 })
  }

  const type = postTypeValue(payload?.type) ?? "draft"
  const media = mediaValue(payload?.media)
  const settings = defaultPostizProviderSettings(provider, recordValue(payload?.settings))
  const postPayload = createPostizPostPayload({
    type,
    date: stringValue(payload?.date),
    integrationId,
    provider,
    content,
    media,
    settings,
    shortLink: Boolean(payload?.shortLink),
    tags: arrayOfStrings(payload?.tags),
  })

  try {
    const postizPosts = await postizRequest<unknown[]>("/posts", {
      body: postPayload,
    })
    const firstPost = recordValue(postizPosts[0])
    const record = await upsertPostizPostRecord({
      sourceType,
      sourceId,
      postizPostId: stringValue(firstPost.postId),
      integrationId,
      provider,
      status: statusForType(type),
      scheduledAt: type === "schedule" ? stringValue(payload?.date) : undefined,
      releaseUrl: stringValue(firstPost.releaseURL),
      content,
      media,
    })

    return NextResponse.json({ postizPosts, record }, { status: 201 })
  } catch (error) {
    await upsertPostizPostRecord({
      sourceType,
      sourceId,
      integrationId,
      provider,
      status: "failed",
      content,
      media,
      error: error instanceof Error ? error.message : "Postiz post creation failed",
    })
    return postizRouteError(error)
  }
}

function statusForType(type: PostizCreatePostType): PostizPostStatus {
  if (type === "schedule") {
    return "scheduled"
  }
  return type === "now" ? "published" : "draft"
}

function postTypeValue(value: unknown): PostizCreatePostType | undefined {
  return value === "draft" || value === "schedule" || value === "now" ? value : undefined
}

function sourceTypeValue(value: unknown): PostizSourceType | undefined {
  return value === "automation" || value === "generated_video" || value === "asset" || value === "greenscreen" || value === "ugc_ad" || value === "image" || value === "swipe" || value === "slideshow" || value === "manual" ? value : undefined
}

function mediaValue(value: unknown): PostizMedia[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((item) => {
    const record = recordValue(item)
    const id = stringValue(record.id)
    const path = stringValue(record.path)
    return id && path ? [{ id, path }] : []
  })
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.map(stringValue).filter(Boolean) : []
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function postizPostsResponse(remotePosts: unknown) {
  const record = recordValue(remotePosts)
  const posts = Array.isArray(record.posts) ? record.posts : Array.isArray(remotePosts) ? remotePosts : []
  return {
    ...record,
    posts,
  }
}

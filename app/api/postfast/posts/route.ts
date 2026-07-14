import { NextResponse } from "next/server"

import {
  postfastRequest,
  type PostFastCreatePostType,
  type PostFastMedia,
} from "@/lib/postfast-client"
import {
  listPostFastPostRecords,
  type PostFastPostRecord,
  type PostFastSourceType,
} from "@/lib/postfast-posts"
import { postfastRouteError } from "@/lib/postfast-route"
import { publishPost } from "@/lib/publishing"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get("startDate") ?? undefined
  const endDate = searchParams.get("endDate") ?? undefined

  try {
    const posts = await postfastRequest("/social-posts", {
      query: {
        from: startDate,
        to: endDate,
        page: searchParams.get("page") ?? 0,
        limit: searchParams.get("limit") ?? 50,
      },
    })
    return NextResponse.json({
      posts: await postfastPostsResponse(posts),
      configured: true,
    })
  } catch (error) {
    const response = postfastRouteError(error)
    if (response.status === 503) {
      return NextResponse.json(
        {
          posts: { posts: [] },
          configured: false,
          error: "POSTFAST_API_KEY is not configured",
        },
        { status: 200 }
      )
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
    return NextResponse.json(
      {
        error:
          "sourceType, sourceId, integrationId, provider, and content are required",
      },
      { status: 400 }
    )
  }

  const type = postTypeValue(payload?.type) ?? "draft"
  const media = mediaValue(payload?.media)

  const result = await publishPost({
    type,
    date: stringValue(payload?.date),
    integrationId,
    provider,
    content,
    media,
    settings: recordValue(payload?.settings),
    sourceType,
    sourceId,
  })

  if (result.ok) {
    return NextResponse.json(
      { postfastPosts: result.postfastPosts, record: result.record },
      { status: 201 }
    )
  }
  return postfastRouteError(result.rawError)
}

function postTypeValue(value: unknown): PostFastCreatePostType | undefined {
  return value === "draft" || value === "schedule" || value === "now"
    ? value
    : undefined
}

function sourceTypeValue(value: unknown): PostFastSourceType | undefined {
  return value === "automation" ||
    value === "x_automation" ||
    value === "generated_video" ||
    value === "asset" ||
    value === "greenscreen" ||
    value === "ugc_ad" ||
    value === "image" ||
    value === "swipe" ||
    value === "slideshow" ||
    value === "manual"
    ? value
    : undefined
}

function mediaValue(value: unknown): PostFastMedia[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((item) => {
    const record = recordValue(item)
    const key = stringValue(record.key)
    const type = mediaTypeValue(record.type)
    const sortOrder =
      typeof record.sortOrder === "number" ? record.sortOrder : undefined
    return key && type ? [{ key, type, sortOrder }] : []
  })
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

async function postfastPostsResponse(remotePosts: unknown) {
  const record = recordValue(remotePosts)
  const posts = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.posts)
      ? record.posts
      : Array.isArray(remotePosts)
        ? remotePosts
        : []
  const localPosts = await listPostFastPostRecords()
  const localPostsByPostFastId = new Map(
    localPosts.flatMap((post) =>
      post.postfastPostId ? [[post.postfastPostId, post]] : []
    )
  )
  const enrichedPosts = posts.map((post) =>
    enrichPostFastPost(post, localPostsByPostFastId)
  )
  return {
    ...record,
    posts: enrichedPosts,
  }
}

function enrichPostFastPost(
  post: unknown,
  localPostsByPostFastId: Map<string, PostFastPostRecord>
) {
  const record = recordValue(post)
  const localPost = localPostsByPostFastId.get(stringValue(record.id))
  if (!localPost) {
    return post
  }

  return {
    ...record,
    sourceId: localPost.sourceId,
    sourceType: localPost.sourceType,
    integration: {
      ...recordValue(record.integration),
      id: localPost.integrationId,
      providerIdentifier: localPost.provider,
    },
  }
}

function mediaTypeValue(value: unknown) {
  return value === "IMAGE" || value === "VIDEO" ? value : undefined
}

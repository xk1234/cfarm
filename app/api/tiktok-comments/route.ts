import { NextResponse } from "next/server"
import { z } from "zod"

import { ApiError, validate, withHandler } from "@/lib/api"
import { getCurrentUser } from "@/lib/auth"
import { withSystemOwner } from "@/lib/system-owner-context"
import {
  approveTikTokReplyDrafts,
  createTikTokCommentCollection,
  listTikTokCommentCollections,
  listTikTokComments,
  listTikTokReplyApprovals,
  listTikTokReplyDrafts,
  queueApprovedTikTokReplies,
} from "@/lib/tiktok-comments"
import { draftTikTokCommentReplies } from "@/lib/tiktok-comment-replies"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const startSchema = z.object({
  action: z.literal("collect_start"),
  postIds: z.array(z.string().trim().min(1)).min(1).max(50),
  scope: z.literal("topLevel").default("topLevel"),
  maxComments: z.number().int().min(1).max(500).default(100),
})
const draftSchema = z.object({
  action: z.literal("draft"),
  collectionId: z.string().trim().min(1),
  postContextById: z.record(z.string(), z.string().max(100000)).optional(),
  emojiSet: z.array(z.string().trim().min(1).max(20)).min(4).max(40).optional(),
})
const approveSchema = z.object({
  action: z.literal("approve"),
  collectionId: z.string().trim().min(1),
  approvals: z
    .array(
      z.object({
        draftId: z.string().trim().min(1),
        text: z.string().trim().min(1).max(1000).optional(),
        heart: z.boolean().optional(),
      })
    )
    .min(1)
    .max(500),
})
const sendSchema = z.object({
  action: z.literal("send"),
  collectionId: z.string().trim().min(1),
  draftIds: z.array(z.string().trim().min(1)).min(1).max(500),
  confirmSend: z.literal(true),
})

export const GET = withHandler(async (request: Request) => {
  const user = await requireUser()
  const params = new URL(request.url).searchParams
  const collectionId = params.get("collectionId")?.trim()
  const postId = params.get("postId")?.trim()
  if (!collectionId && !postId) {
    return NextResponse.json({
      collections: await withSystemOwner(user.$id, () =>
        listTikTokCommentCollections()
      ),
    })
  }
  const result = await withSystemOwner(user.$id, async () => ({
    comments: await listTikTokComments({ collectionId, postId }),
    drafts: collectionId ? await listTikTokReplyDrafts(collectionId) : [],
    approvals: collectionId ? await listTikTokReplyApprovals(collectionId) : [],
  }))
  return NextResponse.json(result)
})

export const POST = withHandler(async (request: Request) => {
  const user = await requireUser()
  const body = await request.json().catch(() => null)
  if (body?.action === "collect_start") {
    const input = validate(startSchema, body)
    const result = await withSystemOwner(user.$id, () =>
      createTikTokCommentCollection({ ownerId: user.$id, ...input })
    )
    return NextResponse.json({
      collection: result.collection,
      companion: {
        version: 1 as const,
        endpoint: new URL(
          "/api/tiktok-comments/capture",
          request.url
        ).toString(),
        token: result.token,
        expiresAt: result.collection.expiresAt,
      },
    })
  }
  if (body?.action === "draft") {
    const { action: _, ...input } = validate(draftSchema, body)
    void _
    return NextResponse.json({
      drafts: await withSystemOwner(user.$id, () =>
        draftTikTokCommentReplies(input)
      ),
    })
  }
  if (body?.action === "approve") {
    const { action: _, ...input } = validate(approveSchema, body)
    void _
    return NextResponse.json({
      approvals: await withSystemOwner(user.$id, () =>
        approveTikTokReplyDrafts(input)
      ),
    })
  }
  if (body?.action === "send") {
    const { action: _, ...input } = validate(sendSchema, body)
    void _
    return NextResponse.json({
      sends: await withSystemOwner(user.$id, () =>
        queueApprovedTikTokReplies(input)
      ),
    })
  }
  throw new ApiError(400, "Unknown TikTok comment action")
})

async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new ApiError(401, "Authentication required")
  return user
}

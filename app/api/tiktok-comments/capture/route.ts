import { NextResponse } from "next/server"

import { withSystemOwner } from "@/lib/system-owner-context"
import { draftTikTokCommentReplies } from "@/lib/tiktok-comment-replies"
import {
  approveTikTokReplyDrafts,
  getTikTokCommentCompanionManifest,
  ingestTikTokComments,
  queueApprovedTikTokReplies,
  recordTikTokCommentSendResults,
  tiktokCommentCaptureContext,
} from "@/lib/tiktok-comments"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "600",
}
const MAX_BYTES = 2_500_000

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}

export async function GET(request: Request) {
  try {
    const token = bearerToken(request.headers.get("authorization"))
    const context = tiktokCommentCaptureContext(token)
    const manifest = await withSystemOwner(context.ownerId, () =>
      getTikTokCommentCompanionManifest(token)
    )
    return json(manifest)
  } catch (error) {
    return json({ error: message(error, "Comment manifest failed") }, 401)
  }
}

export async function POST(request: Request) {
  try {
    const token = bearerToken(request.headers.get("authorization"))
    if (Number(request.headers.get("content-length") || 0) > MAX_BYTES) {
      return json({ error: "Capture payload is too large" }, 413)
    }
    const text = await request.text()
    if (Buffer.byteLength(text, "utf8") > MAX_BYTES) {
      return json({ error: "Capture payload is too large" }, 413)
    }
    const body = JSON.parse(text)
    const context = tiktokCommentCaptureContext(token)
    const result = await withSystemOwner(context.ownerId, async () => {
      if (typeof body.action === "string") {
        assertCollection(context.collectionId, body.collectionId)
        if (body.action === "draft") {
          return {
            drafts: await draftTikTokCommentReplies({
              collectionId: context.collectionId,
            }),
          }
        }
        if (body.action === "approve") {
          return {
            approvals: await approveTikTokReplyDrafts({
              collectionId: context.collectionId,
              approvals: companionApprovals(body.approvals),
            }),
          }
        }
        if (body.action === "send") {
          if (body.confirmSend !== true) {
            throw new Error("confirmSend must be true")
          }
          return {
            sends: await queueApprovedTikTokReplies({
              collectionId: context.collectionId,
              draftIds: companionDraftIds(body.draftIds),
              confirmSend: true,
            }),
          }
        }
        throw new Error("Unknown comment companion action")
      }
      const sendResults = Array.isArray(body.sendResults)
        ? await recordTikTokCommentSendResults({
            collectionId: assertedCollection(
              context.collectionId,
              body.collectionId
            ),
            results: body.sendResults,
          })
        : []
      const capture =
        Array.isArray(body.comments) && !Array.isArray(body.sendResults)
          ? await ingestTikTokComments({
              token,
              collectionId: assertedCollection(
                context.collectionId,
                body.collectionId
              ),
              postId: String(body.postId || ""),
              comments: body.comments,
              complete: body.complete,
              error: typeof body.error === "string" ? body.error : undefined,
            })
          : { accepted: 0, collection: undefined }
      return { ...capture, sendResults }
    })
    return json(result)
  } catch (error) {
    return json({ error: message(error, "Comment capture failed") }, 401)
  }
}

function assertedCollection(expected: string, supplied: unknown) {
  assertCollection(expected, supplied)
  return expected
}

function assertCollection(expected: string, supplied: unknown) {
  if (String(supplied || "").trim() !== expected) {
    throw new Error("Capture token does not match collection")
  }
}

function companionApprovals(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) {
    throw new Error("Select at least one reply to approve")
  }
  return value.map((item) => {
    const input =
      item && typeof item === "object" ? (item as Record<string, unknown>) : {}
    const draftId = String(input.draftId || "").trim()
    const text = String(input.text || "").trim()
    if (!draftId || !text) throw new Error("Approved reply text is required")
    return {
      draftId,
      text: text.slice(0, 1000),
      heart: input.heart === true,
    }
  })
}

function companionDraftIds(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) {
    throw new Error("Select at least one approved reply to send")
  }
  const ids = [...new Set(value.map((item) => String(item || "").trim()))]
    .filter(Boolean)
    .slice(0, 500)
  if (!ids.length) throw new Error("Select at least one approved reply to send")
  return ids
}

function bearerToken(value: string | null) {
  const match = value?.match(/^Bearer\s+(.+)$/i)
  if (!match?.[1]) throw new Error("Capture token is required")
  return match[1]
}
function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}
function json(value: object, status = 200) {
  return NextResponse.json(value, { status, headers: corsHeaders })
}

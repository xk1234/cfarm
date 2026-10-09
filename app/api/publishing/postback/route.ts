import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import { verifyPostback } from "@/lib/publishing/postback"
import { enqueuePublishJob } from "@/lib/publishing/service"

export const dynamic = "force-dynamic"

/**
 * SocialBu postback (`postback_url` on created posts). The signed query names
 * our post; the body is ignored and a `publish-post` job re-reads the post
 * from SocialBu, so a forged body cannot change any state.
 */
export const POST = withHandler(async (request: Request) => {
  const target = verifyPostback(new URL(request.url))
  if (!target) return NextResponse.json({ error: "Invalid postback" }, { status: 403 })
  await enqueuePublishJob(target.workspaceId, target.postId, new Date())
  return NextResponse.json({ ok: true })
})

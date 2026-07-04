import { NextResponse } from "next/server"

import { postizRequest } from "@/lib/postiz-client"
import { updatePostizPostAnalytics, type PostizAnalyticsMetric } from "@/lib/postiz-posts"
import { postizRouteError } from "@/lib/postiz-route"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const postId = searchParams.get("postId")?.trim()
  const recordId = searchParams.get("recordId")?.trim()

  if (!postId) {
    return NextResponse.json({ error: "A postId is required" }, { status: 400 })
  }

  try {
    const analytics = await postizRequest<PostizAnalyticsMetric[]>(`/analytics/post/${encodeURIComponent(postId)}`, {
      query: {
        date: searchParams.get("days") ?? 30,
      },
    })
    const record = recordId ? await updatePostizPostAnalytics({ id: recordId, analytics }) : null
    return NextResponse.json({ analytics, record })
  } catch (error) {
    return postizRouteError(error)
  }
}

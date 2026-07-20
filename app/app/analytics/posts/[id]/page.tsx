import { notFound, redirect } from "next/navigation"

import { PostAnalyticsPage } from "@/components/realfarm/analytics/post-analytics-page"
import { getCurrentUser } from "@/lib/auth"
import { inferPostContentType } from "@/lib/post-content-type"
import { listAnalyticsIntegrations } from "@/lib/postfast-analytics"
import type { PostFastSocialIntegration } from "@/lib/postfast-client"
import { listMetricSnapshots } from "@/lib/postfast-metric-snapshots"
import { getPostFastPostRecord } from "@/lib/postfast-posts"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Post analytics",
  robots: { index: false, follow: false },
}

export default async function PostAnalyticsRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  const { id } = await params
  const postId = id.trim()
  const [allSnapshots, publication, integrations] = await Promise.all([
    listMetricSnapshots().catch(() => []),
    getPostFastPostRecord(postId).catch(() => null),
    listAnalyticsIntegrations().catch(() => []),
  ])
  const snapshots = allSnapshots
    .filter((snapshot) => snapshot.postId === postId)
    .sort(
      (left, right) =>
        Date.parse(left.capturedAt) - Date.parse(right.capturedAt)
    )
  const latest = snapshots.at(-1)
  if (!latest) notFound()

  const integration =
    integrations.find((item) => item.integration_id === latest.integrationId) ??
    fallbackIntegration(latest)
  const contentType = inferPostContentType({
    sourceType: publication?.sourceType || latest.sourceType,
    media: publication?.media,
  })

  return (
    <PostAnalyticsPage
      snapshots={snapshots}
      integration={integration}
      contentType={latest.contentType || contentType}
    />
  )
}

function fallbackIntegration(input: {
  integrationId: string
  provider: string
}): PostFastSocialIntegration {
  return {
    integration_id: input.integrationId,
    provider: input.provider as PostFastSocialIntegration["provider"],
    name: `${input.provider || "Social"} account`,
  }
}

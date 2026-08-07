import { notFound, redirect } from "next/navigation"

import { StandaloneMobileNav } from "@/components/realfarm/standalone-mobile-nav"
import { PostAnalyticsPage } from "@/components/realfarm/analytics/post-analytics-page"
import { getAutomationRunForSlideshow } from "@/lib/automation-runner"
import { absoluteAssetUrl } from "@/lib/asset-urls"
import { getCurrentUser } from "@/lib/auth"
import { inferPostContentType } from "@/lib/post-content-type"
import { listAnalyticsIntegrations } from "@/lib/postfast-analytics"
import type { PostFastSocialIntegration } from "@/lib/postfast-client"
import { listMetricSnapshots } from "@/lib/postfast-metric-snapshots"
import { getPostFastPostRecord } from "@/lib/postfast-posts"
import { getPublicationRecordForRead } from "@/lib/post-repository"
import { snapshotlessPublication } from "@/components/realfarm/analytics/analytics-selectors"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Post analytics",
  robots: { index: false, follow: false },
}

export default async function PostAnalyticsRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    companion?: string | string[]
    platformPostId?: string | string[]
  }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/?auth=sign-in&next=/app/analytics")
  const [{ id }, query] = await Promise.all([params, searchParams])
  const postId = id.trim()
  const [allSnapshots, publication, integrations] = await Promise.all([
    listMetricSnapshots().catch(() => []),
    getPublicationRecordForRead({
      surface: "analytics_post_detail",
      id: postId,
      legacy: () => getPostFastPostRecord(postId),
    }).catch(() => null),
    listAnalyticsIntegrations().catch(() => []),
  ])
  const snapshots = allSnapshots
    .filter((snapshot) => snapshot.postId === postId)
    .sort(
      (left, right) =>
        Date.parse(left.capturedAt) - Date.parse(right.capturedAt)
    )
  const latest =
    snapshots.at(-1) ??
    (publication ? snapshotlessPublication(publication) : undefined)
  if (!latest) notFound()

  const run =
    publication &&
    (publication.sourceType === "slideshow" ||
      publication.sourceType === "automation")
      ? await getAutomationRunForSlideshow({
          slideshowId: publication.sourceId,
          runId:
            publication.sourceType === "automation"
              ? publication.sourceId
              : undefined,
        }).catch(() => null)
      : null
  const slides = (run?.outputImages ?? []).flatMap((path, index) => {
    const imageUrl = absoluteAssetUrl(path)
    return imageUrl ? [{ index: index + 1, imageUrl }] : []
  })
  const integration =
    integrations.find((item) => item.integration_id === latest.integrationId) ??
    fallbackIntegration(latest)
  const contentType = inferPostContentType({
    sourceType: publication?.sourceType || latest.sourceType,
    media: publication?.media,
  })

  return (
    <>
      <div className="pt-14 md:pt-0">
        <PostAnalyticsPage
          snapshots={snapshots.length ? snapshots : [latest]}
          integration={integration}
          contentType={latest.contentType || contentType}
          publicationPlatformPostId={
            publication?.externalPostId ||
            first(query.platformPostId)?.trim() ||
            undefined
          }
          slides={slides}
          autoCollectComments={first(query.companion) === "tiktok-comments"}
        />
      </div>
      <StandaloneMobileNav />
    </>
  )
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
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

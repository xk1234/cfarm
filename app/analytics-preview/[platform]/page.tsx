import { notFound } from "next/navigation"

import { AnalyticsView } from "@/components/realfarm/analytics/analytics-view"
import {
  analyticsPreviewPlatforms,
  buildAnalyticsPreviewData,
  type AnalyticsPreviewPlatform,
} from "@/lib/analytics-preview-data"
import { internalToolsEnabled } from "@/lib/internal-tools"

export const metadata = {
  title: "Analytics preview",
  robots: { index: false, follow: false },
}

export function generateStaticParams() {
  return analyticsPreviewPlatforms.map((platform) => ({ platform }))
}

export default async function AnalyticsPreviewPage({
  params,
}: {
  params: Promise<{ platform: string }>
}) {
  if (!internalToolsEnabled()) notFound()
  const { platform } = await params
  if (
    !analyticsPreviewPlatforms.includes(platform as AnalyticsPreviewPlatform)
  ) {
    notFound()
  }
  const initialPlatform = platform === "overall" ? undefined : platform
  const previewData = buildAnalyticsPreviewData()
  const renderedData =
    platform === "overall" ? oneAccountPerProvider(previewData) : previewData
  return (
    <main className="min-h-screen bg-[#f8f7fb] px-7 py-9 lg:px-12">
      <AnalyticsView
        previewData={renderedData}
        initialPlatform={initialPlatform}
      />
    </main>
  )
}

function oneAccountPerProvider(
  data: ReturnType<typeof buildAnalyticsPreviewData>
) {
  const seen = new Set<string>()
  const integrations = data.integrations.filter((integration) => {
    if (seen.has(integration.provider)) return false
    seen.add(integration.provider)
    return true
  })
  const ids = new Set(
    integrations.map((integration) => integration.integration_id)
  )
  return {
    ...data,
    integrations,
    snapshots: data.snapshots.filter((snapshot) =>
      ids.has(snapshot.integrationId)
    ),
    followerSnapshots: data.followerSnapshots.filter((snapshot) =>
      ids.has(snapshot.integrationId)
    ),
    capabilities: Object.fromEntries(
      Object.entries(data.capabilities).filter(([id]) => ids.has(id))
    ),
  }
}

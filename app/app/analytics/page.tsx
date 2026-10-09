import { WorkspaceRoute } from "@/components/realfarm/routes/workspace-route"

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    companion?: string | string[]
    platformPostId?: string | string[]
  }>
}) {
  const query = await searchParams
  const companion = first(query.companion)
  const companionIntent =
    companion === "tiktok-studio" || companion === "tiktok-comments"
      ? companion
      : undefined

  return (
    <WorkspaceRoute
      navigation={{
        view: "analytics",
        companionIntent,
        platformPostId: first(query.platformPostId)?.trim() || undefined,
      }}
    />
  )
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

import { WorkspaceRoute } from "@/components/realfarm/routes/workspace-route"

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    companion?: string | string[]
  }>
}) {
  const query = await searchParams
  const companion = first(query.companion)
  const companionIntent = companion === "tiktok-studio" ? companion : undefined

  return (
    <WorkspaceRoute
      navigation={{
        view: "analytics",
        companionIntent,
      }}
    />
  )
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

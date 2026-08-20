import { redirect } from "next/navigation"

import { AnalyticsView } from "@/features/analytics/ui/analytics-view"
import { WorkspaceShell } from "@/features/workspace/ui/workspace-shell"
import { getCurrentUser } from "@/lib/auth"

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    companion?: string | string[]
  }>
}) {
  const [query, user] = await Promise.all([searchParams, getCurrentUser()])
  const companion = first(query.companion)
  const companionIntent = companion === "tiktok-studio" ? companion : undefined
  if (!user) redirect("/?auth=sign-in&next=/app/analytics")

  return (
    <WorkspaceShell view="analytics" ownerName={user.name}>
      <AnalyticsView companionIntent={companionIntent} />
    </WorkspaceShell>
  )
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

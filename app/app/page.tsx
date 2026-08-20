import { redirect } from "next/navigation"

import { legacyWorkspaceViewHref } from "@/components/realfarm/workspace-navigation"
import { loadHomeRouteData } from "@/features/home/server/load-home-route"
import { HomeScreen } from "@/features/home/ui/home-screen"
import { WorkspaceShell } from "@/features/workspace/ui/workspace-shell"
import { getCurrentUser } from "@/lib/auth"

export default async function WorkspaceHomePage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string | string[]
    template?: string | string[]
    run?: string | string[]
  }>
}) {
  const query = await searchParams
  const legacyHref = legacyWorkspaceViewHref({
    view: first(query.view),
    templateId: first(query.template),
    runId: first(query.run),
  })
  if (legacyHref) redirect(legacyHref)
  const [user, data] = await Promise.all([
    getCurrentUser(),
    loadHomeRouteData(),
  ])
  if (!user) redirect("/?auth=sign-in&next=/app")

  return (
    <WorkspaceShell view="home" ownerName={user.name}>
      <HomeScreen currentUserId={user.$id} initialData={data} />
    </WorkspaceShell>
  )
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "")
}

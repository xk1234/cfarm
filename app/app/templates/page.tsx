import { redirect } from "next/navigation"

import { loadTemplatesRouteData } from "@/features/templates/server/load-templates-route"
import { TemplatesScreen } from "@/features/templates/ui/templates-screen"
import { getCurrentUser } from "@/lib/auth"

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{
    template?: string | string[]
    run?: string | string[]
  }>
}) {
  const query = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect("/?auth=sign-in&next=/app/templates")
  const routeData = await loadTemplatesRouteData(user.name || user.email)

  return (
    <TemplatesScreen
      {...routeData}
      initialNavigation={{
        automationId: first(query.template),
        runId: first(query.run),
      }}
    />
  )
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "")
}

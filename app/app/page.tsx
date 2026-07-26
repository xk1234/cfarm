import { WorkspaceRoute } from "@/components/realfarm/routes/workspace-route"
import type { ViewKey } from "@/components/realfarm/navigation"

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string | string[]
    automation?: string | string[]
    run?: string | string[]
  }>
}) {
  const query = await searchParams

  return (
    <WorkspaceRoute
      navigation={{
        view: initialView(firstQueryValue(query.view)),
        automationId: firstQueryValue(query.automation),
        runId: firstQueryValue(query.run),
      }}
    />
  )
}

function initialView(value: string): ViewKey {
  return [
    "home",
    "compose",
    "schedule",
    "analytics",
    "collections",
    "automations",
  ].includes(value)
    ? (value as ViewKey)
    : "home"
}

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "")
}

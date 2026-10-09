import { WorkspaceRoute } from "@/components/realfarm/routes/workspace-route"
import { isWorkspaceViewKey } from "@/components/realfarm/workspace-navigation"

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string | string[]
  }>
}) {
  const query = await searchParams
  const view = firstQueryValue(query.view)

  return (
    <WorkspaceRoute
      navigation={{ view: isWorkspaceViewKey(view) ? view : "home" }}
    />
  )
}

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "")
}

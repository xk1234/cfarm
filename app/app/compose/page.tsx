import { redirect } from "next/navigation"

import { loadComposeRouteData } from "@/features/composer/server/load-compose-route"
import { ComposerScreen } from "@/features/composer/ui/composer-screen"
import { WorkspaceShell } from "@/features/workspace/ui/workspace-shell"
import { getCurrentUser } from "@/lib/auth"

export default async function ComposePage() {
  const user = await getCurrentUser()
  if (!user) redirect("/?auth=sign-in&next=/app/compose")
  const data = await loadComposeRouteData(user.$id)

  return (
    <WorkspaceShell view="compose" ownerName={user.name}>
      <ComposerScreen {...data} />
    </WorkspaceShell>
  )
}

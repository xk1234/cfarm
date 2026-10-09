import { redirect } from "next/navigation"

import { RealFarmWorkspace } from "@/components/realfarm-workspace"
import type { ViewKey } from "@/components/realfarm/navigation"
import { getCurrentUser } from "@/lib/auth"
import { loadRealFarmData } from "@/lib/realfarm-data"

export type WorkspaceNavigation = {
  view: ViewKey
  collectionId?: string
  renderId?: string
}

export async function WorkspaceRoute({
  navigation,
}: {
  navigation: WorkspaceNavigation
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const data = await loadRealFarmData({ mediaAssets: [] })

  return (
    <RealFarmWorkspace
      data={{
        ...data,
        brand: { ...data.brand, owner: user.name || user.email },
      }}
      initialNavigation={navigation}
    />
  )
}

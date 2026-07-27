"use client"

import { usePathname } from "next/navigation"

import { MobileNavigation } from "@/components/realfarm/navigation"
import { workspaceLocationFromUrl } from "@/components/realfarm/workspace-navigation"

/**
 * The bottom navigation for pages that render outside the workspace shell.
 *
 * `/app/analytics/posts/[id]`, `/app/ugc/[id]` and `/app/x-automations` are
 * real app pages but do not go through RealFarmWorkspace, so they had no
 * navigation at all on mobile -- reaching them left you stranded.
 */
export function StandaloneMobileNav() {
  const pathname = usePathname() ?? ""
  const { view } = workspaceLocationFromUrl(pathname)
  return <MobileNavigation view={view} />
}

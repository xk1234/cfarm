import type { ComponentProps } from "react"

import { Show } from "@clerk/nextjs"

import { e2eUser } from "@/lib/e2e-auth"

/**
 * Server-component `Show`: Clerk's server variant, or the local e2e seam's
 * fixed signed-in state (lib/e2e-auth.ts) when that seam is active.
 */
export function ServerShow(props: ComponentProps<typeof Show>) {
  if (!e2eUser()) return <Show {...props} />
  return props.when === "signed-in" ? <>{props.children}</> : null
}

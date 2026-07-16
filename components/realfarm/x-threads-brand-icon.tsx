import { IconBrandThreads, IconBrandX } from "@tabler/icons-react"

import type { XAutomationPlatform } from "@/lib/x-automation"

export function XThreadsBrandIcon({
  platform,
  className,
}: {
  platform: XAutomationPlatform
  className?: string
}) {
  const Icon = platform === "threads" ? IconBrandThreads : IconBrandX
  return <Icon className={className} aria-hidden="true" />
}

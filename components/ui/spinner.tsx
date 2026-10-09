import { Loader } from "@mantine/core"

import { cn } from "@/lib/utils"

export function Spinner({
  size = 20,
  color = "var(--app-action)",
  className,
  "aria-label": ariaLabel = "Loading",
}: {
  size?: number
  color?: string
  className?: string
  "aria-label"?: string
}) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={ariaLabel}
      className={cn("inline-flex", className)}
    >
      <Loader size={size} color={color} type="oval" />
    </span>
  )
}

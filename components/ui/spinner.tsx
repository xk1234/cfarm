import { ClipLoader } from "react-spinners"

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
      <ClipLoader size={size} color={color} speedMultiplier={0.9} />
    </span>
  )
}

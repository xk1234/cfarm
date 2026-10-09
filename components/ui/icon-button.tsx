import * as React from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Square 36px icon-only control. `label` is both the accessible name and the
 * tooltip, so icon-only actions are never unlabeled.
 */
export function IconButton({
  label,
  className,
  variant = "iconControl",
  children,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "size" | "aria-label" | "title"> & {
  label: string
}) {
  return (
    <Button
      type="button"
      variant={variant}
      size="icon"
      aria-label={label}
      title={label}
      className={cn("rounded-[10px] [&_svg:not([class*='size-'])]:size-4", className)}
      {...props}
    >
      {children}
    </Button>
  )
}

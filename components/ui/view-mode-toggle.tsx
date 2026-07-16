"use client"

import { IconLayoutGrid, IconTable } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type ViewMode = "grid" | "table"

export function ViewModeToggle({
  value,
  onChange,
  className,
}: {
  value: ViewMode
  onChange: (value: ViewMode) => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "app-segmented-control shrink-0",
        className
      )}
      role="group"
      aria-label="View mode"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={cn(value === "grid" && "bg-app-surface shadow-app-control")}
        onClick={() => onChange("grid")}
        aria-label="Grid view"
        aria-pressed={value === "grid"}
      >
        <IconLayoutGrid className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={cn(value === "table" && "bg-app-surface shadow-app-control")}
        onClick={() => onChange("table")}
        aria-label="Table view"
        aria-pressed={value === "table"}
      >
        <IconTable className="size-4" />
      </Button>
    </div>
  )
}

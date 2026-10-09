"use client"

import { IconLayoutGrid, IconTable } from "@tabler/icons-react"
import { ToggleGroup } from "radix-ui"

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
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue === "grid" || nextValue === "table") {
          onChange(nextValue)
        }
      }}
      className={cn("app-segmented-control shrink-0", className)}
      aria-label="View mode"
    >
      <ToggleGroup.Item value="grid" asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="data-[state=on]:bg-app-surface data-[state=on]:shadow-app-control"
          aria-label="Grid view"
        >
          <IconLayoutGrid className="size-4" />
        </Button>
      </ToggleGroup.Item>
      <ToggleGroup.Item value="table" asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="data-[state=on]:bg-app-surface data-[state=on]:shadow-app-control"
          aria-label="Table view"
        >
          <IconTable className="size-4" />
        </Button>
      </ToggleGroup.Item>
    </ToggleGroup.Root>
  )
}

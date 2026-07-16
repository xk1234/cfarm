import type { HTMLAttributes, ReactNode } from "react"

import { cn } from "@/lib/utils"

export function AutomationGenerationGrid({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={cn("grid grid-cols-3 gap-3", className)} {...props}>
      {children}
    </div>
  )
}

export function AutomationGenerationEmptyState({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className="rounded-[8px] border border-dashed border-app-panel-border bg-app-surface-subtle px-4 py-6 text-center text-[13px] font-semibold text-app-muted-text">
      {children}
    </div>
  )
}

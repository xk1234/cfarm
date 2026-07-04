"use client"

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function EditorPopupMenu({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("absolute z-30 rounded-[7px] border border-app-panel-border bg-app-control-bg p-1 text-left text-[14px] font-medium shadow-lg", className)}>
      {children}
    </div>
  )
}

export function EditorPopupOption({
  children,
  active,
  onClick,
}: {
  children: ReactNode
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      className={cn("block w-full rounded-[5px] px-3 py-2 text-left hover:bg-app-control-hover", active && "bg-app-action/10 text-app-action")}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

"use client"

import type { ReactNode } from "react"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function AppModal({
  children,
  className,
  layer = "fixed",
  onClose,
}: {
  children: ReactNode
  className?: string
  layer?: "fixed" | "absolute"
  onClose?: () => void
}) {
  return (
    <div
      className={cn(
        "inset-0 z-50 grid place-items-center bg-[#24251f]/45 p-4",
        layer,
        className,
      )}
      role="dialog"
      aria-modal="true"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.()
        }
      }}
    >
      {children}
    </div>
  )
}

export function AppModalPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("w-full overflow-hidden rounded-lg bg-white shadow-2xl", className)}>
      {children}
    </section>
  )
}

export function AppModalHeader({
  title,
  description,
  onClose,
  closeLabel = "Close modal",
}: {
  title: string
  description?: string
  onClose: () => void
  closeLabel?: string
}) {
  return (
    <div className="flex items-center justify-between border-b border-app-panel-border px-5 py-4">
      <div>
        <h2 className="text-[22px] font-bold text-[#333]">{title}</h2>
        {description && <p className="mt-1 text-[13px] font-semibold text-app-muted-text">{description}</p>}
      </div>
      <AppModalCloseButton onClick={onClose} ariaLabel={closeLabel} />
    </div>
  )
}

export function AppModalCloseButton({ onClick, ariaLabel = "Close modal" }: { onClick: () => void; ariaLabel?: string }) {
  return (
    <Button type="button" variant="iconControl" size="icon-sm" onClick={onClick} aria-label={ariaLabel}>
      <X className="size-5" />
    </Button>
  )
}

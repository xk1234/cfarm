"use client"

import type { ReactNode } from "react"
import { X } from "lucide-react"
import { Dialog } from "radix-ui"

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
  const content = (
    <>
      <Dialog.Overlay className={cn("inset-0 z-50", layer)} />
      <div
        className={cn(
          "inset-0 z-50 grid place-items-center bg-app-overlay p-4",
          layer,
          className
        )}
      >
        {children}
      </div>
    </>
  )

  return (
    <Dialog.Root
      open
      modal
      onOpenChange={(open) => {
        if (!open) onClose?.()
      }}
    >
      {layer === "fixed" ? <Dialog.Portal>{content}</Dialog.Portal> : content}
    </Dialog.Root>
  )
}

export function AppModalPanel({
  children,
  className,
  accessibleTitle,
}: {
  children: ReactNode
  className?: string
  accessibleTitle?: string
}) {
  return (
    <Dialog.Content
      aria-describedby={undefined}
      className={cn(
        "app-dialog-surface w-full",
        className
      )}
    >
      {accessibleTitle ? (
        <Dialog.Title className="sr-only">{accessibleTitle}</Dialog.Title>
      ) : null}
      {children}
    </Dialog.Content>
  )
}

export function AppModalHeader({
  title,
  description,
  actions,
  onClose,
  closeLabel = "Close modal",
}: {
  title: string
  description?: string
  actions?: ReactNode
  onClose: () => void
  closeLabel?: string
}) {
  return (
    <div className="flex items-center justify-between border-b border-app-panel-border px-5 py-4">
      <div>
        <Dialog.Title className="text-[22px] font-bold text-app-text">
          {title}
        </Dialog.Title>
        {description && (
          <Dialog.Description className="mt-1 text-[13px] font-semibold text-app-muted-text">
            {description}
          </Dialog.Description>
        )}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        <AppModalCloseButton onClick={onClose} ariaLabel={closeLabel} />
      </div>
    </div>
  )
}

export function AppModalCloseButton({
  onClick,
  ariaLabel = "Close modal",
  className,
}: {
  onClick: () => void
  ariaLabel?: string
  className?: string
}) {
  return (
    <Button
      type="button"
      variant="iconControl"
      size="icon-sm"
      className={className}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      <X className="size-5" />
    </Button>
  )
}

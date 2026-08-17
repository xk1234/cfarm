"use client"

import type { ReactNode } from "react"
import { LuX } from "react-icons/lu"
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
          "inset-0 z-50 grid place-items-center bg-app-overlay p-2 sm:p-4",
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
        "app-dialog-surface max-h-[calc(100dvh-1rem)] w-full max-w-[calc(100vw-1rem)] min-w-0 sm:max-h-[calc(100dvh-2rem)] sm:max-w-[calc(100vw-2rem)]",
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
  actions,
  onClose,
  closeLabel = "Close modal",
}: {
  title: string
  actions?: ReactNode
  onClose: () => void
  closeLabel?: string
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-app-panel-border px-4 py-3 sm:px-5 sm:py-4">
      <Dialog.Title className="min-w-0 text-[20px] leading-tight font-bold break-words text-app-text sm:text-[22px]">
        {title}
      </Dialog.Title>
      <div className="flex min-w-0 items-center gap-2">
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
      <LuX className="size-5" />
    </Button>
  )
}

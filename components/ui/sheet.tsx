"use client"

import type { ComponentProps } from "react"
import { Dialog } from "radix-ui"

import { cn } from "@/lib/utils"

const Sheet = Dialog.Root
const SheetTrigger = Dialog.Trigger
const SheetClose = Dialog.Close
const SheetTitle = Dialog.Title
const SheetDescription = Dialog.Description

type SheetSide = "top" | "right" | "bottom" | "left" | "full"

const sheetSideClasses: Record<SheetSide, string> = {
  top: "inset-x-0 top-0 max-h-[90dvh] data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
  right:
    "inset-y-0 right-0 h-full max-w-[min(28rem,calc(100vw-2rem))] data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
  bottom:
    "inset-x-0 bottom-0 max-h-[90dvh] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
  left: "inset-y-0 left-0 h-full max-w-[min(28rem,calc(100vw-2rem))] data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
  full: "inset-0 data-[state=closed]:fade-out data-[state=open]:fade-in",
}

function SheetOverlay({
  className,
  ...props
}: ComponentProps<typeof Dialog.Overlay>) {
  return (
    <Dialog.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/35 backdrop-blur-[1px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  children,
  className,
  overlayClassName,
  side = "right",
  ...props
}: ComponentProps<typeof Dialog.Content> & {
  overlayClassName?: string
  side?: SheetSide
}) {
  return (
    <Dialog.Portal>
      <SheetOverlay className={overlayClassName} />
      <Dialog.Content
        aria-describedby={undefined}
        data-slot="sheet-content"
        className={cn(
          "fixed z-50 bg-app-surface outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
          sheetSideClasses[side],
          className
        )}
        {...props}
      >
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  )
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetOverlay,
  SheetTitle,
  SheetTrigger,
}

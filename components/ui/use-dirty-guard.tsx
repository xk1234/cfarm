"use client"

import { useRef, useState } from "react"

import { ConfirmDialog } from "@/components/ui/confirm-dialog"

type DirtyGuardOptions = {
  title?: string
  description?: string
  confirmLabel?: string
}

export function useDirtyGuard(
  isDirty: boolean,
  {
    title = "Discard unsaved changes?",
    description = "Your changes have not been saved. If you leave now, they will be lost.",
    confirmLabel = "Discard changes",
  }: DirtyGuardOptions = {}
) {
  const pendingAction = useRef<(() => void) | null>(null)
  const [confirmationOpen, setConfirmationOpen] = useState(false)

  function run(action: () => void) {
    if (!isDirty) {
      action()
      return
    }
    pendingAction.current = action
    setConfirmationOpen(true)
  }

  const confirmation = confirmationOpen ? (
    <ConfirmDialog
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      onCancel={() => {
        pendingAction.current = null
        setConfirmationOpen(false)
      }}
      onConfirm={() => {
        const action = pendingAction.current
        pendingAction.current = null
        setConfirmationOpen(false)
        action?.()
      }}
    />
  ) : null

  return { run, confirmation }
}

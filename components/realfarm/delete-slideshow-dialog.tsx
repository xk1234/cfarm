"use client"

import { ConfirmDialog } from "@/components/ui/confirm-dialog"

export function DeleteSlideshowDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void
  onConfirm: () => Promise<void>
}) {
  return (
    <ConfirmDialog
      title="Delete this slideshow?"
      description="This removes the completed slideshow and its generated files. This action cannot be undone."
      confirmLabel="Delete slideshow"
      pendingLabel="Deleting…"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}

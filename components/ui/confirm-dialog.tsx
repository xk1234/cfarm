"use client"

import { useState } from "react"
import { AlertDialog } from "radix-ui"

import { Button } from "@/components/ui/button"

export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirm",
  pendingLabel = "Working…",
  onCancel,
  onConfirm,
}: {
  title: string
  description: string
  confirmLabel?: string
  pendingLabel?: string
  onCancel: () => void
  onConfirm: () => Promise<void> | void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  async function confirm() {
    if (pending) return
    setPending(true)
    setError("")
    try {
      await onConfirm()
      onCancel()
    } catch (confirmError) {
      setError(
        confirmError instanceof Error
          ? confirmError.message
          : "The action could not be completed."
      )
      setPending(false)
    }
  }

  return (
    <AlertDialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !pending) onCancel()
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[110] bg-black/45" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-[110] w-[calc(100%-2rem)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[10px] bg-white p-5 shadow-2xl outline-none">
          <AlertDialog.Title className="text-[17px] font-bold text-[#242421]">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-[13px] leading-5 font-medium text-[#77766f]">
            {description}
          </AlertDialog.Description>
          {error ? (
            <p className="mt-3 rounded-[7px] bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">
              {error}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="softControl" disabled={pending}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => void confirm()}
            >
              {pending ? pendingLabel : confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

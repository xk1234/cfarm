"use client"

import { IconCopy } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

export function VideoCopyFields({
  title,
  description,
  hashtags,
}: {
  title: string
  description: string
  hashtags: string
}) {
  return (
    <>
      <CopyableVideoField label="Title" value={title} />
      <CopyableVideoField label="Description" value={description} />
      <CopyableVideoField
        label="Hashtags"
        value={hashtags || "No hashtags generated"}
        copyValue={hashtags}
      />
    </>
  )
}

function CopyableVideoField({
  label,
  value,
  copyValue = value,
}: {
  label: string
  value: string
  copyValue?: string
}) {
  async function copy() {
    if (!copyValue) return
    await navigator.clipboard.writeText(copyValue)
    toast.success(`${label} copied`)
  }

  return (
    <div className="rounded-[10px] border border-app-panel-border bg-app-surface p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-[12px] font-bold tracking-[0.08em] text-app-muted-text uppercase">
          {label}
        </div>
        <Button
          type="button"
          variant="iconControl"
          size="icon-control-sm"
          onClick={() => void copy()}
          disabled={!copyValue}
          aria-label={`Copy ${label.toLowerCase()}`}
          title={`Copy ${label.toLowerCase()}`}
        >
          <IconCopy className="size-4" />
        </Button>
      </div>
      <p className="text-[14px] leading-6 font-medium whitespace-pre-wrap text-app-text">
        {value}
      </p>
    </div>
  )
}

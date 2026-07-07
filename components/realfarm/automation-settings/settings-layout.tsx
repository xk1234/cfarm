import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function SettingsPage({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="min-h-full px-9 py-8 pr-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[28px] leading-tight font-bold text-[#111]">
            {title}
          </h2>
          {description && (
            <p className="mt-2 text-[15px] leading-6 font-medium text-[#77766f]">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      <div className="mt-8 border-t border-[#ecebe4]">{children}</div>
    </div>
  )
}

export function SettingsFooter({
  saveLabel = "Save Changes",
  onCancel,
  onSave,
}: {
  saveLabel?: string
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <div className="mt-8 flex justify-end gap-3 border-t border-[#ecebe4] pt-5">
      <Button type="button" variant="softControl" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="button" variant="action" onClick={onSave}>
        {saveLabel}
      </Button>
    </div>
  )
}

export function SettingsRow({
  title,
  description,
  control,
  muted,
}: {
  title: string
  description?: string
  control: ReactNode
  muted?: boolean
}) {
  return (
    <div
      className={cn(
        "flex min-h-[88px] items-center justify-between gap-5 border-b border-[#ecebe4] py-5",
        muted && "opacity-45"
      )}
    >
      <div className="min-w-0">
        <div className="text-[18px] leading-6 font-semibold text-[#111]">
          {title}
        </div>
        {description && (
          <div className="mt-1 text-[15px] leading-5 font-medium text-[#77766f]">
            {description}
          </div>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}


import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function SettingsPage({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="min-h-full px-4 py-6 sm:px-6 md:px-9 md:py-8 md:pr-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-[22px] leading-tight font-bold text-app-text md:text-[28px]">
          {title}
        </h2>
        {action}
      </div>
      <div className="mt-6 border-t border-app-panel-border md:mt-8">
        {children}
      </div>
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
    <div className="mt-8 flex gap-3 border-t border-app-panel-border pt-5 sm:justify-end">
      <Button
        type="button"
        variant="softControl"
        className="flex-1 sm:flex-none"
        onClick={onCancel}
      >
        Cancel
      </Button>
      <Button
        type="button"
        variant="action"
        className="flex-1 sm:flex-none"
        onClick={onSave}
      >
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
        "flex flex-col gap-3 border-b border-app-panel-border py-4 sm:min-h-[88px] sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:py-5",
        muted && "opacity-45"
      )}
    >
      <div className="min-w-0">
        <div className="text-[16px] leading-6 font-semibold text-app-text sm:text-[18px]">
          {title}
        </div>
        {description && (
          <div className="mt-1 text-[14px] leading-5 font-medium text-app-muted-text sm:text-[15px]">
            {description}
          </div>
        )}
      </div>
      <div className="sm:shrink-0">{control}</div>
    </div>
  )
}

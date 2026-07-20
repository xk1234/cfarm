import type { PostFastSocialProvider } from "@/lib/postfast-client"
import { cn } from "@/lib/utils"

import { SocialPlatformIcon, socialProviderLabel } from "./social-platform"

export type SocialAccountPublishStatus =
  | "connected"
  | "awaiting_manual_post"
  | "queued"
  | "draft"
  | "scheduled"
  | "published"
  | "failed"
  | "disabled"

export type SocialAccountStatusItem = {
  provider: PostFastSocialProvider
  integrationId: string
  name: string
  profile?: string
  status: SocialAccountPublishStatus
  scheduledAt?: string
  publishedAt?: string
  releaseUrl?: string
  externalPostId?: string
  error?: string
}

export function SocialAccountIconList({
  items,
  className,
  onClick,
}: {
  items: SocialAccountStatusItem[]
  className?: string
  onClick?: () => void
}) {
  if (items.length === 0) return null

  return (
    <div className={cn("flex items-center -space-x-1.5", className)}>
      {items.map((item) => {
        const label = accountLabel(item)
        const statusLabel = publishStatusLabel(item.status)
        return (
          <button
            key={`${item.provider}:${item.integrationId}`}
            type="button"
            onClick={onClick}
            className={cn(
              "relative grid size-7 place-items-center rounded-full border-2 border-white bg-app-strong text-white shadow-sm transition hover:z-10 hover:scale-110 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
              item.status === "disabled" && "opacity-55"
            )}
            title={`${label} · ${statusLabel}`}
            aria-label={`${label}: ${statusLabel}`}
          >
            <SocialPlatformIcon provider={item.provider} className="size-3.5" />
            <span
              className={cn(
                "absolute right-0 bottom-0 size-2 rounded-full border border-white",
                publishStatusDotClass(item.status)
              )}
              aria-hidden="true"
            />
          </button>
        )
      })}
    </div>
  )
}

export function SocialAccountStatusRow({
  items,
  size = "default",
  showLabels = false,
  emptyLabel = "No accounts",
  className,
}: {
  items: SocialAccountStatusItem[]
  size?: "compact" | "default"
  showLabels?: boolean
  emptyLabel?: string
  className?: string
}) {
  if (items.length === 0) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full border border-dashed border-app-panel-border px-2 py-1 text-[11px] font-semibold text-app-muted-text",
          className
        )}
      >
        {emptyLabel}
      </span>
    )
  }

  return (
    <div className={cn("flex min-w-0 flex-wrap gap-2", className)}>
      {items.map((item) => (
        <SocialAccountStatusBadge
          key={`${item.provider}:${item.integrationId}`}
          item={item}
          size={size}
          showLabel={showLabels}
        />
      ))}
    </div>
  )
}

function SocialAccountStatusBadge({
  item,
  size,
  showLabel,
}: {
  item: SocialAccountStatusItem
  size: "compact" | "default"
  showLabel: boolean
}) {
  const label = accountLabel(item)
  const statusLabel = publishStatusLabel(item.status)

  return (
    <span
      className={cn(
        "group inline-flex min-w-0 items-center gap-1.5 rounded-full border bg-app-surface shadow-sm",
        size === "compact" ? "px-1.5 py-1" : "px-2 py-1.5",
        publishStatusBorderClass(item.status)
      )}
      title={`${label} · ${statusLabel}${item.error ? ` · ${item.error}` : ""}`}
      aria-label={`${label}: ${statusLabel}`}
    >
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-full bg-app-strong text-white",
          size === "compact" ? "size-6" : "size-8"
        )}
      >
        <SocialPlatformIcon
          provider={item.provider}
          className={cn(size === "compact" ? "size-3.5" : "size-4.5")}
        />
      </span>
      {showLabel ? (
        <span className="min-w-0">
          <span className="block max-w-[88px] truncate text-[11px] leading-3.5 font-semibold text-app-text">
            {label}
          </span>
          <span
            className={cn(
              "block text-[10px] leading-3 font-bold",
              publishStatusTextClass(item.status)
            )}
          >
            {statusLabel}
          </span>
        </span>
      ) : (
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            publishStatusDotClass(item.status)
          )}
          aria-hidden="true"
        />
      )}
    </span>
  )
}

function accountLabel(item: SocialAccountStatusItem) {
  return (
    item.profile?.replace(/^@/, "") ||
    item.name ||
    socialProviderLabel(item.provider)
  )
}

export function publishStatusLabel(status: SocialAccountPublishStatus) {
  switch (status) {
    case "awaiting_manual_post":
      return "Post manually"
    case "published":
      return "Published"
    case "scheduled":
      return "Scheduled"
    case "draft":
      return "Draft"
    case "failed":
      return "Failed"
    case "disabled":
      return "Disabled"
    case "queued":
      return "Queued"
    case "connected":
    default:
      return "Connected"
  }
}

function publishStatusBorderClass(status: SocialAccountPublishStatus) {
  switch (status) {
    case "awaiting_manual_post":
      return "border-violet-500"
    case "published":
      return "border-[#3b82f6]"
    case "scheduled":
      return "border-[#22c55e]"
    case "draft":
      return "border-[#a8a7a0]"
    case "queued":
      return "border-[#f59e0b]"
    case "failed":
      return "border-[#ef4444]"
    case "disabled":
      return "border-app-panel-border opacity-60"
    case "connected":
    default:
      return "border-app-strong"
  }
}

function publishStatusTextClass(status: SocialAccountPublishStatus) {
  switch (status) {
    case "awaiting_manual_post":
      return "text-violet-600"
    case "published":
      return "text-[#2563eb]"
    case "scheduled":
      return "text-[#16a34a]"
    case "queued":
      return "text-[#d97706]"
    case "failed":
      return "text-[#dc2626]"
    case "disabled":
      return "text-app-text-faint"
    case "draft":
    case "connected":
    default:
      return "text-app-text-soft"
  }
}

function publishStatusDotClass(status: SocialAccountPublishStatus) {
  switch (status) {
    case "awaiting_manual_post":
      return "bg-violet-500"
    case "published":
      return "bg-[#3b82f6]"
    case "scheduled":
      return "bg-[#22c55e]"
    case "queued":
      return "bg-[#f59e0b]"
    case "failed":
      return "bg-[#ef4444]"
    case "disabled":
      return "bg-[#aaa9a2]"
    case "draft":
      return "bg-[#8a8982]"
    case "connected":
    default:
      return "bg-app-strong"
  }
}

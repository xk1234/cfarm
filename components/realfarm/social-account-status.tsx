import {
  IconBrandBluesky,
  IconBrandFacebookFilled,
  IconBrandGoogleFilled,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandPinterest,
  IconBrandTelegram,
  IconBrandThreads,
  IconBrandTiktok,
  IconBrandX,
  IconBrandYoutubeFilled,
  type Icon,
} from "@tabler/icons-react"

import type { PostFastSocialProvider } from "@/lib/postfast-client"
import { cn } from "@/lib/utils"

export type SocialAccountPublishStatus =
  | "connected"
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
  error?: string
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
          "inline-flex items-center rounded-full border border-dashed border-[#d8d7cf] px-2 py-1 text-[11px] font-semibold text-[#77766f]",
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
  const Icon = platformIcon(item.provider)
  const label = accountLabel(item)
  const statusLabel = publishStatusLabel(item.status)

  return (
    <span
      className={cn(
        "group inline-flex min-w-0 items-center gap-1.5 rounded-full border bg-white shadow-sm",
        size === "compact" ? "px-1.5 py-1" : "px-2 py-1.5",
        publishStatusBorderClass(item.status)
      )}
      title={`${label} · ${statusLabel}${item.error ? ` · ${item.error}` : ""}`}
      aria-label={`${label}: ${statusLabel}`}
    >
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-full bg-[#111] text-white",
          size === "compact" ? "size-6" : "size-8"
        )}
      >
        <Icon
          className={cn(size === "compact" ? "size-3.5" : "size-4.5")}
          stroke={2.4}
        />
      </span>
      {showLabel ? (
        <span className="min-w-0">
          <span className="block max-w-[88px] truncate text-[11px] leading-3.5 font-semibold text-[#242421]">
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
    providerLabel(item.provider)
  )
}

export function publishStatusLabel(status: SocialAccountPublishStatus) {
  switch (status) {
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
      return "border-[#d8d7cf] opacity-60"
    case "connected":
    default:
      return "border-[#242421]"
  }
}

function publishStatusTextClass(status: SocialAccountPublishStatus) {
  switch (status) {
    case "published":
      return "text-[#2563eb]"
    case "scheduled":
      return "text-[#16a34a]"
    case "queued":
      return "text-[#d97706]"
    case "failed":
      return "text-[#dc2626]"
    case "disabled":
      return "text-[#8a8982]"
    case "draft":
    case "connected":
    default:
      return "text-[#55544f]"
  }
}

function publishStatusDotClass(status: SocialAccountPublishStatus) {
  switch (status) {
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
      return "bg-[#242421]"
  }
}

function platformIcon(provider: PostFastSocialProvider): Icon {
  switch (provider) {
    case "instagram":
      return IconBrandInstagram
    case "youtube":
      return IconBrandYoutubeFilled
    case "facebook":
      return IconBrandFacebookFilled
    case "x":
    case "twitter":
      return IconBrandX
    case "linkedin":
      return IconBrandLinkedin
    case "threads":
      return IconBrandThreads
    case "pinterest":
      return IconBrandPinterest
    case "bluesky":
      return IconBrandBluesky
    case "telegram":
      return IconBrandTelegram
    case "google":
    case "google-business-profile":
      return IconBrandGoogleFilled
    case "tiktok":
    case "tiktok-creative":
    case "tiktok-seller":
    default:
      return IconBrandTiktok
  }
}

function providerLabel(provider: PostFastSocialProvider) {
  switch (provider) {
    case "google-business-profile":
      return "Google Business"
    case "google":
      return "Google"
    case "youtube":
      return "YouTube"
    case "instagram":
      return "Instagram"
    case "facebook":
      return "Facebook"
    case "x":
      return "X"
    case "twitter":
      return "Twitter"
    case "linkedin":
      return "LinkedIn"
    case "threads":
      return "Threads"
    case "pinterest":
      return "Pinterest"
    case "bluesky":
      return "Bluesky"
    case "telegram":
      return "Telegram"
    case "tiktok-creative":
      return "TikTok Creative"
    case "tiktok-seller":
      return "TikTok Seller"
    case "tiktok":
    default:
      return "TikTok"
  }
}

import {
  IconBrandBluesky,
  IconBrandFacebook,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandPinterest,
  IconBrandTelegram,
  IconBrandThreads,
  IconBrandTiktok,
  IconBrandX,
  IconBrandYoutube,
  IconCheck,
  IconWorld,
} from "@tabler/icons-react"
import { Tooltip } from "radix-ui"

import type { PostFastSocialIntegration } from "@/lib/postfast-client"
import { cn } from "@/lib/utils"

export function AccountProfileIcon({
  integration,
  size = "md",
  selected,
  tooltip = false,
}: {
  integration: PostFastSocialIntegration
  size?: "sm" | "md"
  selected?: boolean
  tooltip?: boolean
}) {
  const pixels = size === "md" ? 42 : 30
  const profile = (
    <span
      className="relative block shrink-0"
      style={{ width: pixels, height: pixels }}
    >
      <span
        role="img"
        aria-label={`${integration.name} profile picture`}
        className={cn(
          "grid size-full place-items-center overflow-hidden rounded-full bg-[#dfd9ec] bg-cover bg-center text-[11px] font-bold text-[#4d3b69] ring-1 ring-black/5",
          selected && "ring-2 ring-[#6d28d9] ring-offset-2"
        )}
        style={
          integration.picture
            ? {
                backgroundImage: `url("${integration.picture.replace(/"/g, "%22")}")`,
              }
            : undefined
        }
      >
        {integration.picture ? null : initials(integration.name)}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "absolute -bottom-0.5 -left-0.5 grid place-items-center rounded-full border-2 border-white bg-app-strong text-white shadow-sm",
          size === "md" ? "size-[18px]" : "size-[15px]"
        )}
      >
        <PlatformIcon
          provider={integration.provider}
          className={size === "md" ? "size-[10px]" : "size-[8px]"}
        />
      </span>
      {selected ? (
        <span className="absolute -top-1 -right-1 grid size-[15px] place-items-center rounded-full bg-[#6d28d9] text-white ring-2 ring-white">
          <IconCheck className="size-[9px]" strokeWidth={3} />
        </span>
      ) : null}
    </span>
  )

  if (!tooltip) return profile

  return (
    <Tooltip.Provider delayDuration={180}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span className="inline-flex">{profile}</span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            sideOffset={8}
            className="z-50 max-w-48 rounded-[7px] bg-app-strong px-2.5 py-1.5 text-center text-[10px] leading-4 font-semibold text-white shadow-[0_8px_24px_rgba(23,18,35,0.22)] data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0"
          >
            <span className="block truncate">{integration.name}</span>
            <span className="block font-medium text-white/65">
              {providerName(integration.provider)}
            </span>
            <Tooltip.Arrow className="fill-app-strong" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}

export function PlatformIcon({
  provider,
  className,
}: {
  provider: string
  className?: string
}) {
  const props = { className, strokeWidth: 2.2 }
  switch (normalizeProvider(provider)) {
    case "instagram":
      return <IconBrandInstagram {...props} />
    case "tiktok":
      return <IconBrandTiktok {...props} />
    case "facebook":
      return <IconBrandFacebook {...props} />
    case "youtube":
      return <IconBrandYoutube {...props} />
    case "linkedin":
      return <IconBrandLinkedin {...props} />
    case "pinterest":
      return <IconBrandPinterest {...props} />
    case "x":
      return <IconBrandX {...props} />
    case "threads":
      return <IconBrandThreads {...props} />
    case "bluesky":
      return <IconBrandBluesky {...props} />
    case "telegram":
      return <IconBrandTelegram {...props} />
    default:
      return <IconWorld {...props} />
  }
}

export function providerName(provider: string) {
  const names: Record<string, string> = {
    instagram: "Instagram",
    tiktok: "TikTok",
    facebook: "Facebook",
    youtube: "YouTube",
    linkedin: "LinkedIn",
    pinterest: "Pinterest",
    x: "X",
    threads: "Threads",
    bluesky: "Bluesky",
    telegram: "Telegram",
    "tiktok-creative": "TikTok Creative",
    "tiktok-seller": "TikTok Seller",
    google: "Google Business Profile",
    "google-business-profile": "Google Business Profile",
  }
  return names[normalizeProvider(provider)] || provider
}

export function normalizeProvider(provider: string) {
  return provider === "twitter" ? "x" : provider
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
}

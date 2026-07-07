"use client"

import { useEffect, useMemo, useState } from "react"
import {
  IconBrandBluesky,
  IconBrandFacebookFilled,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandPinterest,
  IconBrandTelegram,
  IconBrandThreads,
  IconBrandTiktok,
  IconBrandX,
  IconBrandYoutubeFilled,
  IconCheck,
  IconPlus,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import {
  normalizePostFastIntegration,
  type PostFastSocialIntegration,
  type PostFastSocialProvider,
} from "@/lib/postfast-client"
import { isSlideshowSocialProvider } from "@/lib/slideshow-social-platforms"
import { cn } from "@/lib/utils"

export function SocialAccountPickerModal({
  selectedIntegrations,
  onSelect,
  onClose,
}: {
  selectedIntegrations: PostFastSocialIntegration[]
  onSelect: (integrations: PostFastSocialIntegration[]) => void
  onClose: () => void
}) {
  const [integrations, setIntegrations] = useState<PostFastSocialIntegration[]>(
    []
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const selectedSlideshowIntegrations = useMemo(
    () =>
      selectedIntegrations.filter((integration) =>
        isSlideshowSocialProvider(integration.provider)
      ),
    [selectedIntegrations]
  )
  const selectedKeys = useMemo(
    () =>
      new Set(
        selectedSlideshowIntegrations.map(
          (integration) =>
            `${integration.provider}:${integration.integration_id}`
        )
      ),
    [selectedSlideshowIntegrations]
  )
  const selectedIntegrationGrid = useMemo(
    () =>
      selectedSlideshowIntegrations.filter((integration) =>
        integrations.some(
          (available) =>
            integrationKey(available) === integrationKey(integration)
        )
      ),
    [integrations, selectedSlideshowIntegrations]
  )

  useEffect(() => {
    void loadIntegrations()
  }, [])

  useEffect(() => {
    if (selectedSlideshowIntegrations.length !== selectedIntegrations.length) {
      onSelect(selectedSlideshowIntegrations)
    }
  }, [onSelect, selectedIntegrations, selectedSlideshowIntegrations])

  async function loadIntegrations() {
    setLoading(true)
    setError("")
    try {
      const payload = await fetchJsonWithTimeout<{ integrations?: unknown[] }>(
        "/api/postfast/integrations",
        { toastOnError: false }
      )
      setIntegrations(
        (payload.integrations ?? []).flatMap((integration) => {
          const normalized = normalizePostFastIntegration(integration)
          return normalized && isSlideshowSocialProvider(normalized.provider)
            ? [normalized]
            : []
        })
      )
    } catch (loadError) {
      const message = getApiErrorMessage(
        loadError,
        "Failed to load social accounts"
      )
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  function toggleIntegration(integration: PostFastSocialIntegration) {
    if (!isSlideshowSocialProvider(integration.provider)) {
      return
    }
    const key = `${integration.provider}:${integration.integration_id}`
    const nextIntegrations = selectedKeys.has(key)
      ? selectedSlideshowIntegrations.filter(
          (item) => `${item.provider}:${item.integration_id}` !== key
        )
      : [...selectedSlideshowIntegrations, integration]
    onSelect(nextIntegrations)
  }

  return (
    <AppModal className="z-[90] bg-[#24251f]/35" onClose={onClose}>
      <AppModalPanel className="max-w-[760px] p-0">
        <AppModalHeader
          title="Social accounts"
          description="Choose which connected accounts this automation will publish to."
          closeLabel="Close social account picker"
          onClose={onClose}
        />
        <div className="space-y-5 p-5">
          {error && (
            <div className="mb-4 rounded-lg border border-[#f0d8d8] bg-[#fff8f8] px-3 py-2 text-sm font-semibold text-[#a8464f]">
              {error}
            </div>
          )}
          <section>
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <h3 className="text-[14px] font-semibold text-[#242421]">
                  Available accounts
                </h3>
                <p className="text-[12px] font-medium text-app-muted-text">
                  Click an account to add or remove it.
                </p>
              </div>
              <span className="text-[12px] font-semibold text-app-muted-text">
                {integrations.length} compatible connected
              </span>
            </div>
            {loading ? (
              <div className="grid min-h-[172px] place-items-center rounded-[8px] border border-app-panel-border bg-white text-sm font-semibold text-app-muted-text">
                Loading accounts...
              </div>
            ) : integrations.length > 0 ? (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                {integrations.map((integration) => (
                  <AccountTile
                    key={integrationKey(integration)}
                    integration={integration}
                    selected={selectedKeys.has(integrationKey(integration))}
                    onClick={() => toggleIntegration(integration)}
                  />
                ))}
              </div>
            ) : (
              <div className="grid min-h-[172px] place-items-center rounded-[8px] border border-dashed border-app-panel-border bg-white px-6 text-center text-sm font-semibold text-app-muted-text">
                No compatible connected accounts found.
              </div>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <h3 className="text-[14px] font-semibold text-[#242421]">
                  Selected to run
                </h3>
                <p className="text-[12px] font-medium text-app-muted-text">
                  These accounts will publish when the automation runs.
                </p>
              </div>
              <span className="text-[12px] font-semibold text-app-muted-text">
                {selectedIntegrationGrid.length} selected
              </span>
            </div>
            {selectedIntegrationGrid.length > 0 ? (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                {selectedIntegrationGrid.map((integration) => (
                  <AccountTile
                    key={integrationKey(integration)}
                    integration={integration}
                    selected
                    compact
                    onClick={() => toggleIntegration(integration)}
                  />
                ))}
              </div>
            ) : (
              <div className="grid min-h-[116px] place-items-center rounded-[8px] border border-dashed border-app-panel-border bg-[#fbfbf7] px-6 text-center text-sm font-semibold text-app-muted-text">
                No accounts selected for this automation.
              </div>
            )}
          </section>
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

function AccountTile({
  integration,
  selected,
  compact = false,
  onClick,
}: {
  integration: PostFastSocialIntegration
  selected: boolean
  compact?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "group relative flex min-w-0 flex-col items-center rounded-[8px] border bg-white px-2 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-[#242421] hover:shadow-md",
        compact ? "min-h-[106px] py-3" : "min-h-[132px] py-4",
        selected
          ? "border-[#242421] ring-2 ring-app-action/25"
          : "border-app-panel-border"
      )}
      onClick={onClick}
      aria-pressed={selected}
    >
      <span className="relative grid size-14 place-items-center rounded-full bg-[#111] text-white shadow-sm">
        <PlatformIcon provider={integration.provider} className="size-8" />
        <span
          className={cn(
            "absolute -top-1 -right-1 grid size-5 place-items-center rounded-full border border-white text-white shadow-sm",
            selected ? "bg-app-action" : "bg-[#8d8c85]"
          )}
        >
          {selected ? (
            <IconCheck className="size-3.5" />
          ) : (
            <IconPlus className="size-3.5" />
          )}
        </span>
      </span>
      <span className="mt-2 w-full truncate text-[12px] leading-4 font-semibold text-[#242421]">
        {accountShortName(integration)}
      </span>
      <span className="mt-0.5 w-full truncate text-[11px] leading-4 font-medium text-app-muted-text">
        {providerLabel(integration.provider)}
      </span>
    </button>
  )
}

function integrationKey(integration: PostFastSocialIntegration) {
  return `${integration.provider}:${integration.integration_id}`
}

function accountShortName(integration: PostFastSocialIntegration) {
  return (
    integration.profile?.replace(/^@/, "") ||
    integration.name ||
    providerLabel(integration.provider)
  )
}

function PlatformIcon({
  provider,
  className,
}: {
  provider: PostFastSocialProvider
  className?: string
}) {
  const Icon = platformIcon(provider)
  return <Icon className={className} stroke={2.4} />
}

function platformIcon(provider: PostFastSocialProvider) {
  switch (provider) {
    case "instagram":
      return IconBrandInstagram
    case "youtube":
      return IconBrandYoutubeFilled
    case "tiktok":
      return IconBrandTiktok
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
    default:
      return IconBrandTiktok
  }
}

function providerLabel(provider: PostFastSocialProvider) {
  switch (provider) {
    case "instagram":
      return "Instagram"
    case "youtube":
      return "YouTube"
    case "tiktok":
      return "TikTok"
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
    default:
      return provider
  }
}

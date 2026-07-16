"use client"

import { useMemo } from "react"
import { IconCheck, IconPlus } from "@tabler/icons-react"
import useSWR from "swr"

import { AccountGridSkeleton } from "@/components/ui/loading-skeleton"
import { getApiErrorMessage } from "@/lib/client-api"
import { clientSWRFetcher } from "@/lib/client-swr"
import {
  normalizePostFastIntegration,
  type PostFastSocialIntegration,
  type PostFastSocialProvider,
} from "@/lib/postfast-client"
import { cn } from "@/lib/utils"

import {
  SocialPlatformIcon,
  socialAccountShortName,
  socialIntegrationKey,
  socialProviderLabel,
} from "./social-platform"

const acceptAllProviders = () => true

export function usePostFastIntegrations({
  includeDisabled = false,
  acceptsProvider = acceptAllProviders,
}: {
  includeDisabled?: boolean
  acceptsProvider?: (provider: PostFastSocialProvider) => boolean
} = {}) {
  const { data, error, isLoading } = useSWR<{ integrations?: unknown[] }>(
    "/api/postfast/integrations",
    clientSWRFetcher
  )
  const integrations = useMemo(
    () =>
      (data?.integrations ?? []).flatMap((value) => {
        const integration = normalizePostFastIntegration(value)
        return integration &&
          (includeDisabled || !integration.disabled) &&
          acceptsProvider(integration.provider)
          ? [integration]
          : []
      }),
    [acceptsProvider, data, includeDisabled]
  )

  return {
    integrations,
    loading: isLoading,
    error: error
      ? getApiErrorMessage(error, "Failed to load social accounts")
      : "",
  }
}

export function SocialAccountSelectionGrid({
  integrations,
  selectedKeys,
  loading = false,
  compact = false,
  emptyLabel = "No connected social accounts found.",
  onToggle,
}: {
  integrations: PostFastSocialIntegration[]
  selectedKeys: ReadonlySet<string>
  loading?: boolean
  compact?: boolean
  emptyLabel?: string
  onToggle: (integration: PostFastSocialIntegration) => void
}) {
  if (loading) return <AccountGridSkeleton />
  if (integrations.length === 0) {
    return (
      <div
        className={cn(
          "grid place-items-center rounded-[8px] border border-dashed border-app-panel-border bg-app-surface px-6 text-center text-sm font-semibold text-app-muted-text",
          compact ? "min-h-[116px]" : "min-h-[172px]"
        )}
      >
        {emptyLabel}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
      {integrations.map((integration) => {
        const key = socialIntegrationKey(integration)
        return (
          <SocialAccountSelectionTile
            key={key}
            integration={integration}
            selected={selectedKeys.has(key)}
            compact={compact}
            onClick={() => onToggle(integration)}
          />
        )
      })}
    </div>
  )
}

function SocialAccountSelectionTile({
  integration,
  selected,
  compact,
  onClick,
}: {
  integration: PostFastSocialIntegration
  selected: boolean
  compact: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "group relative flex min-w-0 flex-col items-center rounded-[8px] border bg-app-surface px-2 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-app-strong hover:shadow-md",
        compact ? "min-h-[106px] py-3" : "min-h-[132px] py-4",
        selected
          ? "border-app-strong ring-2 ring-app-action/25"
          : "border-app-panel-border"
      )}
      onClick={onClick}
      aria-pressed={selected}
    >
      <span className="relative grid size-14 place-items-center rounded-full bg-app-strong text-white shadow-sm">
        <SocialPlatformIcon
          provider={integration.provider}
          className="size-8"
        />
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
      <span className="mt-2 w-full truncate text-[12px] leading-4 font-semibold text-app-text">
        {socialAccountShortName(integration)}
      </span>
      <span className="mt-0.5 w-full truncate text-[11px] leading-4 font-medium text-app-muted-text">
        {socialProviderLabel(integration.provider)}
      </span>
    </button>
  )
}

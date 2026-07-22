"use client"

import { useEffect, useMemo } from "react"
import { toast } from "sonner"

import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import type { SocialIntegration } from "@/lib/social/provider-contract"
import { isSlideshowSocialProvider } from "@/lib/slideshow-social-platforms"

import {
  SocialAccountSelectionGrid,
  usePostFastIntegrations,
} from "./social-account-selection"
import { socialIntegrationKey } from "./social-platform"

export function SocialAccountPickerModal({
  selectedIntegrations,
  onSelect,
  onClose,
}: {
  selectedIntegrations: SocialIntegration[]
  onSelect: (integrations: SocialIntegration[]) => void
  onClose: () => void
}) {
  const { integrations, error, loading } = usePostFastIntegrations({
    acceptsProvider: isSlideshowSocialProvider,
  })
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
        selectedSlideshowIntegrations.map((integration) =>
          socialIntegrationKey(integration)
        )
      ),
    [selectedSlideshowIntegrations]
  )
  const selectedIntegrationGrid = useMemo(
    () =>
      selectedSlideshowIntegrations.filter((integration) =>
        integrations.some(
          (available) =>
            socialIntegrationKey(available) ===
            socialIntegrationKey(integration)
        )
      ),
    [integrations, selectedSlideshowIntegrations]
  )

  useEffect(() => {
    if (error) toast.error(error)
  }, [error])

  useEffect(() => {
    if (selectedSlideshowIntegrations.length !== selectedIntegrations.length) {
      onSelect(selectedSlideshowIntegrations)
    }
  }, [onSelect, selectedIntegrations, selectedSlideshowIntegrations])

  function toggleIntegration(integration: SocialIntegration) {
    if (!isSlideshowSocialProvider(integration.provider)) {
      return
    }
    const key = socialIntegrationKey(integration)
    const nextIntegrations = selectedKeys.has(key)
      ? selectedSlideshowIntegrations.filter(
          (item) => socialIntegrationKey(item) !== key
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
                <h3 className="text-[14px] font-semibold text-app-text">
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
            <SocialAccountSelectionGrid
              integrations={integrations}
              selectedKeys={selectedKeys}
              loading={loading}
              emptyLabel="No compatible connected accounts found."
              onToggle={toggleIntegration}
            />
          </section>

          <section>
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <h3 className="text-[14px] font-semibold text-app-text">
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
            <SocialAccountSelectionGrid
              integrations={selectedIntegrationGrid}
              selectedKeys={selectedKeys}
              compact
              emptyLabel="No accounts selected for this automation."
              onToggle={toggleIntegration}
            />
          </section>
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

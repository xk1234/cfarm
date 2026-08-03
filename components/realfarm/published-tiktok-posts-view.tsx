"use client"

import { useMemo, useState } from "react"

import { SelectControl } from "@/components/ui/form-controls"
import { SettingsPage } from "@/components/realfarm/automation-settings/settings-layout"
import { TikTokPublicationImportPanel } from "@/components/realfarm/automation-settings/tiktok-publication-import-panel"
import type { AutomationRunApiRecord } from "@/components/realfarm/automation-settings/types"
import type { Automation } from "@/lib/realfarm-data"

export function PublishedTikTokPostsView({
  automations,
  onRunsImported,
}: {
  automations: Automation[]
  onRunsImported: (automationId: string, runs: AutomationRunApiRecord[]) => void
}) {
  const slideshowAutomations = useMemo(
    () =>
      automations.filter(
        (automation) => automation.automationKind === "slideshow"
      ),
    [automations]
  )
  const [requestedAutomationId, setRequestedAutomationId] = useState("")
  const selectedAutomationId = slideshowAutomations.some(
    (automation) => automation.id === requestedAutomationId
  )
    ? requestedAutomationId
    : (slideshowAutomations[0]?.id ?? "")

  if (!selectedAutomationId) {
    return (
      <SettingsPage title="Published TikTok posts">
        <div className="py-10 text-sm font-medium text-app-muted-text">
          Create a slideshow automation before linking published TikTok posts.
        </div>
      </SettingsPage>
    )
  }

  return (
    <TikTokPublicationImportPanel
      key={selectedAutomationId}
      automationId={selectedAutomationId}
      action={
        <label className="min-w-52 text-xs font-semibold text-app-muted-text">
          <span className="sr-only">Automation</span>
          <SelectControl
            aria-label="Automation"
            className="w-full bg-app-surface text-app-text"
            value={selectedAutomationId}
            onChange={(event) => setRequestedAutomationId(event.target.value)}
          >
            {slideshowAutomations.map((automation) => (
              <option key={automation.id} value={automation.id}>
                {automation.name}
              </option>
            ))}
          </SelectControl>
        </label>
      }
      onRunsImported={(runs) => onRunsImported(selectedAutomationId, runs)}
    />
  )
}

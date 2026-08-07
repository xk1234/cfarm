"use client"

import { useState } from "react"
import {
  IconAlertTriangle,
  IconPlayerPlay,
  IconPlus,
  IconSlideshow,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-react"
import { LuPencil } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { CardGridSkeleton } from "@/components/ui/loading-skeleton"
import { SlideshowToneAnalyzerDialog } from "@/components/realfarm/slideshow-tone-analyzer-dialog"
import { TemplateDefinitionPreview } from "@/components/realfarm/template-definition-preview"
import type { SocialAccountStatusItem } from "@/components/realfarm/social-account-status"
import type { CreatedImageCollection } from "@/lib/realfarm-collections"
import type { Automation, LocalAsset } from "@/lib/realfarm-data"
import {
  mergeAutomationSchema,
  type AutomationSchema,
} from "@/lib/realfarm-automation"
import type { XAutomationRecord } from "@/lib/x-automation"
import { cn } from "@/lib/utils"

export function TemplatesView({
  automations,
  automationsLoading = false,
  schemasByAutomationId,
  collections,
  demoVideos,
  xTemplatesByAutomationId,
  onCreateNew,
  onCreateFromTone,
  onRename,
  onToggleFavorite,
  onEdit,
}: {
  automations: Automation[]
  automationsLoading?: boolean
  schemasByAutomationId: Record<string, AutomationSchema>
  collections: CreatedImageCollection[]
  demoVideos: LocalAsset[]
  xTemplatesByAutomationId?: Record<string, XAutomationRecord>
  onCreateNew: () => void
  onCreateFromTone: (fields: Partial<AutomationSchema>) => Promise<void>
  onRename: (automation: Automation, name: string) => void
  onToggleFavorite: (automation: Automation) => void
  onEdit: (automation: Automation) => void
}) {
  const [toneAnalyzerOpen, setToneAnalyzerOpen] = useState(false)
  return (
    <div className="mx-auto max-w-[1160px]">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="flex h-10 items-center text-[24px] leading-none font-semibold sm:h-9">
          Templates
        </h1>
        <div className="flex flex-wrap justify-end gap-2 sm:gap-3">
          <Button
            variant="softControl"
            size="appDefault"
            className="h-10 sm:h-9"
            onClick={() => setToneAnalyzerOpen(true)}
          >
            <IconSlideshow className="size-4" />
            Match slideshow
          </Button>
          <Button
            variant="action"
            size="appDefault"
            className="h-10 sm:h-9"
            onClick={onCreateNew}
          >
            <IconPlus className="size-4" />
            New template
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {automationsLoading ? (
          <CardGridSkeleton
            count={6}
            className="col-span-full md:grid-cols-2 lg:grid-cols-3"
          />
        ) : null}
        {!automationsLoading &&
          automations.map((automation) => (
            <TemplateGridCard
              key={automation.id}
              automation={automation}
              config={
                automation.automationKind === "x_threads"
                  ? undefined
                  : mergeAutomationSchema(
                      automation,
                      schemasByAutomationId[automation.id]
                    )
              }
              collections={collections}
              demoVideos={demoVideos}
              xTemplate={xTemplatesByAutomationId?.[automation.id]}
              onRename={onRename}
              onToggleFavorite={onToggleFavorite}
              onEdit={onEdit}
            />
          ))}
        {!automationsLoading && automations.length === 0 && (
          <div className="col-span-full rounded-[8px] border border-dashed border-app-panel-border bg-app-surface px-5 py-10 text-center text-[14px] font-semibold text-app-muted-text">
            No templates yet.
          </div>
        )}
      </div>
      {toneAnalyzerOpen ? (
        <SlideshowToneAnalyzerDialog
          onClose={() => setToneAnalyzerOpen(false)}
          onCreate={onCreateFromTone}
        />
      ) : null}
    </div>
  )
}

function TemplateGridCard({
  automation,
  config,
  collections,
  demoVideos,
  xTemplate,
  onRename,
  onToggleFavorite,
  onEdit,
}: {
  automation: Automation
  config?: AutomationSchema
  collections: CreatedImageCollection[]
  demoVideos: LocalAsset[]
  xTemplate?: XAutomationRecord
  onRename: (automation: Automation, name: string) => void
  onToggleFavorite: (automation: Automation) => void
  onEdit: (automation: Automation) => void
}) {
  const blockers = automation.generationBlockers ?? []
  const blocked = blockers.length > 0

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-[8px] bg-app-surface shadow-sm",
        automationCardBorderClass(blocked)
      )}
    >
      <div className="flex h-11 items-center gap-2 border-b border-[#eeeeee] bg-app-surface px-2.5">
        <span className="shrink-0 rounded-[5px] bg-app-surface-subtle px-2 py-1 text-[11px] font-semibold text-app-text-soft">
          {templateKindLabel(automation)}
        </span>
        <AutomationCardTitle automation={automation} onRename={onRename} />
        <button
          className="ml-auto grid size-8 shrink-0 place-items-center rounded-[6px] text-app-muted-text transition hover:bg-app-surface-subtle"
          onClick={() => onToggleFavorite(automation)}
          aria-label={
            automation.favorite
              ? `Unfavorite ${automation.name}`
              : `Favorite ${automation.name}`
          }
        >
          {automation.favorite ? (
            <IconStarFilled className="size-4 text-[#f7c846]" />
          ) : (
            <IconStar className="size-4" />
          )}
        </button>
      </div>
      <TemplateDefinitionPreview
        automation={automation}
        config={config}
        collections={collections}
        demoVideos={demoVideos}
        xTemplate={xTemplate}
        onOpen={() => onEdit(automation)}
      />
      {blocked ? (
        <div
          role="alert"
          className="flex items-start gap-2 border-t border-destructive/25 bg-destructive/10 px-3 py-2 text-[12px] font-semibold text-destructive"
          title={blockers.join("\n")}
        >
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="line-clamp-2">
            {blockers[0]}
            {blockers.length > 1 ? ` +${blockers.length - 1} more` : ""}
          </span>
        </div>
      ) : null}
    </article>
  )
}

export function automationStatusActionLabel(
  status: Automation["status"]
): "Pause" | "Resume" {
  return status === "paused" ? "Resume" : "Pause"
}

export function automationCardBorderClass(blocked: boolean) {
  return blocked
    ? "border-2 border-destructive ring-1 ring-destructive/20"
    : "border border-app-panel-border"
}

export function automationAccountStatusItems(
  automation: Automation
): SocialAccountStatusItem[] {
  return (automation.socialIntegrations ?? []).map((integration) => ({
    provider: integration.provider,
    integrationId: integration.integration_id,
    name: integration.name,
    profile: integration.profile,
    status: integration.disabled ? "disabled" : "connected",
  }))
}

export function automationAccountSummary(automation: Automation) {
  const account = automation.account?.trim()
  const handle = automation.handle?.trim()
  const hasAccount =
    Boolean(account) && account.toLowerCase() !== "no social account"

  return {
    account: hasAccount ? account : "No social accounts",
    handle: hasAccount ? handle || "Social account" : "Add social account",
    hasAccount,
  }
}

function templateKindLabel(automation: Automation) {
  if (automation.automationKind === "x_threads") return "Post"
  if (
    automation.automationKind === "video" ||
    automation.automationKind === "ugc"
  ) {
    return "Video"
  }
  return "Slideshow"
}

function AutomationCardTitle({
  automation,
  onRename,
}: {
  automation: Automation
  onRename: (automation: Automation, name: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(automation.name)

  function saveName() {
    const nextName = draftName.trim()
    if (nextName && nextName !== automation.name) {
      onRename(automation, nextName)
    } else {
      setDraftName(automation.name)
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        className="h-7 min-w-0 flex-1 rounded-[5px] border border-app-panel-border bg-app-surface px-2 text-[12px] font-semibold ring-2 ring-app-action/20 outline-none"
        value={draftName}
        autoFocus
        onChange={(event) => setDraftName(event.target.value)}
        onBlur={saveName}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            saveName()
          }
          if (event.key === "Escape") {
            setDraftName(automation.name)
            setEditing(false)
          }
        }}
        aria-label="Template name"
      />
    )
  }

  return (
    <div className="flex min-w-0 items-center justify-center gap-1">
      {automation.automationKind === "video" ? (
        <IconPlayerPlay className="size-3.5 shrink-0 text-app-muted-text" />
      ) : (
        <IconSlideshow className="size-3.5 shrink-0 text-app-muted-text" />
      )}
      <span className="truncate text-[12px] font-medium text-app-text">
        {automation.name}
      </span>
      <button
        className="grid size-5 shrink-0 place-items-center rounded-full text-[#b8b8b8] hover:bg-app-surface-subtle hover:text-[#388eff]"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${automation.name} name`}
      >
        <LuPencil className="size-3.5" />
      </button>
    </div>
  )
}

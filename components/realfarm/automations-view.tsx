"use client"

import { useState } from "react"
import {
  IconAlertTriangle,
  IconEye,
  IconEyeOff,
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
  previewImagesByAutomationId,
  collections,
  demoVideos,
  xTemplatesByAutomationId,
  onCreateFromTone,
  onRename,
  onToggleFavorite,
  onToggleHidden,
  onEdit,
}: {
  automations: Automation[]
  automationsLoading?: boolean
  schemasByAutomationId: Record<string, AutomationSchema>
  previewImagesByAutomationId: Record<string, string>
  collections: CreatedImageCollection[]
  demoVideos: LocalAsset[]
  xTemplatesByAutomationId?: Record<string, XAutomationRecord>
  onCreateFromTone: (fields: Partial<AutomationSchema>) => Promise<void>
  onRename: (automation: Automation, name: string) => void
  onToggleFavorite: (automation: Automation) => void
  onToggleHidden: (automation: Automation) => void
  onEdit: (automation: Automation) => void
}) {
  const [toneAnalyzerOpen, setToneAnalyzerOpen] = useState(false)
  const [visibility, setVisibility] = useState<"active" | "hidden">("active")
  const visibleTemplates = templatesForVisibility(automations, visibility)
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
        </div>
      </div>
      <div
        className="mb-4 flex w-fit items-center gap-1 rounded-[8px] bg-app-control-bg p-1"
        role="tablist"
        aria-label="Template visibility"
      >
        {(["active", "hidden"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={visibility === tab}
            className={cn(
              "lc-focus-ring h-8 rounded-[6px] px-3 text-[12px] font-semibold transition active:translate-y-px",
              visibility === tab
                ? "bg-app-surface text-app-text shadow-sm"
                : "text-app-muted-text hover:text-app-text"
            )}
            onClick={() => setVisibility(tab)}
          >
            {tab === "active" ? "Active" : "Hidden"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {automationsLoading ? (
          <CardGridSkeleton
            count={6}
            className="col-span-full md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          />
        ) : null}
        {!automationsLoading &&
          visibleTemplates.map((automation) => (
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
              previewImageUrl={previewImagesByAutomationId[automation.id]}
              onRename={onRename}
              onToggleFavorite={onToggleFavorite}
              onToggleHidden={onToggleHidden}
              onEdit={onEdit}
            />
          ))}
        {!automationsLoading && visibleTemplates.length === 0 && (
          <div className="col-span-full rounded-[8px] border border-dashed border-app-panel-border bg-app-surface px-5 py-10 text-center text-[14px] font-semibold text-app-muted-text">
            {visibility === "hidden"
              ? "No hidden templates."
              : "No active templates."}
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

export function templatesForVisibility(
  automations: Automation[],
  visibility: "active" | "hidden"
) {
  return automations.filter((automation) =>
    visibility === "hidden" ? automation.hidden : !automation.hidden
  )
}

function TemplateGridCard({
  automation,
  config,
  collections,
  demoVideos,
  xTemplate,
  previewImageUrl,
  onRename,
  onToggleFavorite,
  onToggleHidden,
  onEdit,
}: {
  automation: Automation
  config?: AutomationSchema
  collections: CreatedImageCollection[]
  demoVideos: LocalAsset[]
  xTemplate?: XAutomationRecord
  previewImageUrl?: string
  onRename: (automation: Automation, name: string) => void
  onToggleFavorite: (automation: Automation) => void
  onToggleHidden: (automation: Automation) => void
  onEdit: (automation: Automation) => void
}) {
  const blockers = automation.generationBlockers ?? []
  const blocked = blockers.length > 0

  return (
    <article
      className={cn(
        "relative self-start overflow-hidden rounded-[8px] bg-app-surface shadow-sm",
        automationCardBorderClass(blocked)
      )}
    >
      <TemplateDefinitionPreview
        automation={automation}
        config={config}
        collections={collections}
        demoVideos={demoVideos}
        xTemplate={xTemplate}
        previewImageUrl={previewImageUrl}
        showGeneratedPreviewFallback={Boolean(previewImageUrl)}
        onOpen={() => onEdit(automation)}
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/78 via-black/22 to-transparent" />

      <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-1.5">
        <span className="rounded-[5px] bg-black/55 px-2 py-1 text-[10px] font-semibold text-white/90 backdrop-blur-sm">
          {templateKindLabel(automation)}
        </span>
        {blocked ? (
          <span
            className="grid size-7 place-items-center rounded-[5px] bg-[#8a6300] text-white shadow-sm"
            title={blockers.join("\n")}
            aria-label={blockers.join(". ")}
          >
            <IconAlertTriangle className="size-4" />
          </span>
        ) : null}
      </div>

      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        <button
          className="grid size-8 place-items-center rounded-[6px] bg-black/55 text-white/90 backdrop-blur-sm transition hover:bg-black/70 hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none active:scale-95"
          onClick={() => onToggleHidden(automation)}
          aria-label={
            automation.hidden
              ? `Show ${automation.name} in active templates`
              : `Hide ${automation.name}`
          }
        >
          {automation.hidden ? (
            <IconEye className="size-4" />
          ) : (
            <IconEyeOff className="size-4" />
          )}
        </button>
        <button
          className="grid size-8 place-items-center rounded-[6px] bg-black/55 text-white/90 backdrop-blur-sm transition hover:bg-black/70 hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none active:scale-95"
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

      <div className="pointer-events-none absolute inset-x-3 bottom-3">
        <AutomationCardTitle automation={automation} onRename={onRename} />
      </div>
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
    ? "border border-app-panel-border ring-1 ring-[#c7a95a]/35"
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
        className="pointer-events-auto h-9 w-full rounded-[6px] border border-white/45 bg-white px-2.5 text-[13px] font-semibold text-app-text shadow-sm ring-2 ring-app-action/25 outline-none"
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
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="truncate text-[15px] font-semibold text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.5)]">
        {automation.name}
      </span>
      <button
        className="pointer-events-auto grid size-7 shrink-0 place-items-center rounded-[6px] bg-black/40 text-white/80 backdrop-blur-sm transition hover:bg-black/60 hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none active:scale-95"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${automation.name} name`}
      >
        <LuPencil className="size-3.5" />
      </button>
    </div>
  )
}

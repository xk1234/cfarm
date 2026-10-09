"use client"

import { useMemo, useState } from "react"
import Image from "next/image"
import {
  IconAlertTriangle,
  IconPlus,
  IconSlideshow,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { SearchControl, SelectControl } from "@/components/ui/form-controls"
import { CardGridSkeleton } from "@/components/ui/loading-skeleton"
import { SlideshowToneAnalyzerDialog } from "@/components/realfarm/slideshow-tone-analyzer-dialog"
import { XThreadsBrandIcon } from "@/components/realfarm/x-threads-brand-icon"
import type { SocialAccountStatusItem } from "@/components/realfarm/social-account-status"
import type { Automation } from "@/lib/realfarm-data"
import type { AutomationSchema } from "@/lib/realfarm-automation"
import type { CreatedImageCollection } from "@/lib/realfarm-collections"
import type { XAutomationRun } from "@/lib/x-automation"
import { xThreadsPlatformForDisplay } from "@/lib/x-automation-platform"
import { cn } from "@/lib/utils"

type AutomationRunPreview = {
  id: string
  automationId: string
  createdAt: string
  status?: string
  error?: string
  slideshowId?: string
  videoUrl?: string
  thumbnailUrl?: string
  socialStatuses?: SocialAccountStatusItem[]
  manuallyPublishedAt?: string
  renderedSlides?: AutomationRunPreviewSlide[]
  plan?: {
    slides?: AutomationRunPreviewSlide[]
  }
}

type AutomationRunPreviewSlide = {
  imageUrl?: string
  image_url?: string
  sourceImageUrl?: string
  source_image_url?: string
}

export function TemplatesView({
  automations,
  automationsLoading = false,
  recentRunsByAutomationId,
  recentRunsLoading,
  xRunsByAutomationId,
  schemasByAutomationId,
  collections,
  onCreateNew,
  onCreateFromTone,
  onToggleFavorite,
  onEdit,
}: {
  automations: Automation[]
  automationsLoading?: boolean
  recentRunsByAutomationId: Record<string, AutomationRunPreview[]>
  recentRunsLoading?: boolean
  xRunsByAutomationId?: Record<string, XAutomationRun[]>
  schemasByAutomationId: Record<string, AutomationSchema>
  collections: CreatedImageCollection[]
  onCreateNew: () => void
  onCreateFromTone: (fields: Partial<AutomationSchema>) => Promise<void>
  onToggleFavorite: (automation: Automation) => void
  onEdit: (automation: Automation) => void
}) {
  const [toneAnalyzerOpen, setToneAnalyzerOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState("all")
  const [visibleCount, setVisibleCount] = useState(12)
  const filteredAutomations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return automations.filter((automation) => {
      const matchesQuery =
        !normalizedQuery ||
        automation.name.toLowerCase().includes(normalizedQuery)
      const matchesKind =
        kind === "all" || (automation.automationKind ?? "slideshow") === kind
      return matchesQuery && matchesKind
    })
  }, [automations, kind, query])
  const visibleAutomations = filteredAutomations.slice(0, visibleCount)

  return (
    <div className="mx-auto max-w-[1160px]">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="flex h-10 items-center text-[30px] leading-none font-semibold sm:h-9">
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
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchControl
          className="h-10 flex-1 sm:max-w-sm"
          placeholder="Search templates"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setVisibleCount(12)
          }}
          aria-label="Search templates"
        />
        <SelectControl
          className="h-10 sm:w-44"
          value={kind}
          onChange={(event) => {
            setKind(event.target.value)
            setVisibleCount(12)
          }}
          aria-label="Filter templates by type"
        >
          <option value="all">All types</option>
          <option value="slideshow">Slideshows</option>
          <option value="video">Videos</option>
          <option value="ugc">UGC videos</option>
          <option value="x_threads">Text posts</option>
        </SelectControl>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {automationsLoading ? (
          <CardGridSkeleton
            count={6}
            className="col-span-full md:grid-cols-2 lg:grid-cols-3"
          />
        ) : null}
        {!automationsLoading &&
          visibleAutomations.map((automation) =>
            automation.automationKind === "x_threads" ? (
              <XThreadsAutomationCard
                key={automation.id}
                automation={automation}
                recentRuns={xRunsByAutomationId?.[automation.id]}
                onEdit={onEdit}
              />
            ) : (
              <AutomationGridCard
                key={automation.id}
                automation={automation}
                recentRuns={recentRunsByAutomationId[automation.id]}
                schema={schemasByAutomationId[automation.id]}
                collections={collections}
                onToggleFavorite={onToggleFavorite}
                recentRunsLoading={recentRunsLoading}
                onEdit={onEdit}
              />
            )
          )}
        {!automationsLoading && filteredAutomations.length === 0 && (
          <div className="col-span-full rounded-[8px] border border-dashed border-app-panel-border bg-app-surface px-5 py-10 text-center text-[14px] font-semibold text-app-muted-text">
            {automations.length === 0
              ? "No templates yet."
              : "No templates match this search."}
          </div>
        )}
      </div>
      {visibleAutomations.length < filteredAutomations.length ? (
        <div className="mt-5 flex justify-center">
          <Button
            variant="softControl"
            size="appDefault"
            onClick={() => setVisibleCount((count) => count + 12)}
          >
            Show more templates
          </Button>
        </div>
      ) : null}
      {toneAnalyzerOpen ? (
        <SlideshowToneAnalyzerDialog
          onClose={() => setToneAnalyzerOpen(false)}
          onCreate={onCreateFromTone}
        />
      ) : null}
    </div>
  )
}

function XThreadsAutomationCard({
  automation,
  recentRuns,
  onEdit,
}: {
  automation: Automation
  recentRuns?: XAutomationRun[]
  onEdit: (automation: Automation) => void
}) {
  const latestRun = recentRuns?.[0]
  const blocked = Boolean(automation.generationBlockers?.length)

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-[8px] bg-app-surface shadow-sm",
        automationCardBorderClass(blocked)
      )}
    >
      <span className="pointer-events-none absolute top-2 left-2 z-10 rounded-[6px] bg-app-surface px-2 py-1 text-[12px] font-medium text-app-text shadow-sm">
        Post
      </span>
      <button
        type="button"
        className="block w-full text-left outline-none focus-visible:ring-3 focus-visible:ring-app-action/30 focus-visible:ring-inset"
        onClick={() => onEdit(automation)}
      >
        <div className="flex aspect-[16/9] flex-col justify-between bg-app-strong p-5 pt-12 text-white">
          <XThreadsBrandIcon
            platform={xThreadsPlatformForDisplay(
              automation,
              latestRun?.platform
            )}
            className="size-5 opacity-70"
          />
          <p className="line-clamp-3 text-[17px] leading-relaxed font-semibold">
            {automation.name}
          </p>
          <span className="text-[11px] font-semibold text-white/55">
            Text post template · {automation.handle || "Brand voice"}
          </span>
        </div>
      </button>
    </article>
  )
}

function AutomationGridCard({
  automation,
  recentRuns,
  recentRunsLoading,
  schema,
  collections,
  onToggleFavorite,
  onEdit,
}: {
  automation: Automation
  recentRuns?: AutomationRunPreview[]
  recentRunsLoading?: boolean
  schema?: AutomationSchema
  collections: CreatedImageCollection[]
  onToggleFavorite: (automation: Automation) => void
  onEdit: (automation: Automation) => void
}) {
  const generating = recentRuns?.some(
    (run) => run.status === "generating" || run.status === "running"
  )
  const blockers = automation.generationBlockers ?? []
  const blocked = blockers.length > 0

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-[8px] bg-app-surface shadow-sm",
        automationCardBorderClass(blocked)
      )}
    >
      <span className="pointer-events-none absolute top-2 left-2 z-10 rounded-[6px] bg-app-surface px-2 py-1 text-[12px] font-medium text-app-text shadow-sm">
        {automation.automationKind === "ugc"
          ? "UGC video"
          : automation.automationKind === "video"
            ? "Video"
            : "Slideshow"}
      </span>
      <button
        type="button"
        className="absolute top-1.5 right-1.5 z-10 grid size-9 place-items-center rounded-[6px] bg-app-surface text-app-muted-text shadow-sm transition hover:bg-app-surface-subtle"
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
      <button
        type="button"
        className="block w-full text-left outline-none focus-visible:ring-3 focus-visible:ring-app-action/30 focus-visible:ring-inset"
        onClick={() => onEdit(automation)}
      >
        {blocked ? (
          <div
            role="alert"
            className="absolute inset-x-2 top-12 z-20 flex items-start gap-2 rounded-[7px] border border-destructive/25 bg-app-surface/95 px-3 py-2 text-[12px] font-semibold text-destructive shadow-sm"
            title={blockers.join("\n")}
          >
            <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span className="line-clamp-2">
              {blockers[0]}
              {blockers.length > 1 ? ` +${blockers.length - 1} more` : ""}
            </span>
          </div>
        ) : null}
        <TemplateDefinitionPreview
          automation={automation}
          schema={schema}
          collections={collections}
          loading={Boolean(recentRunsLoading && !schema)}
          generating={Boolean(generating)}
        />
      </button>
    </article>
  )
}

function TemplateDefinitionPreview({
  automation,
  schema,
  collections,
  loading,
  generating,
}: {
  automation: Automation
  schema?: AutomationSchema
  collections: CreatedImageCollection[]
  loading: boolean
  generating: boolean
}) {
  const collectionId =
    schema?.image_collection_ids.first_slide.collection ||
    schema?.image_collection_ids.all_slides
  const collection = collections.find(
    (item) => item.id === collectionId || item.title === collectionId
  )
  const previewImage = collection?.images[0]?.imageUrl
  const firstTextItem = schema?.formatting.flatMap(
    (section) => section.textItems
  )[0]
  const sampleText =
    firstTextItem?.staticText?.trim() ||
    firstTextItem?.contentDirection?.trim() ||
    automation.name
  const aspectRatio = schema?.aspect_ratio || "9:16"
  const slideCount = schema?.prompt_formatting.num_of_slides

  return (
    <div className="bg-app-surface-subtle">
      <div
        className={cn(
          "relative w-full overflow-hidden bg-[#d8d5df]",
          "aspect-[9/16]"
        )}
      >
        {previewImage ? (
          <Image
            src={previewImage}
            alt={`${automation.name} template preview`}
            fill
            unoptimized
            sizes="(min-width: 1024px) 360px, (min-width: 768px) 50vw, 100vw"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(124,58,237,0.22),transparent_45%),linear-gradient(145deg,#eeebf4,#d8d5df)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/45" />
        <div className="absolute inset-x-4 top-[38%] rounded-[6px] bg-white px-3 py-2 text-center text-[14px] leading-snug font-semibold text-[#26212f] shadow-sm">
          <span className="line-clamp-3">{sampleText}</span>
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-4 pt-12 pb-4 text-white">
          <span className="block truncate text-[15px] font-semibold">
            {automation.name}
          </span>
          <span className="mt-1 flex items-center justify-between gap-2 text-[10px] font-semibold text-white/75">
            <span className="truncate">
              {collection?.title || "Choose image collection"}
            </span>
            <span className="shrink-0">
              {aspectRatio}
              {slideCount ? ` · ${slideCount} slides` : ""}
            </span>
          </span>
        </div>
        {loading || generating ? (
          <span className="absolute top-3 right-3 rounded bg-black/60 px-2 py-1 text-[10px] font-semibold text-white">
            {generating ? "Generating" : "Loading"}
          </span>
        ) : null}
      </div>
    </div>
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

export function automationRunPreviewImages(
  runs: AutomationRunPreview[] | undefined,
  count: number
) {
  return automationRunPreviewSlots(runs, count).filter(
    (value): value is string => Boolean(value)
  )
}

export function automationRunPreviewSlots(
  runs: AutomationRunPreview[] | undefined,
  count: number
) {
  const images = sortedRunsWithPreviewImage(runs)
    .map((run) => firstRunPreviewImage(run))
    .filter((value): value is string => Boolean(value))
    .slice(0, count)

  return Array.from({ length: count }, (_, index) => images[index] ?? null)
}

export function automationRunPreviewRuns(
  runs: AutomationRunPreview[] | undefined,
  count: number
) {
  const runsWithImages = sortedRunsWithPreviewImage(runs)
    .filter(
      (run) =>
        run.status === "failed" ||
        firstRunPreviewImage(run) !== null ||
        Boolean(run.videoUrl)
    )
    .slice(0, count)

  return Array.from(
    { length: count },
    (_, index) => runsWithImages[index] ?? null
  )
}

function sortedRunsWithPreviewImage(runs: AutomationRunPreview[] | undefined) {
  return (
    runs
      ?.slice()
      .sort((first, second) => runTimestamp(second) - runTimestamp(first)) ?? []
  )
}

function firstRunPreviewImage(run: AutomationRunPreview) {
  return (
    (run.thumbnailUrl?.trim() || firstSlideImage(run.renderedSlides)) ??
    firstSlideImage(run.plan?.slides) ??
    null
  )
}

function firstSlideImage(slides: AutomationRunPreviewSlide[] | undefined) {
  return slideImages(slides)[0] ?? null
}

function slideImages(slides: AutomationRunPreviewSlide[] | undefined) {
  return (
    slides
      ?.map(
        (slide) =>
          slide.imageUrl?.trim() ||
          slide.image_url?.trim() ||
          slide.sourceImageUrl?.trim() ||
          slide.source_image_url?.trim()
      )
      .filter((value): value is string => Boolean(value)) ?? []
  )
}

function runTimestamp(run: AutomationRunPreview) {
  const value = new Date(run.createdAt).getTime()
  return Number.isFinite(value) ? value : 0
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

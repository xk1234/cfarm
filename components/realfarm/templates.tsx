"use client"

import { useMemo, useState } from "react"
import {
  IconPhoto,
  IconPlus,
  IconSearch,
  IconSlideshow,
  IconVideo,
} from "@tabler/icons-react"

import {
  TemplateGeneratedPreview,
  generatedExampleSlides,
  type GeneratedShowcaseRun,
  type TemplateExampleSlide,
} from "@/components/realfarm/template-showcase-preview"
import { ExampleSlideshowModal } from "@/components/realfarm/example-slideshow-modal"
import { VideoAutomationCreateDialog } from "@/components/realfarm/video-automation-create-dialog"
import { XThreadsBrandIcon } from "@/components/realfarm/x-threads-brand-icon"
import { Button } from "@/components/ui/button"
import { CheckedDropdownButton } from "@/components/ui/form-controls"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import {
  automationCreatedAt,
  type AutomationSchema,
  type AutomationVideoTemplateId,
} from "@/lib/realfarm-automation"
import { videoAutomationTemplatePresets } from "@/lib/video-automation-templates"
import type { CreatedImageCollection } from "@/lib/realfarm-collections"
import type { Automation } from "@/lib/realfarm-data"
import { xThreadsPlatformForDisplay } from "@/lib/x-automation-platform"
import { cn } from "@/lib/utils"

type TemplateSortOption = "Newest" | "Oldest" | "A → Z" | "Z → A"
type TemplateKindFilter = "slideshow" | "video" | "x_threads"
const TEMPLATE_BATCH_SIZE = 10
const templateSortOptions: TemplateSortOption[] = [
  "Newest",
  "Oldest",
  "A → Z",
  "Z → A",
]

export function TemplateFolderModal({
  templates: templateAutomations,
  collections,
  recentRunsByAutomationId,
  onClose,
  onCreateBlank,
  onCreateVideoTemplate,
  onCreateCollection,
  onUseTemplate,
}: {
  templates: Automation[]
  collections: CreatedImageCollection[]
  recentRunsByAutomationId: Record<string, GeneratedShowcaseRun[]>
  onClose: () => void
  onCreateBlank: (
    automationKind: Automation["automationKind"],
    platform?: "x" | "threads"
  ) => void
  onCreateVideoTemplate: (input: {
    name: string
    schema: AutomationSchema
  }) => Promise<void>
  onCreateCollection: (collection: CreatedImageCollection) => void
  onUseTemplate: (automation: Automation) => void
}) {
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<TemplateSortOption>("Newest")
  const [selectedKind, setSelectedKind] =
    useState<TemplateKindFilter>("slideshow")
  const [selectedTemplate, setSelectedTemplate] = useState<Automation | null>(
    null
  )
  const [selectedVideoTemplate, setSelectedVideoTemplate] =
    useState<AutomationVideoTemplateId | null>(null)
  const [visibleCount, setVisibleCount] = useState(TEMPLATE_BATCH_SIZE)
  const templates = useMemo(() => {
    const query = search.trim().toLowerCase()
    return templateAutomations
      .map((automation, index) => ({ automation, index }))
      .filter(
        ({ automation }) =>
          templateKind(automation) === selectedKind &&
          automation.name.toLowerCase().includes(query)
      )
      .sort((a, b) => {
        if (sort === "Oldest") {
          return (
            automationCreatedAt(a.automation, a.index) -
            automationCreatedAt(b.automation, b.index)
          )
        }
        if (sort === "A → Z") {
          return a.automation.name.localeCompare(b.automation.name)
        }
        if (sort === "Z → A") {
          return b.automation.name.localeCompare(a.automation.name)
        }
        return (
          automationCreatedAt(b.automation, b.index) -
          automationCreatedAt(a.automation, a.index)
        )
      })
      .map(({ automation }) => automation)
  }, [templateAutomations, search, selectedKind, sort])
  const selectedKindLabel = templateKindLabel(selectedKind)
  const visibleTemplates = templates.slice(0, visibleCount)

  if (selectedTemplate) {
    return (
      <ExampleSlideshowModal
        title={selectedTemplate.name}
        runs={recentRunsByAutomationId[selectedTemplate.id]}
        onClose={() => setSelectedTemplate(null)}
      />
    )
  }

  if (selectedVideoTemplate) {
    return (
      <VideoAutomationCreateDialog
        templateId={selectedVideoTemplate}
        collections={collections}
        onCreateCollection={onCreateCollection}
        onBack={() => setSelectedVideoTemplate(null)}
        onCreate={onCreateVideoTemplate}
      />
    )
  }

  return (
    <AppModal className="p-2 sm:p-4" onClose={onClose}>
      <AppModalPanel className="flex h-[calc(100svh-1rem)] max-h-[calc(100svh-1rem)] max-w-[840px] flex-col overflow-hidden rounded-[10px] sm:h-auto sm:max-h-[86vh]">
        <div className="shrink-0 bg-app-surface">
          <AppModalHeader
            title="Templates"
            closeLabel="Close templates"
            onClose={onClose}
          />
          <div className="border-b border-app-panel-border px-3 pb-3 sm:px-5">
            <label className="relative block min-w-0">
              <IconSearch className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-[#65645f]" />
              <input
                className="h-10 w-full rounded-[10px] border border-[#d5d4ce] bg-app-surface pr-3 pl-10 text-[15px] font-medium outline-none placeholder:text-app-text-faint"
                placeholder="Search templates..."
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setVisibleCount(TEMPLATE_BATCH_SIZE)
                }}
                autoFocus
                aria-label="Search templates"
              />
            </label>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-6 sm:px-5">
          <div className="mb-4 min-w-0 space-y-3">
            <div className="-mx-1 overflow-x-auto px-1 pb-1">
              <div
                className="flex w-max items-center gap-1"
                aria-label="Template type filters"
              >
                {(["slideshow", "video", "x_threads"] as const).map((kind) => {
                  const active = selectedKind === kind
                  return (
                    <button
                      key={kind}
                      type="button"
                      className={cn(
                        "rounded-[7px] px-4 py-2 text-[14px] font-semibold transition",
                        active
                          ? "bg-app-strong text-white"
                          : "text-[#6f7888] hover:bg-app-control-hover"
                      )}
                      onClick={() => {
                        setSelectedKind(kind)
                        setVisibleCount(TEMPLATE_BATCH_SIZE)
                      }}
                    >
                      {templateKindLabel(kind)}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="-mx-1 flex min-w-0 items-center gap-2 overflow-x-auto px-1 pb-1">
              <CheckedDropdownButton
                value={sort}
                options={templateSortOptions}
                onChange={(value) => {
                  setSort(value as TemplateSortOption)
                  setVisibleCount(TEMPLATE_BATCH_SIZE)
                }}
              />
              {selectedKind === "x_threads" ? (
                <>
                  <Button
                    type="button"
                    variant="softControl"
                    size="appDefault"
                    onClick={() => onCreateBlank("x_threads", "x")}
                  >
                    <XThreadsBrandIcon platform="x" className="size-4" />
                    New X template
                  </Button>
                  <Button
                    type="button"
                    variant="softControl"
                    size="appDefault"
                    onClick={() => onCreateBlank("x_threads", "threads")}
                  >
                    <XThreadsBrandIcon platform="threads" className="size-4" />
                    New Threads template
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="softControl"
                  size="appDefault"
                  onClick={() => onCreateBlank(selectedKind)}
                >
                  {selectedKind === "video" ? (
                    <IconVideo className="size-4" />
                  ) : (
                    <IconSlideshow className="size-4" />
                  )}
                  New {selectedKindLabel.toLowerCase()} template
                </Button>
              )}
            </div>
            <p className="text-[12px] font-semibold text-app-muted-text">
              {templates.length}{" "}
              {templates.length === 1 ? "template" : "templates"}
            </p>
          </div>

          {selectedKind === "video" ? (
            <div className="mb-5">
              <div className="mb-2 text-[12px] font-bold tracking-[0.08em] text-app-muted-text uppercase">
                Start from a format
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {videoAutomationTemplatePresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="group rounded-[10px] border border-app-panel-border bg-app-surface p-3 text-left transition hover:border-app-strong"
                    onClick={() => setSelectedVideoTemplate(preset.id)}
                  >
                    <div className="flex items-center gap-2 text-[14px] font-bold text-app-text">
                      <IconVideo className="size-4 shrink-0" />
                      {preset.name}
                    </div>
                    <div className="mt-0.5 text-[12px] font-semibold text-app-muted-text">
                      {preset.tagline}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[12px] leading-4 font-medium text-[#9a9992]">
                      {preset.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {templateAutomations.length === 0 ? (
            <TemplateEmptyState
              title="No templates available"
              description="Create a blank template to start from scratch."
            />
          ) : templates.length === 0 ? (
            <TemplateEmptyState
              title={`No matching ${selectedKindLabel.toLowerCase()} templates`}
              description="Try a different search or clear the search field."
            />
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                {visibleTemplates.map((automation, index) => (
                  <TemplateCard
                    key={automation.id}
                    automation={automation}
                    exampleSlides={generatedExampleSlides(
                      recentRunsByAutomationId[automation.id],
                      1
                    )}
                    index={index}
                    onOpen={() => setSelectedTemplate(automation)}
                    onAdd={() => onUseTemplate(automation)}
                  />
                ))}
              </div>
              {visibleTemplates.length < templates.length ? (
                <div className="mt-5 flex justify-center">
                  <Button
                    type="button"
                    variant="softControl"
                    size="appDefault"
                    onClick={() =>
                      setVisibleCount((count) => count + TEMPLATE_BATCH_SIZE)
                    }
                  >
                    Show{" "}
                    {Math.min(
                      TEMPLATE_BATCH_SIZE,
                      templates.length - visibleTemplates.length
                    )}{" "}
                    more
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

function TemplateEmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="grid min-h-[260px] place-items-center rounded-[8px] border border-dashed border-[#d7d6cf] bg-app-surface-subtle px-6 text-center">
      <div>
        <div className="text-[17px] font-bold text-app-text">{title}</div>
        <div className="mt-2 text-[13px] font-semibold text-app-muted-text">
          {description}
        </div>
      </div>
    </div>
  )
}

function TemplateCard({
  automation,
  exampleSlides,
  index,
  onOpen,
  onAdd,
}: {
  automation: Automation
  exampleSlides: TemplateExampleSlide[]
  index: number
  onOpen: () => void
  onAdd: () => void
}) {
  return (
    <article className="group relative flex h-[116px] min-w-0 overflow-hidden rounded-[10px] border border-app-panel-border bg-app-surface shadow-sm md:block md:h-[160px] md:border-0 md:bg-black">
      <button
        type="button"
        className="block h-full w-[108px] shrink-0 text-left md:w-full"
        onClick={onOpen}
        aria-label={`View ${automation.name} examples`}
      >
        <TemplateGeneratedPreview
          exampleSlides={exampleSlides}
          tileCount={1}
          columns={1}
          className="h-full"
          index={index}
        />
      </button>
      <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-t from-black/65 via-black/10 to-black/5 md:block" />
      <div className="pointer-events-none flex min-w-0 flex-1 flex-col p-3 md:absolute md:inset-0 md:justify-end">
        <div className="flex min-w-0 items-center gap-2 text-[14px] font-bold text-app-text md:text-[16px] md:text-white">
          {automation.automationKind === "x_threads" ? (
            <XThreadsBrandIcon
              platform={xThreadsPlatformForDisplay(automation)}
              className="size-4 shrink-0"
            />
          ) : automation.automationKind === "video" ? (
            <IconVideo className="size-4 shrink-0" />
          ) : (
            <IconSlideshow className="size-4 shrink-0" />
          )}
          <span className="truncate">{automation.name}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-[10px] font-bold tracking-[0.08em] text-app-muted-text uppercase md:text-[11px] md:text-white/80">
          {automation.automationKind === "x_threads" ? (
            <XThreadsBrandIcon
              platform={xThreadsPlatformForDisplay(automation)}
              className="size-3.5"
            />
          ) : automation.automationKind === "video" ? (
            <IconVideo className="size-3.5" />
          ) : (
            <IconPhoto className="size-3.5" />
          )}
          {automationKindLabel(automation)}
        </div>
        <div className="pointer-events-auto mt-auto flex gap-2 pt-2 md:absolute md:inset-0 md:mt-0 md:items-center md:justify-center md:pt-0 md:opacity-0 md:transition md:group-focus-within:opacity-100 md:group-hover:opacity-100">
          <button
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-app-surface-subtle px-3 text-[13px] font-bold text-app-text shadow-sm md:h-10 md:flex-none md:bg-app-surface md:px-4 md:text-[15px]"
            onClick={onOpen}
          >
            <IconSearch className="size-4 md:size-5" />
            Open
          </button>
          <button
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-app-action px-3 text-[13px] font-bold text-white shadow-sm md:h-10 md:flex-none md:px-4 md:text-[15px]"
            onClick={onAdd}
            aria-label={`Create template from ${automation.name}`}
          >
            <IconPlus className="size-4 md:size-5" />
            Create
          </button>
        </div>
      </div>
    </article>
  )
}

function automationKindLabel(automation: Automation) {
  const kind = templateKind(automation)
  if (kind === "x_threads") return "Other social media"
  return kind === "video" ? "Video template" : "Slideshow template"
}

function templateKindLabel(kind: TemplateKindFilter) {
  if (kind === "x_threads") return "Other social media"
  return kind === "video" ? "Video" : "Slideshow"
}

function templateKind(automation: Automation): TemplateKindFilter {
  if (automation.automationKind === "x_threads") return "x_threads"
  return automation.automationKind === "video" ? "video" : "slideshow"
}

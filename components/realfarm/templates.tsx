"use client"

import { useMemo, useState } from "react"
import {
  IconPhoto,
  IconPlus,
  IconSearch,
  IconSlideshow,
  IconVideo,
  IconX,
} from "@tabler/icons-react"

import {
  TemplateGeneratedPreview,
  generatedExampleSlides,
  type GeneratedShowcaseRun,
  type TemplateExampleSlide,
} from "@/components/realfarm/template-showcase-preview"
import { ExampleSlideshowModal } from "@/components/realfarm/example-slideshow-modal"
import { Button } from "@/components/ui/button"
import { CheckedDropdownButton } from "@/components/ui/form-controls"
import { AppModal, AppModalPanel } from "@/components/ui/modal"
import {
  automationCreatedAt,
  type AutomationSchema,
} from "@/lib/realfarm-automation"
import type { CreatedImageCollection } from "@/lib/realfarm-collections"
import type { Automation, RealFarmData } from "@/lib/realfarm-data"

type TemplateSortOption = "Newest" | "Oldest" | "A → Z" | "Z → A"
const templateSortOptions: TemplateSortOption[] = [
  "Newest",
  "Oldest",
  "A → Z",
  "Z → A",
]

export function TemplateFolderModal({
  data,
  templates: templateAutomations,
  automationConfigs,
  collections,
  recentRunsByAutomationId,
  onClose,
  onCreateBlank,
  onUseTemplate,
}: {
  data: RealFarmData
  templates: Automation[]
  automationConfigs: Record<string, AutomationSchema>
  collections: CreatedImageCollection[]
  recentRunsByAutomationId: Record<string, GeneratedShowcaseRun[]>
  onClose: () => void
  onCreateBlank: (automationKind: Automation["automationKind"]) => void
  onUseTemplate: (automation: Automation) => void
}) {
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<TemplateSortOption>("Newest")
  const [selectedTemplate, setSelectedTemplate] = useState<Automation | null>(
    null
  )
  const templates = useMemo(() => {
    const query = search.trim().toLowerCase()
    return templateAutomations
      .map((automation, index) => ({ automation, index }))
      .filter(({ automation }) => automation.name.toLowerCase().includes(query))
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
  }, [templateAutomations, search, sort])

  if (selectedTemplate) {
    return (
      <ExampleSlideshowModal
        title={selectedTemplate.name}
        runs={recentRunsByAutomationId[selectedTemplate.id]}
        onClose={() => setSelectedTemplate(null)}
      />
    )
  }

  return (
    <AppModal onClose={onClose}>
      <AppModalPanel className="max-h-[86vh] max-w-[840px] rounded-[10px]">
        <div className="border-b border-[#deddd7] bg-white">
          <div className="flex h-[58px] items-center gap-3 px-3">
            <button
              className="grid size-8 place-items-center rounded-[6px] text-[#34332f] hover:bg-[#f1f0eb]"
              onClick={onClose}
              aria-label="Close templates"
            >
              <IconX className="size-5" />
            </button>
            <label className="relative min-w-0 flex-1">
              <IconSearch className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-[#65645f]" />
              <input
                className="h-10 w-full rounded-[10px] border border-[#d5d4ce] bg-white pr-3 pl-10 text-[15px] font-medium outline-none placeholder:text-[#aaa9a2]"
                placeholder="Search templates..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                autoFocus
              />
            </label>
          </div>
        </div>

        <div className="max-h-[calc(86vh-58px)] overflow-y-auto px-3 pt-2 pb-6">
          <div className="mb-5 flex items-end justify-between">
            <button className="border-b-2 border-[#242421] pb-2 text-[14px] font-semibold">
              Templates
            </button>
            <div className="flex items-center gap-2">
              <CheckedDropdownButton
                value={sort}
                options={templateSortOptions}
                onChange={(value) => setSort(value as TemplateSortOption)}
              />
              <div className="flex overflow-hidden rounded-[8px] border border-[#d5d4ce] bg-white shadow-sm">
                <button
                  className="inline-flex h-10 items-center gap-2 border-r border-[#e5e4dd] px-3 text-[13px] font-bold text-[#242421] hover:bg-[#f8f8f4]"
                  onClick={() => onCreateBlank("slideshow")}
                >
                  <IconSlideshow className="size-4" />
                  Slideshow
                </button>
                <button
                  className="inline-flex h-10 items-center gap-2 px-3 text-[13px] font-bold text-[#242421] hover:bg-[#f8f8f4]"
                  onClick={() => onCreateBlank("video")}
                >
                  <IconVideo className="size-4" />
                  Video
                </button>
              </div>
            </div>
          </div>

          {templateAutomations.length === 0 ? (
            <TemplateEmptyState
              title="No templates available"
              description="Create a blank automation to start from scratch."
            />
          ) : templates.length === 0 ? (
            <TemplateEmptyState
              title="No matching templates"
              description="Try a different search or clear the search field."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {templates.map((automation, index) => (
                <TemplateCard
                  key={automation.id}
                  automation={automation}
                  exampleSlides={generatedExampleSlides(
                    recentRunsByAutomationId[automation.id],
                    3
                  )}
                  index={index}
                  onOpen={() => setSelectedTemplate(automation)}
                  onAdd={() => onUseTemplate(automation)}
                />
              ))}
            </div>
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
    <div className="grid min-h-[260px] place-items-center rounded-[8px] border border-dashed border-[#d7d6cf] bg-[#f8f8f4] px-6 text-center">
      <div>
        <div className="text-[17px] font-bold text-[#333]">{title}</div>
        <div className="mt-2 text-[13px] font-semibold text-[#77766f]">
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
    <article className="group relative h-[160px] overflow-hidden rounded-[10px] bg-black shadow-sm">
      <button
        type="button"
        className="block h-full w-full text-left"
        onClick={onOpen}
        aria-label={`View ${automation.name} examples`}
      >
        <TemplateGeneratedPreview
          exampleSlides={exampleSlides}
          className="h-full"
          index={index}
        />
      </button>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-black/5" />
      <div className="pointer-events-none absolute right-3 bottom-3 left-3">
        <div className="flex min-w-0 items-center gap-2 text-[16px] font-bold text-white">
          {automation.automationKind === "video" ? (
            <IconVideo className="size-4 shrink-0" />
          ) : (
            <IconSlideshow className="size-4 shrink-0" />
          )}
          <span className="truncate">{automation.name}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-[11px] font-bold tracking-[0.08em] text-white/80 uppercase">
          {automation.automationKind === "video" ? (
            <IconVideo className="size-3.5" />
          ) : (
            <IconPhoto className="size-3.5" />
          )}
          {automationKindLabel(automation)}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 opacity-0 transition group-hover:opacity-100">
        <button
          className="pointer-events-auto inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[15px] font-bold text-[#242421] shadow-sm"
          onClick={onOpen}
        >
          <IconSearch className="size-5" />
          Open
        </button>
        <button
          className="pointer-events-auto inline-flex h-10 items-center gap-2 rounded-full bg-[#ff5626] px-4 text-[15px] font-bold text-white shadow-sm"
          onClick={onAdd}
        >
          <IconPlus className="size-5" />
          Add
        </button>
      </div>
    </article>
  )
}

function automationKindLabel(automation: Automation) {
  return automation.automationKind === "video"
    ? "Video automation"
    : "Slideshow automation"
}

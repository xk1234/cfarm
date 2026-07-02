"use client"

import { useState } from "react"
import {
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconHome,
  IconLayoutDashboard,
  IconList,
  IconMessage,
  IconPlus,
  IconTrash,
  IconWand,
  IconX,
} from "@tabler/icons-react"
import { Copy, Grid2X2, Pencil } from "lucide-react"

import {
  AutomationThumb,
  AvatarDot,
  ControlRow,
  ControlSelect,
  ControlToggle,
} from "@/components/realfarm/shared-media"
import { Button } from "@/components/ui/button"
import {
  LabelledSelect,
  SelectLike,
  SwitchPill,
  SwitchPillButton,
} from "@/components/ui/form-controls"
import {
  alignmentLabel,
  anchorLabel,
  aspectRatioLabel,
  automationAlignments,
  automationAnchors,
  automationAspectRatios,
  automationImageGrids,
  automationWordLengths,
  defaultAutomationTextItem,
  imageGridLabel,
  labelToAlignment,
  labelToAnchor,
  labelToAspectRatio,
  labelToImageGrid,
  labelToWordLength,
  wordLengthLabel,
  type AutomationSchema,
  type AutomationSlideCountMode,
  type AutomationTextItem,
  type ImageCollectionConfig,
} from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"
import { cn } from "@/lib/utils"

type AutomationDrawerTab = "overview" | "format" | "hooks" | "schedule" | "settings"

export function AutomationSettingsDrawer({
  automation,
  config,
  onRename,
  onConfigChange,
  onClose,
}: {
  automation: Automation
  config: AutomationSchema
  onRename: (name: string) => void
  onConfigChange: (config: AutomationSchema) => void
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<AutomationDrawerTab>("overview")
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState(automation.name)

  function saveName() {
    const nextName = draftName.trim()
    if (nextName && nextName !== automation.name) {
      onRename(nextName)
    } else {
      setDraftName(automation.name)
    }
    setEditingName(false)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#24251f]/42 p-5">
      <section
        className={cn(
          "grid overflow-hidden rounded-[5px] bg-white shadow-2xl",
          activeTab === "format"
            ? "h-[min(544px,90vh)] w-[min(792px,calc(100vw-40px))]"
            : "h-[min(630px,90vh)] w-[min(780px,calc(100vw-40px))] md:grid-cols-[246px_1fr]"
        )}
      >
        {activeTab !== "format" && (
          <aside className="flex min-h-0 flex-col border-r border-[#e1e0d8] bg-[#f7f7f3] p-2">
            <button className="mb-2 flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#d8d7cf] bg-white px-3 text-[14px] font-semibold text-[#242421] shadow-sm">
              <IconPlus className="size-4" />
              Generate
            </button>
            <div className="space-y-1">
              <DrawerNavButton label="Overview" icon={IconHome} active={activeTab === "overview"} onClick={() => setActiveTab("overview")} />
              <div className="my-2 h-px bg-[#e1e0d8]" />
              <DrawerNavButton label="Slideshow Format" icon={IconWand} onClick={() => setActiveTab("format")} />
              <DrawerNavButton label="Hooks (2) & Style" icon={IconMessage} active={activeTab === "hooks"} onClick={() => setActiveTab("hooks")} />
              <div className="my-2 h-px bg-[#e1e0d8]" />
              <DrawerNavButton label="Schedule" icon={IconCalendar} active={activeTab === "schedule"} onClick={() => setActiveTab("schedule")} />
              <DrawerNavButton label="TikTok Settings" icon={IconWand} active={activeTab === "settings"} onClick={() => setActiveTab("settings")} />
              <DrawerNavButton label="Settings" icon={IconLayoutDashboard} active={activeTab === "settings"} onClick={() => setActiveTab("settings")} />
            </div>
            <div className="mt-auto space-y-4 pb-4 pl-3 text-[15px] font-semibold">
              <button className="flex items-center gap-2 text-[#85847d]"><Copy className="size-4" />Duplicate</button>
              <button className="flex items-center gap-2 text-[#c7c5bd]"><IconTrash className="size-4" />Delete automation</button>
            </div>
          </aside>
        )}
        <div className="relative min-h-0 overflow-y-auto bg-white">
          {activeTab !== "format" && (
            <button className="absolute right-4 top-4 z-10 text-[#62615b]" onClick={onClose} aria-label="Close automation settings">
              <IconX className="size-5" />
            </button>
          )}
          {activeTab === "overview" && (
            <AutomationOverviewPanel
              automation={automation}
              editingName={editingName}
              draftName={draftName}
              onDraftNameChange={setDraftName}
              onStartNameEdit={() => setEditingName(true)}
              onSaveName={saveName}
              onCancelNameEdit={() => {
                setDraftName(automation.name)
                setEditingName(false)
              }}
            />
          )}
          {activeTab === "format" && (
            <AutomationFormatPanel
              automation={automation}
              config={config}
              onConfigChange={onConfigChange}
              onBack={() => setActiveTab("overview")}
            />
          )}
          {activeTab === "hooks" && (
            <PromptConfigPanel
              automation={automation}
              config={config}
              onConfigChange={onConfigChange}
            />
          )}
          {activeTab === "settings" && (
            <TikTokSettingsPanel
              config={config}
              onConfigChange={onConfigChange}
            />
          )}
          {activeTab === "schedule" && <SchedulePanel automation={automation} config={config} />}
        </div>
      </section>
    </div>
  )
}

function DrawerNavButton({
  label,
  icon: Icon,
  active,
  disabled,
  onClick,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  active?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button
      className={cn(
        "flex h-9 w-full items-center gap-3 rounded-[6px] border border-transparent px-3 text-left text-[14px] font-semibold",
        active ? "border-[#92918a] bg-white text-[#242421]" : "text-[#7b7a73] hover:bg-white/70",
        disabled && "cursor-not-allowed opacity-35 hover:bg-transparent"
      )}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="size-4" />
      {label}
      {active && <IconChevronRight className="ml-auto size-4" />}
    </button>
  )
}

function AutomationOverviewPanel({
  automation,
  editingName,
  draftName,
  onDraftNameChange,
  onStartNameEdit,
  onSaveName,
  onCancelNameEdit,
}: {
  automation: Automation
  editingName: boolean
  draftName: string
  onDraftNameChange: (value: string) => void
  onStartNameEdit: () => void
  onSaveName: () => void
  onCancelNameEdit: () => void
}) {
  return (
    <div className="min-h-full bg-white">
      <div className="h-[106px] bg-gradient-to-r from-[#90464b] via-[#9a707d] to-[#94a1b0]" />
      <div className="px-6 pb-8">
        <div className="-mt-8 flex justify-center">
          <AvatarDot name={automation.name} index={12} className="size-16 border-4 border-white" />
        </div>
        <div className="mt-4 flex justify-center">
          {editingName ? (
            <input
              className="h-9 min-w-[260px] rounded-[7px] border border-[#d8d7cf] bg-white px-3 text-center text-[19px] font-semibold outline-none ring-2 ring-[#3197f4]/20"
              value={draftName}
              autoFocus
              onChange={(event) => onDraftNameChange(event.target.value)}
              onBlur={onSaveName}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onSaveName()
                }
                if (event.key === "Escape") {
                  onCancelNameEdit()
                }
              }}
            />
          ) : (
            <div className="flex max-w-full items-center justify-center gap-2">
              <h2 className="truncate text-center text-[19px] font-bold text-[#20201d]">{automation.name}</h2>
              <button
                className="grid size-6 place-items-center rounded-full text-[#9a9991] hover:bg-[#f1f0eb] hover:text-[#242421]"
                onClick={onStartNameEdit}
                aria-label="Edit automation name"
              >
                <Pencil className="size-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="mx-auto mt-4 grid max-w-[494px] grid-cols-4 overflow-hidden rounded-[10px] border border-[#e2e1da]">
          {[
            ["0", "Views"],
            ["0", "Likes"],
            ["0", "Bookmarks"],
            ["0.0%", "Engagement"],
          ].map(([value, label]) => (
            <div key={label} className="border-r border-[#e2e1da] px-4 py-3 text-center last:border-r-0">
              <div className="text-[18px] font-bold text-[#171714]">{value}</div>
              <div className="mt-1 text-[11px] font-medium text-[#77766f]">{label}</div>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-5 max-w-[494px]">
          <button className="mb-3 flex items-center gap-1 text-[14px] font-bold text-[#242421]">
            Recent
            <IconChevronRight className="size-4 rotate-90" />
          </button>
          <article className="w-[158px] overflow-hidden rounded-[6px] bg-[#111] shadow-sm">
            <div className="relative h-[200px]">
              <AutomationThumb theme={automation.theme} index={1} />
              <div className="absolute inset-0 bg-black/20" />
              <div className="font-tiktok absolute inset-x-4 top-[28%] text-center text-[10px] font-bold leading-tight text-white drop-shadow">
                4 uncomfortable but healthy relationship questions i&apos;ve asked my partner
              </div>
              <div className="absolute inset-x-0 bottom-2 text-center text-[11px] font-medium text-white/90">Not published</div>
            </div>
          </article>
        </div>
      </div>
    </div>
  )
}

function AutomationFormatPanel({
  automation,
  config,
  onConfigChange,
  onBack,
}: {
  automation: Automation
  config: AutomationSchema
  onConfigChange: (config: AutomationSchema) => void
  onBack: () => void
}) {
  const [activeTab, setActiveTab] = useState<"Hook" | "Content" | "CTA">("Hook")
  const [activePreview, setActivePreview] = useState(0)
  const [selectedTextIndex, setSelectedTextIndex] = useState<number | null>(null)
  const activeKey = activeTab.toLowerCase() as "hook" | "content" | "cta"
  const activeSection = config.format[activeKey]
  const activeTextItem = activeSection.text_items[selectedTextIndex ?? 0] ?? defaultAutomationTextItem()
  const previewCardWidth = activeTab === "Hook" ? 200 : 122
  const previewGap = 32
  const previewTrackOffset = activePreview * (previewCardWidth + previewGap) + previewCardWidth / 2

  function selectTab(tab: "Hook" | "Content" | "CTA") {
    setActiveTab(tab)
    setActivePreview(0)
    setSelectedTextIndex(null)
  }

  function updateSchema(updater: (current: AutomationSchema) => AutomationSchema) {
    onConfigChange(updater(config))
  }

  function updateFormatSection<K extends keyof AutomationSchema["format"]>(
    key: K,
    patch: Partial<AutomationSchema["format"][K]>
  ) {
    updateSchema((current) => ({
      ...current,
      format: {
        ...current.format,
        [key]: {
          ...current.format[key],
          ...patch,
        },
      },
    }))
  }

  function updateTextItem(patch: Partial<AutomationTextItem>) {
    updateSchema((current) => {
      const section = current.format[activeKey]
      const textIndex = selectedTextIndex ?? 0
      const textItems = section.text_items.length > 0 ? [...section.text_items] : [defaultAutomationTextItem()]
      textItems[textIndex] = {
        ...defaultAutomationTextItem(),
        ...textItems[textIndex],
        ...patch,
      }

      return {
        ...current,
        format: {
          ...current.format,
          [activeKey]: {
            ...section,
            text_items: textItems,
          },
        },
      }
    })
  }

  function deleteSelectedTextItem() {
    updateSchema((current) => {
      const section = current.format[activeKey]
      const textIndex = selectedTextIndex ?? 0
      const textItems = section.text_items.filter((_, index) => index !== textIndex)
      return {
        ...current,
        format: {
          ...current.format,
          [activeKey]: {
            ...section,
            text_items: textItems.length > 0 ? textItems : [defaultAutomationTextItem()],
          },
        },
      }
    })
    setSelectedTextIndex(null)
  }

  return (
    <div className="grid h-full min-h-0 bg-[#b9b9b6] md:grid-cols-[335px_1fr]">
      <aside className="flex min-h-0 flex-col bg-[#f7f7f4]">
        <div className="flex h-12 items-center justify-between border-b border-[#deddd5] px-3">
          <button className="flex items-center gap-2 text-[13px] font-semibold text-[#5d5c56]" onClick={onBack}>
            <IconChevronLeft className="size-4" />
            Back
          </button>
          <div className="flex gap-2 text-[#8c8b84]">
            <IconList className="size-4" />
            <Grid2X2 className="size-4" />
          </div>
        </div>

        <div className="grid h-11 grid-cols-3 border-b border-[#deddd5] text-center text-[13px] font-semibold">
          {(["Hook", "Content", "CTA"] as const).map((tab) => (
            <button
              key={tab}
              className={cn(activeTab === tab ? "border-b-2 border-[#242421] text-[#242421]" : "text-[#9a9991]")}
              onClick={() => selectTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          {activeTab === "CTA" ? (
            <div>
              <div className="mb-4 flex items-center justify-between text-[14px] font-semibold">
                Enable CTA
                <button
                  className={cn("flex h-7 w-12 items-center rounded-full p-1 transition", config.format.cta.enabled ? "bg-[#3594ff]" : "bg-[#ecece8]")}
                  onClick={() => updateFormatSection("cta", { enabled: !config.format.cta.enabled })}
                  aria-label="Enable CTA"
                >
                  <span className={cn("block size-5 rounded-full bg-white shadow-sm transition", config.format.cta.enabled && "translate-x-5")} />
                </button>
              </div>
              <ControlSelect
                label="Image mode"
                value={config.format.cta.image_mode === "collection" ? "Collection" : "Single image"}
                options={["Collection", "Single image"]}
                onChange={(value) => updateFormatSection("cta", { image_mode: value === "Collection" ? "collection" : "single_image" })}
              />
              <ControlSelect
                label="Aspect Ratio"
                value={aspectRatioLabel(config.format.cta.aspect_ratio)}
                options={automationAspectRatios.map(aspectRatioLabel)}
                onChange={(value) => updateFormatSection("cta", { aspect_ratio: labelToAspectRatio(value) })}
              />
              <ControlSelect
                label="Image Grid"
                value={imageGridLabel(config.format.cta.image_grid)}
                options={automationImageGrids.map(imageGridLabel)}
                onChange={(value) => updateFormatSection("cta", { image_grid: labelToImageGrid(value) })}
              />
              <ControlToggle label="Overlay" enabled={config.format.cta.overlay} onClick={() => updateFormatSection("cta", { overlay: !config.format.cta.overlay })} />
              <ControlToggle label="Display text" enabled={config.format.cta.display_text} onClick={() => updateFormatSection("cta", { display_text: !config.format.cta.display_text })} />
            </div>
          ) : (
            <>
              <button className="mb-4 w-full rounded-[8px] bg-white p-3 text-left shadow-sm">
                <div className="mb-2 flex items-center justify-between text-[13px] font-semibold">
                  <span>{activeTab} <IconChevronRight className="inline size-4" /></span>
                  <span className="max-w-[145px] truncate text-[#77766f]">
                    {activeTab === "Hook" ? "Motivational Screencaps" : "Pinterest - space"}
                  </span>
                </div>
                <div className="grid h-[58px] grid-cols-4 overflow-hidden rounded-[4px] bg-[#e8e7df]">
                  {[0, 1, 2, 3].map((index) => (
                    <AutomationThumb key={index} theme={automation.theme} index={index} />
                  ))}
                </div>
              </button>

              {activeTab === "Content" && (
                <div className="mb-3 grid grid-cols-[1fr_54px_54px] gap-2">
                  <SelectLike
                    value={config.format.content.slide_count_mode === "varying" ? "Varying" : "Static"}
                    options={["Varying", "Static"]}
                    placement="bottom"
                    onChange={(value) => updateFormatSection("content", { slide_count_mode: value.toLowerCase() as AutomationSlideCountMode })}
                  />
                  <input
                    className="h-8 rounded-[7px] border border-[#ebeae3] bg-white px-2 text-center text-[12px] font-semibold outline-none"
                    value={config.format.content.slide_count_mode === "static" ? config.format.content.slide_count ?? 4 : config.format.content.slide_count_min ?? 3}
                    onChange={(event) => {
                      const value = Number(event.target.value) || 1
                      updateFormatSection("content", config.format.content.slide_count_mode === "static" ? { slide_count: value } : { slide_count_min: value })
                    }}
                    aria-label={config.format.content.slide_count_mode === "static" ? "Slide count" : "Minimum slide count"}
                  />
                  <input
                    className="h-8 rounded-[7px] border border-[#ebeae3] bg-white px-2 text-center text-[12px] font-semibold outline-none"
                    value={config.format.content.slide_count_max ?? 4}
                    disabled={config.format.content.slide_count_mode === "static"}
                    onChange={(event) => updateFormatSection("content", { slide_count_max: Number(event.target.value) || 1 })}
                    aria-label="Maximum slide count"
                  />
                </div>
              )}

              <ControlSelect
                label="Aspect Ratio"
                value={aspectRatioLabel(activeSection.aspect_ratio)}
                options={automationAspectRatios.map(aspectRatioLabel)}
                onChange={(value) => updateFormatSection(activeKey, { aspect_ratio: labelToAspectRatio(value) })}
              />
              <ControlSelect
                label="Image Grid"
                value={imageGridLabel(activeSection.image_grid)}
                options={automationImageGrids.map(imageGridLabel)}
                onChange={(value) => updateFormatSection(activeKey, { image_grid: labelToImageGrid(value) })}
              />
              <ControlToggle label="Overlay" enabled={activeSection.overlay} onClick={() => updateFormatSection(activeKey, { overlay: !activeSection.overlay })} />
              {activeTab === "Content" && (
                <ControlToggle
                  label="Overlay Image"
                  enabled={Boolean(config.format.content.overlay_image?.enabled)}
                  onClick={() => updateFormatSection("content", {
                    overlay_image: {
                      enabled: !config.format.content.overlay_image?.enabled,
                      collection_id: config.format.content.overlay_image?.collection_id,
                      height: config.format.content.overlay_image?.height ?? 50,
                    },
                  })}
                />
              )}
              <ControlToggle label="Display text" enabled={activeSection.display_text} onClick={() => updateFormatSection(activeKey, { display_text: !activeSection.display_text })} />

              <button className="mt-4 flex w-full items-center justify-between text-[12px] font-semibold text-[#8b8a83]">
                Advanced
                <IconChevronRight className="size-4 rotate-90" />
              </button>
              <div className="mt-3 space-y-3">
                <ControlRow label="Collection" value={config.image_collection_ids[`${activeKey}_collection_id` as keyof ImageCollectionConfig] ?? "None"} />
              </div>
            </>
          )}
        </div>

        <div className="border-t border-[#deddd5] p-3">
          <Button variant="action" size="appDefault" className="w-full rounded-[8px] text-[13px] font-semibold" onClick={onBack}>
            Save Changes
          </Button>
        </div>
      </aside>

      <main className="relative min-h-0 overflow-hidden bg-[#b9b9b6]">
        <div className={cn("overflow-hidden", selectedTextIndex !== null ? "h-[315px] pt-[92px]" : "h-full pt-[168px]")}>
          <div
            className="flex items-start transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)]"
            style={{
              gap: `${previewGap}px`,
              transform: `translateX(calc(50% - ${previewTrackOffset}px))`,
            }}
          >
            {Array.from({ length: activeTab === "CTA" ? 8 : 6 }).map((_, index) => (
              <AutomationFormatPreviewCard
                key={`${activeTab}-${index}`}
                automation={automation}
                index={index}
                activeTab={activeTab}
                active={activePreview === index}
                width={previewCardWidth}
                displayText={activeSection.display_text}
                selectedText={selectedTextIndex !== null && activePreview === index}
                onSelect={() => {
                  setActivePreview(index)
                  setSelectedTextIndex(null)
                }}
                onSelectText={() => {
                  setActivePreview(index)
                  setSelectedTextIndex(0)
                }}
              />
            ))}
          </div>
          <div className="mt-4 flex justify-center gap-1.5">
            {Array.from({ length: activeTab === "CTA" ? 8 : 6 }).map((_, index) => (
              <button
                key={index}
                className={cn("size-2 rounded-full", index === activePreview ? "bg-white" : "bg-white/55")}
                onClick={() => {
                  setActivePreview(index)
                  setSelectedTextIndex(null)
                }}
                aria-label={`Select preview ${index + 1}`}
              />
            ))}
          </div>
        </div>

        {selectedTextIndex !== null && (
          <AutomationFormatTextToolbar
            mode={activeTab}
            textItem={activeTextItem}
            onTextItemChange={updateTextItem}
            onDelete={deleteSelectedTextItem}
          />
        )}
      </main>
    </div>
  )
}

function AutomationFormatPreviewCard({
  automation,
  index,
  activeTab,
  active,
  width,
  displayText,
  selectedText,
  onSelect,
  onSelectText,
}: {
  automation: Automation
  index: number
  activeTab: "Hook" | "Content" | "CTA"
  active: boolean
  width: number
  displayText: boolean
  selectedText: boolean
  onSelect: () => void
  onSelectText: () => void
}) {
  const label = activeTab === "CTA" ? "CTA" : index === 0 ? activeTab : `Content ${index}`
  const height = activeTab === "Hook" ? 132 : 190
  const text = activeTab === "CTA"
    ? "Nisi ut aliquip ex"
    : index === 0
      ? "Incididunt ut labore et dolore magna aliqua ut enim"
      : "Ut enim ad minim veniam"

  return (
    <div
      className={cn("shrink-0 cursor-pointer transition-opacity duration-300", active ? "opacity-100" : "opacity-65")}
      style={{ width }}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          onSelect()
        }
      }}
    >
      <div className="mb-2 text-left text-[12px] font-bold text-[#77766f]">{label}</div>
      <div className="relative overflow-hidden rounded-[2px] shadow-sm" style={{ height }}>
        <AutomationThumb theme={activeTab === "CTA" ? "nature" : automation.theme} index={index + 4} />
        {displayText && (
          <button
            className={cn(
              "font-tiktok absolute left-1/2 top-[42%] w-[74%] -translate-x-1/2 rounded-[3px] px-2 py-1 text-center text-[11px] font-bold leading-tight text-yellow-100 drop-shadow",
              selectedText && "outline outline-2 outline-[#4f91ff]"
            )}
            onClick={(event) => {
              event.stopPropagation()
              onSelectText()
            }}
            aria-label="Edit text element"
          >
            {text}
          </button>
        )}
        {selectedText && (
          <div className="absolute left-1/2 top-[58%] -translate-x-1/2 rounded-[4px] bg-white px-2 py-1 text-[11px] font-semibold text-[#242421] shadow-sm">
            Editing Text
          </div>
        )}
      </div>
    </div>
  )
}

function AutomationFormatTextToolbar({
  mode,
  textItem,
  onTextItemChange,
  onDelete,
}: {
  mode: "Hook" | "Content" | "CTA"
  textItem: AutomationTextItem
  onTextItemChange: (patch: Partial<AutomationTextItem>) => void
  onDelete: () => void
}) {
  const isContent = mode === "Content"

  return (
    <div className="absolute bottom-4 left-4 right-4 rounded-[9px] bg-white p-4 shadow-lg">
      {isContent ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <LabelledSelect
              label="Word length"
              value={wordLengthLabel(textItem.word_length_min)}
              options={automationWordLengths.map(wordLengthLabel)}
              onChange={(value) => onTextItemChange({ word_length_min: labelToWordLength(value) })}
            />
            <LabelledSelect
              label="Alignment"
              value={alignmentLabel(textItem.align)}
              options={automationAlignments.map(alignmentLabel)}
              onChange={(value) => onTextItemChange({ align: labelToAlignment(value) })}
            />
          </div>
          <div className="mt-3">
            <LabelledSelect
              label="Top/Bottom Padding"
              value={anchorLabel(textItem.anchor ?? "padded")}
              options={automationAnchors.map(anchorLabel)}
              onChange={(value) => {
                const anchor = labelToAnchor(value)
                onTextItemChange({ anchor, vertical_anchor: anchor })
              }}
            />
          </div>
          <label className="mt-3 block text-[12px] font-semibold text-[#4d4c47]">
            Content direction
            <input
              className="mt-1 h-11 w-full rounded-[7px] border border-[#deddd5] px-3 text-[12px] font-medium outline-none placeholder:text-[#c7c6bf]"
              value={textItem.content_direction ?? ""}
              onChange={(event) => onTextItemChange({ content_direction: event.target.value })}
              placeholder="e.g. A bold hook about..."
            />
          </label>
        </>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <LabelledSelect label="Font" value="Default" options={["Default", "Bebas Neue", "Elegance", "Elegance Italic"]} />
          <LabelledSelect label="Style" value={mode === "Hook" ? "Light Black BG" : "White Text"} options={["Outline", "White Text", "Black Text", "Yellow Text", "Light Black BG"]} />
          <LabelledSelect label="Size" value={mode === "Hook" ? "16px" : "12px"} options={["8px", "12px", "14px", "16px", "18px", "20px"]} />
          <LabelledSelect label="Position" value="Center" options={["Top", "Center", "Bottom"]} />
          <LabelledSelect label="Width" value="70%" options={["50%", "70%", "80%", "90%", "100%"]} />
        </div>
      )}
      <div className="mt-4 flex items-center justify-between text-[12px] font-semibold">
        <button className="text-[#8b8a83]">Advanced⌃</button>
        <div className="flex gap-4">
          <button className="text-[#2f7df1]">+ Add text</button>
          <button className="text-[#e65656]" onClick={onDelete}>Delete</button>
        </div>
      </div>
    </div>
  )
}

function TikTokSettingsPanel({
  config,
  onConfigChange,
}: {
  config: AutomationSchema
  onConfigChange: (config: AutomationSchema) => void
}) {
  function updatePostSettings(patch: Partial<AutomationSchema["tiktok_post_settings"]>) {
    onConfigChange({
      ...config,
      tiktok_post_settings: {
        ...config.tiktok_post_settings,
        ...patch,
      },
    })
  }

  return (
    <div className="relative -mx-8 -my-8 flex min-h-full flex-col">
      <div className="flex-1 overflow-y-auto px-8 py-8 pr-12">
        <h2 className="text-[24px] font-semibold">Default TikTok settings</h2>
        <div className="mt-2 flex items-center gap-3 text-[18px] text-[#686761]">
          Auto-post to TikTok
          <SwitchPillButton
            enabled={config.tiktok_post_settings.auto_post}
            onClick={() => updatePostSettings({ auto_post: !config.tiktok_post_settings.auto_post })}
          />
        </div>
        <p className="mt-3 max-w-[600px] text-[14px] font-semibold leading-5 text-[#b84a54]">
          No TikTok page is assigned to this automation. Add a TikTok page in the box on the top left of this dialog box.
        </p>
        <div className="mt-8 space-y-7">
          <PromptTextarea
            title="Title"
            value={config.tiktok_post_settings.description.value}
            onChange={(value) => updatePostSettings({
              description: {
                ...config.tiktok_post_settings.description,
                value,
              },
            })}
          />
          <PromptTextarea
            title="Caption"
            large
            value={config.tiktok_post_settings.caption.value}
            onChange={(value) => updatePostSettings({
              caption: {
                ...config.tiktok_post_settings.caption,
                value,
              },
            })}
          />
        </div>
        <h3 className="mt-10 border-t border-[#ecebe4] pt-7 text-[20px] font-semibold">Settings</h3>
        <SettingsSwitch
          title="Post as draft"
          description="Sending to TikTok as a draft, you must publish from in-app"
          enabled={config.tiktok_post_settings.post_mode === "MEDIA_UPLOAD"}
          onClick={() => updatePostSettings({ post_mode: config.tiktok_post_settings.post_mode === "MEDIA_UPLOAD" ? "DIRECT_POST" : "MEDIA_UPLOAD" })}
        />
        <SettingsSwitch
          title="Auto-music"
          enabled={config.tiktok_post_settings.auto_music}
          onClick={() => updatePostSettings({ auto_music: !config.tiktok_post_settings.auto_music })}
        />
      </div>
      <div className="flex justify-end gap-3 border-t border-[#e8e7df] bg-white p-4">
        <Button variant="softControl" className="h-11 rounded-[8px] px-8 text-[16px] font-semibold">Cancel</Button>
        <Button variant="action" className="h-11 rounded-[8px] px-8 text-[16px] font-semibold">Save Settings</Button>
      </div>
    </div>
  )
}

function PromptTextarea({
  title,
  value,
  large,
  onChange,
}: {
  title: string
  value: string
  large?: boolean
  onChange?: (value: string) => void
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[18px] font-semibold">{title}</span>
        <span className="flex items-center gap-2 text-[14px] font-semibold text-[#62615b]">Use prompt <SwitchPill enabled /></span>
      </div>
      <textarea
        className={cn("w-full resize-none rounded-[8px] border border-[#d8d7cf] p-4 text-[17px] font-medium leading-6 outline-none", large ? "h-32" : "h-20 ring-2 ring-[#242421]")}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
      />
    </label>
  )
}

function PromptConfigPanel({
  automation,
  config,
  onConfigChange,
}: {
  automation: Automation
  config: AutomationSchema
  onConfigChange: (config: AutomationSchema) => void
}) {
  return (
    <div className="pr-8">
      <h2 className="text-[24px] font-semibold">Prompt Configuration</h2>
      <p className="mt-1 text-[18px] text-[#77766f]">Edit the narrative and content prompts for {automation.name}.</p>
      <textarea
        className="mt-8 h-80 w-full resize-none rounded-[8px] border border-[#deddd5] p-5 text-[14px] font-medium leading-6 outline-none"
        value={config.hooks.map((hook, index) => `${index + 1}. ${hook}`).join("\n")}
        onChange={(event) => {
          const hooks = event.target.value
            .split("\n")
            .map((line) => line.replace(/^\s*\d+\.\s*/, "").trim())
            .filter(Boolean)
          onConfigChange({ ...config, hooks })
        }}
      />
    </div>
  )
}

function SchedulePanel({ automation, config }: { automation: Automation; config: AutomationSchema }) {
  return (
    <div className="pr-8">
      <h2 className="text-[24px] font-semibold">Schedule</h2>
      <p className="mt-1 text-[18px] text-[#77766f]">Posting times for {automation.name}.</p>
      <div className="mt-8 grid gap-3">
        {automation.times.slice(0, config.schedule.posting_times.length || 1).map((time, index) => (
          <div key={time} className="flex h-14 items-center justify-between rounded-[8px] border border-[#ecebe4] bg-white px-4">
            <div>
              <span className="text-[15px] font-semibold">{time}</span>
              <div className="mt-0.5 text-[11px] font-medium text-[#8b8a83]">
                {(config.schedule.posting_times[index]?.days ?? []).join(", ")}
              </div>
            </div>
            <SwitchPill enabled />
          </div>
        ))}
      </div>
    </div>
  )
}

function SettingsSwitch({
  title,
  description,
  enabled,
  onClick,
}: {
  title: string
  description?: string
  enabled?: boolean
  onClick?: () => void
}) {
  return (
    <button className="mb-5 flex w-full items-center justify-between gap-5 text-left" onClick={onClick}>
      <div>
        <div className="text-[17px] font-semibold">{title}</div>
        {description && <div className="mt-1 text-[14px] font-medium text-[#8b8a83]">{description}</div>}
      </div>
      <SwitchPill enabled={enabled} />
    </button>
  )
}

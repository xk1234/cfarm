"use client"

import { useMemo, useState } from "react"
import { AutomationGeneralSettingsPanel } from "@/components/realfarm/automation-settings/general-settings"
import { PromptConfigPanel } from "@/components/realfarm/automation-settings/prompt-settings"
import { CollectionSelector } from "@/components/realfarm/collection-selector"
import { Button } from "@/components/ui/button"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import { useDirtyGuard } from "@/components/ui/use-dirty-guard"
import {
  defaultAutomationSchema,
  schemaWithAutomationHooks,
  type AutomationSchema,
  type AutomationVideoTemplateId,
} from "@/lib/realfarm-automation"
import type { CreatedImageCollection } from "@/lib/realfarm-collections"
import type { Automation } from "@/lib/realfarm-data"
import { videoAutomationTemplatePreset } from "@/lib/video-automation-templates"
import { generationModelRegistry } from "@/lib/realfarm-generation-model-registry"

type SetupTab = "editor" | "text" | "settings"

const setupTabs: Array<{ id: SetupTab; label: string }> = [
  { id: "editor", label: "Editor" },
  { id: "text", label: "Text" },
  { id: "settings", label: "Settings" },
]

export function VideoAutomationCreateDialog({
  templateId,
  collections,
  onCreateCollection,
  onBack,
  onCreate,
}: {
  templateId: AutomationVideoTemplateId
  collections: CreatedImageCollection[]
  onCreateCollection: (collection: CreatedImageCollection) => void
  onBack: () => void
  onCreate: (input: { name: string; schema: AutomationSchema }) => Promise<void>
}) {
  const preset = videoAutomationTemplatePreset(templateId)
  const initialAutomation = useMemo(
    () => automationSummary(`${preset.name} template`, templateId),
    [preset.name, templateId]
  )
  const [name, setName] = useState(initialAutomation.name)
  const [initialConfig] = useState<AutomationSchema>(() =>
    initialVideoSchema(initialAutomation, templateId, collections)
  )
  const [config, setConfig] = useState<AutomationSchema>(initialConfig)
  const [activeTab, setActiveTab] = useState<SetupTab>("editor")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")
  const effectiveConfig = useMemo(
    () => ({
      ...withDefaultGreenscreenCollections(config, collections),
      social_integrations: [],
      social_publish_as: {},
      posting_mode: "manual" as const,
      tiktok_post_settings: {
        ...config.tiktok_post_settings,
        auto_post: false,
      },
    }),
    [collections, config]
  )
  const automation = useMemo(
    () => ({
      ...initialAutomation,
      name: name.trim() || initialAutomation.name,
    }),
    [initialAutomation, name]
  )
  const mediaIssue = greenscreenMediaIssue(effectiveConfig, collections)
  const dirtyGuard = useDirtyGuard(
    name !== initialAutomation.name ||
      JSON.stringify(config) !== JSON.stringify(initialConfig)
  )

  function requestBack() {
    if (creating) return
    dirtyGuard.run(onBack)
  }

  function updateName(value: string) {
    setName(value)
  }

  async function createAutomation() {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError("Give the template a name before creating it.")
      setActiveTab("editor")
      return
    }
    if (mediaIssue) {
      setError(mediaIssue)
      setActiveTab("editor")
      return
    }

    setCreating(true)
    setError("")
    try {
      await onCreate({
        name: trimmedName,
        schema: effectiveConfig,
      })
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not create the template."
      )
      setCreating(false)
    }
  }

  return (
    <>
      <AppModal onClose={requestBack}>
        <AppModalPanel className="flex h-[min(850px,92vh)] max-w-[1100px] flex-col overflow-hidden rounded-[12px]">
          <AppModalHeader
            title={`Create ${preset.name} template`}
            onClose={requestBack}
            closeLabel="Back to templates"
          />

          <nav
            className="flex h-12 shrink-0 items-end justify-center gap-6 border-b border-app-panel-border px-3"
            aria-label="Template editor"
          >
            {setupTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`h-12 border-b-2 px-2 text-[13px] font-semibold ${
                  activeTab === tab.id
                    ? "border-app-strong text-app-text"
                    : "border-transparent text-app-text-faint"
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {activeTab === "editor" ? (
              <MediaSetup
                name={name}
                templateId={templateId}
                config={effectiveConfig}
                collections={collections}
                onNameChange={updateName}
                onConfigChange={setConfig}
                onCreateCollection={onCreateCollection}
              />
            ) : null}
            {activeTab === "text" ? (
              <PromptConfigPanel
                automation={automation}
                config={config}
                onConfigChange={setConfig}
                onCancel={requestBack}
                onSave={() => undefined}
                hideFooter
              />
            ) : null}
            {activeTab === "settings" ? (
              <AutomationGeneralSettingsPanel
                config={config}
                selectedSound={null}
                music={[]}
                onConfigChange={setConfig}
              />
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-app-panel-border bg-app-surface px-5 py-4">
            <p className="min-h-5 text-[13px] font-semibold text-[#a8464f]">
              {error}
            </p>
            <div className="flex shrink-0 items-center gap-3">
              <Button
                type="button"
                variant="softControl"
                disabled={creating}
                onClick={requestBack}
              >
                Back
              </Button>
              <Button
                type="button"
                variant="action"
                disabled={creating}
                onClick={() => void createAutomation()}
              >
                {creating ? "Creating…" : "Create template"}
              </Button>
            </div>
          </div>
        </AppModalPanel>
      </AppModal>

      {dirtyGuard.confirmation}
    </>
  )
}

function MediaSetup({
  name,
  templateId,
  config,
  collections,
  onNameChange,
  onConfigChange,
  onCreateCollection,
}: {
  name: string
  templateId: AutomationVideoTemplateId
  config: AutomationSchema
  collections: CreatedImageCollection[]
  onNameChange: (name: string) => void
  onConfigChange: (config: AutomationSchema) => void
  onCreateCollection: (collection: CreatedImageCollection) => void
}) {
  const format = config.video_format
  const isGreenscreen = templateId === "greenscreen_meme"

  function selectSegmentCollection(segmentId: string, collectionId: string) {
    if (!format) return
    onConfigChange({
      ...config,
      video_format: {
        ...format,
        segments: format.segments.map((segment) =>
          segment.id === segmentId ? { ...segment, collectionId } : segment
        ),
      },
    })
  }

  return (
    <div className="px-9 py-8 pr-12">
      <h2 className="text-[28px] leading-tight font-bold text-app-text">
        Automation setup
      </h2>
      <div className="mt-8 border-t border-app-panel-border pt-6">
        <label className="block">
          <span className="text-[15px] font-semibold text-app-text">
            Template name
          </span>
          <input
            className="mt-2 h-11 w-full rounded-[8px] border border-app-panel-border bg-app-surface px-3 text-[14px] font-medium outline-none focus:border-[#9f9e96]"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            autoFocus
          />
        </label>

        {isGreenscreen && format ? (
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {format.segments.map((segment) => {
              const matchingCollections = collections.filter((collection) =>
                segment.mediaKind === "video"
                  ? collection.mediaType === "video"
                  : collection.mediaType !== "video"
              )
              return (
                <div key={segment.id}>
                  <CollectionSelector
                    label={segment.label}
                    collection={matchingCollections.find(
                      (collection) => collection.id === segment.collectionId
                    )}
                    collections={matchingCollections}
                    onChange={(collectionId) =>
                      selectSegmentCollection(segment.id, collectionId)
                    }
                    onCreateCollection={onCreateCollection}
                  />
                  <p className="px-1 text-[12px] leading-5 font-medium text-app-muted-text">
                    {segment.guidance}
                  </p>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="mt-8 rounded-[10px] border border-app-panel-border bg-app-surface-subtle p-4">
            <div className="text-[14px] font-bold text-app-text">
              Media comes next
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function automationSummary(
  name: string,
  templateId: AutomationVideoTemplateId = "ugc_ad"
): Automation {
  const isUgc = templateId === "ugc_ad"
  return {
    id: "new-video-template",
    name,
    automationKind: isUgc ? "ugc" : "video",
    status: isUgc ? "paused" : "live",
    account: "No social account",
    handle: "",
    times: [],
    favorite: false,
    theme: "ugc",
    socialIntegrations: [],
  }
}

export function initialVideoSchema(
  automation: Automation,
  templateId: AutomationVideoTemplateId,
  collections: CreatedImageCollection[]
) {
  const preset = videoAutomationTemplatePreset(templateId)
  const format = preset.buildFormat()
  if (templateId === "ugc_ad") {
    return {
      ...defaultAutomationSchema({
        ...automation,
        automationKind: "ugc",
        status: "paused",
      }),
      automationKind: "ugc" as const,
      status: "paused" as const,
      ugc: {
        enabled: true,
        actorSource: "generate" as const,
        actorPrompt: "Friendly creator, natural window light, direct to camera",
        voiceId: generationModelRegistry.ugc.elevenLabsDefaultVoiceId,
        voiceModel: generationModelRegistry.ugc.elevenLabsModelId,
        lipSyncTier: "standard" as const,
        targetDurationSeconds: 40,
        brollCount: 3,
        captions: {
          enabled: true,
          style: "karaoke",
          fallback: "drawtext" as const,
        },
        hookOverlay: { enabled: true, durationMs: 3000, style: "bold" },
      },
    }
  }
  const schema = {
    ...defaultAutomationSchema(automation),
    automationKind: "video" as const,
    video_format: format,
  }

  const withHooks =
    templateId === "greenscreen_meme"
      ? schemaWithAutomationHooks(schema, [
          "POV: you finally found the easier way",
          "me pretending this was the plan all along",
          "when the one tiny change actually works",
          "trying to explain this to someone who has never done it",
          "the moment you realize you have been doing it the hard way",
        ])
      : schema
  return withDefaultGreenscreenCollections(withHooks, collections)
}

function withDefaultGreenscreenCollections(
  config: AutomationSchema,
  collections: CreatedImageCollection[]
) {
  const format = config.video_format
  if (format?.template !== "greenscreen_meme") return config
  const defaultImageCollection = collections.find(
    (collection) =>
      collection.mediaType !== "video" && collection.images.length > 0
  )
  if (!defaultImageCollection) return config

  return {
    ...config,
    video_format: {
      ...format,
      segments: format.segments.map((segment) =>
        segment.id === "greenscreen-background" && !segment.collectionId
          ? { ...segment, collectionId: defaultImageCollection.id }
          : segment
      ),
    },
  }
}

function greenscreenMediaIssue(
  config: AutomationSchema,
  collections: CreatedImageCollection[]
) {
  if (config.video_format?.template !== "greenscreen_meme") return ""
  for (const segment of config.video_format.segments) {
    const collection = collections.find(
      (candidate) => candidate.id === segment.collectionId
    )
    if (!collection?.images.length) {
      return `Choose a ${segment.mediaKind} collection for ${segment.label.toLowerCase()}.`
    }
  }
  return ""
}

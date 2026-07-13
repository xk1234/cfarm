"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { DateTime } from "luxon"
import { toast } from "sonner"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  IconBolt,
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconFilter,
  IconHome,
  IconLayoutDashboard,
  IconList,
  IconMail,
  IconMessage,
  IconPhoto,
  IconPhotoPlus,
  IconPlayerPlay,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconStar,
  IconStarFilled,
  IconSwitch,
  IconTrash,
  IconUpload,
  IconVolume,
  IconX,
} from "@tabler/icons-react"
import {
  Ban,
  ChevronRight as LucideChevronRight,
  Copy,
  Expand,
  Folder,
  Grid2X2,
  ImagePlus,
  Pause,
  Pencil,
  Search as LucideSearch,
  Shrink,
  SlidersHorizontal,
  Trash2,
  X as LucideX,
} from "lucide-react"

import {
  EditorPopupMenu,
  EditorPopupOption,
} from "@/components/ui/editor-popup"
import {
  AnalyticsView,
  ContentCalendarView,
} from "@/components/realfarm/calendar-analytics"
import { AutomationSettingsDrawer } from "@/components/realfarm/automation-settings"
import { AutomationsView } from "@/components/realfarm/automations-view"
import { SocialAccountPickerModal } from "@/components/realfarm/social-account-picker"
import { UserSettingsModal } from "@/components/realfarm/user-settings-modal"
import { KnowledgeBasesPanel } from "@/components/realfarm/knowledge-bases-panel"
import {
  BuilderStep,
  CreatorBuilderPanel,
  CreatorPageShell,
  SoundSelector,
} from "@/components/realfarm/creator-ui"
import { GreenscreenMemesView } from "@/components/realfarm/greenscreen-view"
import {
  CollectionDetailView,
  CollectionsView,
} from "@/components/realfarm/collections-view"
import { HomeView } from "@/components/realfarm/home-view"
import { AvatarsView } from "@/components/realfarm/characters-view"
import { Sidebar, type ViewKey } from "@/components/realfarm/navigation"
import { TemplateFolderModal } from "@/components/realfarm/templates"
import { Button } from "@/components/ui/button"
import {
  CheckedDropdownButton,
  FormatLabeledSelect,
  FormatSelect,
  LabelledSelect,
  SelectLike,
  SwitchPill,
  SwitchPillButton,
  ToggleRow,
} from "@/components/ui/form-controls"
import { SwipesView } from "@/components/realfarm/swipes-view"
import {
  AutomationThumb,
  AvatarDot,
  CollectionPreview,
  ControlRow,
  ControlSelect,
  ControlToggle,
  PinterestPreviewTile,
  SlideThumb,
  ToolPill,
  VideoGrid,
  thumbTone,
} from "@/components/realfarm/shared-media"
import {
  alignmentLabel,
  anchorLabel,
  aspectRatioLabel,
  automationAlignments,
  automationAnchors,
  automationAspectRatios,
  automationCreatedAt,
  automationImageGrids,
  automationWordLengths,
  defaultAutomationTextItem,
  imageGridLabel,
  labelToAlignment,
  labelToAnchor,
  labelToAspectRatio,
  labelToImageGrid,
  labelToWordLength,
  mergeAutomationSchema,
  wordLengthLabel,
  type AutomationSchedule,
  type AutomationSchema,
  type AutomationSocialIntegration,
  type AutomationStatus,
  type AutomationTextItem,
  type RuntimeAutomationTemplate,
  type ImageCollectionConfig,
} from "@/lib/realfarm-automation"
import {
  allImagesCollectionFrom,
  collectionToStored,
  defaultImageCollections,
  storedToCollection,
  ugcAvatarVideoCollectionFromAssets,
  type CreatedImageCollection,
  type PinterestCollectionCreatePayload,
  type StoredImageCollection,
} from "@/lib/realfarm-collections"
import type { Automation, LocalAsset, RealFarmData } from "@/lib/realfarm-data"
import type { AutomationRecord } from "@/lib/automations"
import type { AutomationTemplateRecord } from "@/lib/automation-templates"
import {
  defaultCharacterAttributes,
  normalizeCharacterAttributes,
  type Character,
} from "@/lib/character-model"
import type { CharacterPayload, CharacterRecord } from "@/lib/characters"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import type { PinterestSearchResult } from "@/lib/pinterest-search"
import type { ProductCollection } from "@/lib/product-collections"
import { isSlideshowSocialProvider } from "@/lib/slideshow-social-platforms"
import { cn } from "@/lib/utils"

export type AutomationRunSummary = {
  ownerId?: string
  id: string
  automationId: string
  automationTitle?: string
  scheduledFor?: string
  status?: string
  createdAt: string
  error?: string
  videoUrl?: string
  thumbnailUrl?: string
  outputImages?: string[]
  outputDir?: string
  renderedSlides?: {
    id?: string
    imageUrl?: string
    sourceImageUrl?: string
    text?: string
    imageCaption?: string
    durationMs?: number
    aspectRatio?: string
  }[]
  plan?: {
    title?: string
    hook?: string
    publishType?: string
    language?: string
    slides?: {
      id?: string
      imageUrl?: string
      text?: string
      imageCaption?: string
      durationSeconds?: number
    }[]
  }
}

export type InitialTemplateData = {
  templates: Automation[]
  schemas: Record<string, AutomationSchema>
  exampleRunsByTemplateId: Record<string, AutomationRunSummary[]>
}

const emptyInitialTemplateData: InitialTemplateData = {
  templates: [],
  schemas: {},
  exampleRunsByTemplateId: {},
}

export function RealFarmWorkspace({
  data,
  initialTemplateData = emptyInitialTemplateData,
  user,
}: {
  data: RealFarmData
  initialTemplateData?: InitialTemplateData
  user: { id: string; email: string; emailVerified: boolean }
}) {
  const [view, setView] = useState<ViewKey>("home")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedSoundId, setSelectedSoundId] = useState("")
  const [collections, setCollections] = useState<CreatedImageCollection[]>(() =>
    defaultImageCollections(data)
  )
  const [productCollections, setProductCollections] = useState<
    ProductCollection[]
  >([])
  const [selectedCollectionId, setSelectedCollectionId] = useState<
    string | null
  >(null)
  const [createdAutomations, setCreatedAutomations] = useState<Automation[]>([])
  const [persistedAutomations, setPersistedAutomations] = useState<
    Automation[]
  >([])
  const [automationNameEdits, setAutomationNameEdits] = useState<
    Record<string, string>
  >({})
  const [automationFavoriteEdits, setAutomationFavoriteEdits] = useState<
    Record<string, boolean>
  >({})
  const [automationFavoriteRanks, setAutomationFavoriteRanks] = useState<
    Record<string, number>
  >({})
  const [automationConfigEdits, setAutomationConfigEdits] = useState<
    Record<string, AutomationSchema>
  >({})
  const [templateAutomations, setTemplateAutomations] = useState<Automation[]>(
    initialTemplateData.templates
  )
  const [templateConfigEdits, setTemplateConfigEdits] = useState<
    Record<string, AutomationSchema>
  >(() =>
    Object.fromEntries(
      Object.entries(initialTemplateData.schemas).map(([id, schema]) => [
        id,
        reviveAutomationSchema(schema),
      ])
    )
  )
  const [templateExampleRunsById, setTemplateExampleRunsById] = useState<
    Record<string, AutomationRunSummary[]>
  >(initialTemplateData.exampleRunsByTemplateId)
  const [recentAutomationRuns, setRecentAutomationRuns] = useState<
    AutomationRunSummary[]
  >([])
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(
    null
  )
  const [socialAccountAutomation, setSocialAccountAutomation] =
    useState<Automation | null>(null)
  const [templateFolderOpen, setTemplateFolderOpen] = useState(false)

  const automations = useMemo(
    () =>
      [...createdAutomations, ...persistedAutomations]
        .map((automation, index) => ({
          automation: {
            ...automation,
            name: automationNameEdits[automation.id] ?? automation.name,
            favorite:
              automationFavoriteEdits[automation.id] ?? automation.favorite,
          },
          index,
          favoriteRank: automationFavoriteRanks[automation.id] ?? 0,
        }))
        .sort(
          (a, b) =>
            Number(b.automation.favorite) - Number(a.automation.favorite) ||
            b.favoriteRank - a.favoriteRank ||
            a.index - b.index
        )
        .map(({ automation }) => automation),
    [
      automationFavoriteEdits,
      automationFavoriteRanks,
      automationNameEdits,
      createdAutomations,
      persistedAutomations,
    ]
  )
  const allImagesCollection = useMemo(
    () => allImagesCollectionFrom(collections),
    [collections]
  )
  const ugcAvatarVideoCollection = useMemo(
    () => ugcAvatarVideoCollectionFromAssets(data.assets.ugcAvatarVideos),
    [data.assets.ugcAvatarVideos]
  )
  const visibleCollections = useMemo(
    () => [allImagesCollection, ugcAvatarVideoCollection, ...collections],
    [allImagesCollection, ugcAvatarVideoCollection, collections]
  )
  const selectedCollection =
    visibleCollections.find(
      (collection) => collection.id === selectedCollectionId
    ) ?? null
  const selectedSound =
    data.assets.music.find((sound) => sound.id === selectedSoundId) ?? null
  const recentRunsByAutomationId = useMemo(() => {
    return recentAutomationRuns.reduce<Record<string, AutomationRunSummary[]>>(
      (groups, run) => {
        groups[run.automationId] = [...(groups[run.automationId] ?? []), run]
        return groups
      },
      {}
    )
  }, [recentAutomationRuns])
  const showcaseRunsByAutomationId = useMemo(
    () => ({ ...templateExampleRunsById, ...recentRunsByAutomationId }),
    [recentRunsByAutomationId, templateExampleRunsById]
  )

  useEffect(() => {
    const initialHash = window.location.hash
    let ignoredInitialHashChange = false

    function syncSwipeHashView() {
      if (!ignoredInitialHashChange && window.location.hash === initialHash) {
        ignoredInitialHashChange = true
        return
      }
      ignoredInitialHashChange = true
      if (window.location.hash.startsWith("#swipe=")) {
        setView("swipes")
      }
    }

    window.addEventListener("hashchange", syncSwipeHashView)
    return () => window.removeEventListener("hashchange", syncSwipeHashView)
  }, [])

  useEffect(() => {
    let active = true
    void fetchJsonWithTimeout<{ collections?: StoredImageCollection[] }>(
      "/api/image-collections"
    )
      .then((payload) => {
        if (!active || !payload?.collections?.length) {
          return
        }
        setCollections(payload.collections.map(storedToCollection))
      })
      .catch(() => undefined)

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    void fetchJsonWithTimeout<{ collections?: ProductCollection[] }>(
      "/api/product-collections"
    )
      .then((payload) => {
        if (active) setProductCollections(payload.collections ?? [])
      })
      .catch(() => undefined)

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    void fetchJsonWithTimeout<{
      automations?: Automation[]
      records?: AutomationRecord[]
    }>("/api/automations")
      .then((payload) => {
        if (!active || !payload?.automations) {
          return
        }
        setPersistedAutomations(payload.automations)
        setAutomationConfigEdits((current) => ({
          ...Object.fromEntries(
            (payload.records ?? []).map((record) => [
              record.id,
              reviveAutomationSchema(record.schema),
            ])
          ),
          ...current,
        }))
      })
      .catch(() => undefined)

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    void fetchJsonWithTimeout<{
      templates?: Automation[]
      records?: AutomationTemplateRecord[]
      schemas?: Record<string, AutomationSchema>
      exampleRunsByTemplateId?: Record<string, AutomationRunSummary[]>
    }>("/api/automation-templates")
      .then((payload) => {
        if (!active || !payload?.templates) {
          return
        }
        setTemplateAutomations(payload.templates)
        setTemplateExampleRunsById(payload.exampleRunsByTemplateId ?? {})
        setTemplateConfigEdits(
          Object.fromEntries(
            Object.entries(payload.schemas ?? {}).map(([id, schema]) => [
              id,
              reviveAutomationSchema(schema),
            ])
          )
        )
      })
      .catch(() => undefined)

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    void fetchJsonWithTimeout<{ runs?: AutomationRunSummary[] }>(
      "/api/automations/runs?limit=100",
      {
        toastOnError: false,
      }
    )
      .then((payload) => {
        if (active) {
          setRecentAutomationRuns(payload.runs ?? [])
        }
      })
      .catch(() => undefined)

    return () => {
      active = false
    }
  }, [])

  function persistCollection(collection: CreatedImageCollection) {
    if (collection.virtual) {
      return
    }
    void fetchJsonWithTimeout("/api/image-collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectionToStored(collection)),
    }).catch(() => undefined)
  }

  function toggleCollectionPin(id: string) {
    const previous = collections.find((collection) => collection.id === id)
    if (!previous || previous.virtual) return

    const nextCollection = { ...previous, pinned: !previous.pinned }
    setCollections((current) =>
      current.map((collection) =>
        collection.id === id ? nextCollection : collection
      )
    )

    void fetchJsonWithTimeout("/api/image-collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectionToStored(nextCollection)),
    }).catch(() => {
      setCollections((current) =>
        current.map((collection) =>
          collection.id === id ? previous : collection
        )
      )
      toast.error("Could not update the collection pin")
    })
  }

  function upsertRecentAutomationRun(run: AutomationRunSummary) {
    setRecentAutomationRuns((current) =>
      [run, ...current.filter((item) => item.id !== run.id)].slice(0, 100)
    )
  }

  function removeRecentAutomationRun(runId: string) {
    setRecentAutomationRuns((current) =>
      current.filter((item) => item.id !== runId)
    )
  }

  function deleteCollections(ids: string[]) {
    const deletedCollections = collections.filter((collection) =>
      ids.includes(collection.id)
    )
    setCollections((current) =>
      current.filter((collection) => !ids.includes(collection.id))
    )
    const persistedCollections = deletedCollections.filter(
      (collection) => !collection.virtual
    )
    if (persistedCollections.length === 0) {
      return
    }

    void fetchJsonWithTimeout("/api/image-collections", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collections: persistedCollections.map(collectionToStored),
      }),
    }).catch((error) => {
      setCollections((current) => {
        const currentIds = new Set(current.map((collection) => collection.id))
        return [
          ...deletedCollections.filter(
            (collection) => !currentIds.has(collection.id)
          ),
          ...current,
        ]
      })
      window.alert(getApiErrorMessage(error))
    })
  }

  function createDraft() {
    return undefined
  }

  function persistAutomationPatch(
    id: string,
    patch: {
      name?: string
      favorite?: boolean
      status?: AutomationStatus
      schema?: AutomationSchema
    }
  ) {
    void fetchJsonWithTimeout("/api/automations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
      toastOnError: false,
    }).catch((error) => {
      window.alert(getApiErrorMessage(error, "Failed to update automation"))
    })
  }

  function deleteAutomation(id: string) {
    const deletedPersisted = persistedAutomations.find(
      (automation) => automation.id === id
    )
    const deletedCreated = createdAutomations.find(
      (automation) => automation.id === id
    )
    const deletedConfig = automationConfigEdits[id]

    setPersistedAutomations((current) =>
      current.filter((automation) => automation.id !== id)
    )
    setCreatedAutomations((current) =>
      current.filter((automation) => automation.id !== id)
    )
    setAutomationConfigEdits((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    setEditingAutomation(null)

    void fetchJsonWithTimeout(`/api/automations/${encodeURIComponent(id)}`, {
      method: "DELETE",
      timeoutMs: 15_000,
      toastOnError: false,
    }).catch((error) => {
      if (deletedPersisted) {
        setPersistedAutomations((current) => [deletedPersisted, ...current])
      }
      if (deletedCreated) {
        setCreatedAutomations((current) => [deletedCreated, ...current])
      }
      if (deletedConfig) {
        setAutomationConfigEdits((current) => ({
          ...current,
          [id]: deletedConfig,
        }))
      }
      window.alert(getApiErrorMessage(error, "Failed to delete automation"))
    })
  }

  function applyAutomationRecord(
    record: AutomationRecord,
    automation: Automation
  ) {
    setPersistedAutomations((current) => [
      automation,
      ...current.filter((item) => item.id !== automation.id),
    ])
    setCreatedAutomations((current) =>
      current.filter((item) => item.id !== automation.id)
    )
    setAutomationConfigEdits((current) => ({
      ...current,
      [automation.id]: reviveAutomationSchema(record.schema),
    }))
    return automation
  }

  function toggleAutomationStatus(automation: Automation) {
    const currentConfig = mergeAutomationSchema(
      automation,
      automationConfigEdits[automation.id]
    )
    const nextStatus: AutomationStatus =
      currentConfig.status === "paused" ? "live" : "paused"
    const nextConfig = { ...currentConfig, status: nextStatus }
    const nextAutomation = {
      ...automation,
      status: nextStatus,
    }

    setAutomationConfigEdits((current) => ({
      ...current,
      [automation.id]: nextConfig,
    }))
    setPersistedAutomations((current) =>
      current.map((item) => (item.id === automation.id ? nextAutomation : item))
    )
    setCreatedAutomations((current) =>
      current.map((item) => (item.id === automation.id ? nextAutomation : item))
    )
    setEditingAutomation((current) =>
      current?.id === automation.id ? nextAutomation : current
    )
    persistAutomationPatch(automation.id, {
      status: nextStatus,
      schema: nextConfig,
    })
  }

  function onSocialIntegrationsChange(
    automation: Automation,
    socialIntegrations: AutomationSocialIntegration[]
  ) {
    const slideshowSocialIntegrations = socialIntegrations.filter(
      (integration) => isSlideshowSocialProvider(integration.provider)
    )
    const currentConfig = mergeAutomationSchema(
      automation,
      automationConfigEdits[automation.id]
    )
    const nextConfig = {
      ...currentConfig,
      social_integrations: slideshowSocialIntegrations,
    }
    const nextAutomation = withSocialIntegrationSummary(
      automation,
      slideshowSocialIntegrations
    )

    setAutomationConfigEdits((current) => ({
      ...current,
      [automation.id]: nextConfig,
    }))
    setPersistedAutomations((current) =>
      current.map((item) => (item.id === automation.id ? nextAutomation : item))
    )
    setCreatedAutomations((current) =>
      current.map((item) => (item.id === automation.id ? nextAutomation : item))
    )
    setEditingAutomation((current) =>
      current?.id === automation.id ? nextAutomation : current
    )
    setSocialAccountAutomation((current) =>
      current?.id === automation.id ? nextAutomation : current
    )
    persistAutomationPatch(automation.id, { schema: nextConfig })
  }

  async function createLocalAutomation(
    input: {
      name?: string
      automationKind?: Automation["automationKind"]
      schema?: AutomationSchema
      template?: RuntimeAutomationTemplate
      overrides?: {
        status?: AutomationStatus
        social_integrations?: AutomationSocialIntegration[]
        schedule?: AutomationSchedule
      }
    } = {}
  ) {
    const payload = await fetchJsonWithTimeout<{
      automation?: Automation
      record?: AutomationRecord
    }>("/api/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        automationKind: input.automationKind,
        schema: input.schema,
        template: input.template,
        overrides: input.overrides,
      }),
    })

    if (!payload.automation || !payload.record) {
      throw new Error("Failed to create automation")
    }

    return applyAutomationRecord(payload.record, payload.automation)
  }

  function changeView(nextView: ViewKey) {
    if (nextView === "automations") {
      setEditingAutomation(null)
    }
    setView(nextView)
  }

  function showAutomationList() {
    setEditingAutomation(null)
    setView("automations")
  }

  const fillsWorkspace = view === "automations" && Boolean(editingAutomation)

  return (
    <main className="relative h-svh overflow-hidden bg-[#f7f7fa] text-[#111117]">
      {view === "home" && !user.emailVerified ? (
        <EmailVerificationBanner email={user.email} />
      ) : null}
      <div className="flex h-svh">
        <Sidebar
          data={data}
          view={view}
          onViewChange={changeView}
          onNewAutomation={() => setTemplateFolderOpen(true)}
          onSettings={() => setSettingsOpen(true)}
        />
        <section
          className={cn(
            "min-w-0 flex-1 overflow-y-auto",
            fillsWorkspace ? "p-0" : "px-4 py-4 sm:px-5 sm:py-5 lg:px-7"
          )}
        >
          {view === "home" && (
            <HomeView
              currentUserId={user.id}
              data={data}
              templates={templateAutomations}
              recentRunsByAutomationId={showcaseRunsByAutomationId}
              generatedRunsByAutomationId={recentRunsByAutomationId}
              onCreate={() => setTemplateFolderOpen(true)}
              onUseTemplate={(automation) => {
                const templateSource = mergeAutomationSchema(
                  automation,
                  templateConfigEdits[automation.id]
                )
                void createLocalAutomation({
                  name: automation.name,
                  template: {
                    automationKind: templateSource.automationKind,
                    prompt_formatting: templateSource.prompt_formatting,
                    image_collection_ids: templateSource.image_collection_ids,
                    formatting: templateSource.formatting,
                    tiktok_post_settings: templateSource.tiktok_post_settings,
                  },
                })
                  .then((createdAutomation) => {
                    setView("automations")
                    setEditingAutomation(createdAutomation)
                  })
                  .catch(() => undefined)
              }}
              onAutomations={showAutomationList}
            />
          )}
          {view === "swipes" && <SwipesView currentUserId={user.id} />}
          {view === "avatars" && <AvatarsView />}
          {view === "greenscreen" && (
            <GreenscreenMemesView
              data={data}
              collections={visibleCollections}
              selectedSound={selectedSound}
              music={data.assets.music}
              onSoundSelect={setSelectedSoundId}
              onCreateCollection={(collection) => {
                setCollections((current) => [
                  collection,
                  ...current.filter((item) => item.id !== collection.id),
                ])
                persistCollection(collection)
              }}
              onCreate={createDraft}
            />
          )}
          {view === "schedule" && (
            <ContentCalendarView onGoAutomations={showAutomationList} />
          )}
          {view === "analytics" && <AnalyticsView />}
          {view === "knowledge" && (
            <div className="mx-auto max-w-[1540px]">
              <div className="mb-6">
                <h1 className="text-[24px] font-semibold tracking-normal">
                  Knowledge Bases
                </h1>
                <p className="mt-1 text-[13px] font-medium text-app-muted-text">
                  Build reusable research context for your automations.
                </p>
              </div>
              <KnowledgeBasesPanel />
            </div>
          )}
          {view === "collections" &&
            (selectedCollection ? (
              <CollectionDetailView
                collection={selectedCollection}
                readonly={selectedCollection.virtual}
                onBack={() => setSelectedCollectionId(null)}
                onAddImages={(images) => {
                  if (selectedCollection.virtual) {
                    return
                  }
                  const nextCollection = {
                    ...selectedCollection,
                    images: [...images, ...selectedCollection.images],
                  }
                  setCollections((current) =>
                    current.map((collection) =>
                      collection.id === selectedCollection.id
                        ? nextCollection
                        : collection
                    )
                  )
                  persistCollection(nextCollection)
                }}
                onRemoveImages={(keys) => {
                  if (selectedCollection.virtual) {
                    return
                  }
                  const nextCollection = {
                    ...selectedCollection,
                    images: selectedCollection.images.filter(
                      (image) => !keys.includes(image.id || image.imageUrl)
                    ),
                  }
                  setCollections((current) =>
                    current.map((collection) =>
                      collection.id === selectedCollection.id
                        ? nextCollection
                        : collection
                    )
                  )
                  persistCollection(nextCollection)
                }}
                onUpdateCollection={(nextCollection) => {
                  if (selectedCollection.virtual) {
                    return
                  }
                  setCollections((current) =>
                    current.map((collection) =>
                      collection.id === selectedCollection.id
                        ? nextCollection
                        : collection
                    )
                  )
                  persistCollection(nextCollection)
                }}
                onRename={(title) => {
                  if (selectedCollection.virtual) {
                    return
                  }
                  const nextCollection = { ...selectedCollection, title }
                  setCollections((current) =>
                    current.map((collection) =>
                      collection.id === selectedCollection.id
                        ? nextCollection
                        : collection
                    )
                  )
                  persistCollection(nextCollection)
                  setSelectedCollectionId(selectedCollection.id)
                }}
                onCreateAutomation={(name) => {
                  void createLocalAutomation({ name })
                    .then((automation) => {
                      setView("automations")
                      setEditingAutomation(automation)
                      setSelectedCollectionId(null)
                    })
                    .catch(() => undefined)
                }}
              />
            ) : (
              <CollectionsView
                collections={visibleCollections}
                productCollections={productCollections}
                onCreateCollection={(collection) => {
                  setCollections((current) => [collection, ...current])
                  persistCollection(collection)
                }}
                onDeleteCollections={(ids) => {
                  deleteCollections(ids)
                }}
                onOpenCollection={setSelectedCollectionId}
                onToggleCollectionPin={toggleCollectionPin}
              />
            ))}
          {view === "automations" &&
            (editingAutomation ? (
              <AutomationSettingsDrawer
                key={editingAutomation.id}
                automation={editingAutomation}
                config={mergeAutomationSchema(
                  editingAutomation,
                  automationConfigEdits[editingAutomation.id]
                )}
                collections={visibleCollections}
                selectedSound={selectedSound}
                music={data.assets.music}
                demoVideos={data.assets.demoVideos}
                onCreateCollection={(collection) => {
                  setCollections((current) => [
                    collection,
                    ...current.filter((item) => item.id !== collection.id),
                  ])
                  persistCollection(collection)
                }}
                onRename={(name) => {
                  setAutomationNameEdits((current) => ({
                    ...current,
                    [editingAutomation.id]: name,
                  }))
                  setAutomationConfigEdits((current) => {
                    const nextConfig = mergeAutomationSchema(
                      editingAutomation,
                      current[editingAutomation.id]
                    )
                    const renamedConfig = { ...nextConfig, title: name }
                    persistAutomationPatch(editingAutomation.id, {
                      name,
                      schema: renamedConfig,
                    })
                    return { ...current, [editingAutomation.id]: renamedConfig }
                  })
                  setPersistedAutomations((current) =>
                    current.map((automation) =>
                      automation.id === editingAutomation.id
                        ? { ...automation, name }
                        : automation
                    )
                  )
                  setCreatedAutomations((current) =>
                    current.map((automation) =>
                      automation.id === editingAutomation.id
                        ? { ...automation, name }
                        : automation
                    )
                  )
                  setEditingAutomation((current) =>
                    current ? { ...current, name } : current
                  )
                }}
                onConfigChange={(config) => {
                  setAutomationConfigEdits((current) => ({
                    ...current,
                    [editingAutomation.id]: config,
                  }))
                  persistAutomationPatch(editingAutomation.id, {
                    schema: config,
                  })
                }}
                onGenerationRunUpdate={upsertRecentAutomationRun}
                onGenerationRunRemove={removeRecentAutomationRun}
                onEditSocialAccounts={() =>
                  setSocialAccountAutomation(editingAutomation)
                }
                onDuplicate={async () => {
                  const sourceConfig = mergeAutomationSchema(
                    editingAutomation,
                    automationConfigEdits[editingAutomation.id]
                  )
                  const duplicated = await createLocalAutomation({
                    name: `${editingAutomation.name} Copy`,
                    automationKind: editingAutomation.automationKind,
                    schema: {
                      ...sourceConfig,
                      title: `${editingAutomation.name} Copy`,
                    },
                  })
                  setEditingAutomation(duplicated)
                }}
                onDelete={() => deleteAutomation(editingAutomation.id)}
                onClose={() => setEditingAutomation(null)}
              />
            ) : (
              <AutomationsView
                automations={automations}
                recentRunsByAutomationId={recentRunsByAutomationId}
                onCreateNew={() => setTemplateFolderOpen(true)}
                onRename={(automation, name) => {
                  setAutomationNameEdits((current) => ({
                    ...current,
                    [automation.id]: name,
                  }))
                  setPersistedAutomations((current) =>
                    current.map((item) =>
                      item.id === automation.id ? { ...item, name } : item
                    )
                  )
                  setCreatedAutomations((current) =>
                    current.map((item) =>
                      item.id === automation.id ? { ...item, name } : item
                    )
                  )
                  persistAutomationPatch(automation.id, { name })
                }}
                onToggleFavorite={(automation) => {
                  const nextFavorite = !(
                    automationFavoriteEdits[automation.id] ??
                    automation.favorite
                  )
                  setAutomationFavoriteEdits((current) => ({
                    ...current,
                    [automation.id]: nextFavorite,
                  }))
                  setAutomationFavoriteRanks((current) => ({
                    ...current,
                    [automation.id]: nextFavorite ? Date.now() : 0,
                  }))
                  setPersistedAutomations((current) =>
                    current.map((item) =>
                      item.id === automation.id
                        ? { ...item, favorite: nextFavorite }
                        : item
                    )
                  )
                  setCreatedAutomations((current) =>
                    current.map((item) =>
                      item.id === automation.id
                        ? { ...item, favorite: nextFavorite }
                        : item
                    )
                  )
                  persistAutomationPatch(automation.id, {
                    favorite: nextFavorite,
                  })
                }}
                onToggleStatus={toggleAutomationStatus}
                onEditSocialAccounts={setSocialAccountAutomation}
                onEdit={setEditingAutomation}
              />
            ))}
        </section>
      </div>
      {socialAccountAutomation && (
        <SocialAccountPickerModal
          selectedIntegrations={
            mergeAutomationSchema(
              socialAccountAutomation,
              automationConfigEdits[socialAccountAutomation.id]
            ).social_integrations
          }
          onSelect={(integrations) =>
            onSocialIntegrationsChange(socialAccountAutomation, integrations)
          }
          onClose={() => setSocialAccountAutomation(null)}
        />
      )}
      {settingsOpen ? (
        <UserSettingsModal
          email={user.email}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      {templateFolderOpen && (
        <TemplateFolderModal
          data={data}
          templates={templateAutomations}
          automationConfigs={templateConfigEdits}
          collections={visibleCollections}
          recentRunsByAutomationId={showcaseRunsByAutomationId}
          onClose={() => setTemplateFolderOpen(false)}
          onCreateBlank={(automationKind) => {
            void createLocalAutomation({ automationKind })
              .then((automation) => {
                setTemplateFolderOpen(false)
                setView("automations")
                setEditingAutomation(automation)
              })
              .catch(() => undefined)
          }}
          onUseTemplate={(automation) => {
            const templateSource = mergeAutomationSchema(
              automation,
              templateConfigEdits[automation.id]
            )
            void createLocalAutomation({
              name: automation.name,
              automationKind: automation.automationKind,
              template: {
                automationKind: templateSource.automationKind,
                prompt_formatting: templateSource.prompt_formatting,
                image_collection_ids: templateSource.image_collection_ids,
                formatting: templateSource.formatting,
                tiktok_post_settings: templateSource.tiktok_post_settings,
              },
            })
              .then((createdAutomation) => {
                setTemplateFolderOpen(false)
                setView("automations")
                setEditingAutomation(createdAutomation)
              })
              .catch(() => undefined)
          }}
        />
      )}
    </main>
  )
}

function EmailVerificationBanner({ email }: { email: string }) {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")

  async function resendVerification() {
    setPending(true)
    setMessage("")
    const response = await fetch("/api/auth/verification/resend", {
      method: "POST",
    })
    const payload = (await response.json().catch(() => null)) as {
      error?: string
      alreadyVerified?: boolean
    } | null

    if (payload?.alreadyVerified) {
      window.location.reload()
      return
    }

    setMessage(
      response.ok
        ? "Verification email sent. Check your inbox."
        : payload?.error || "Couldn't send the verification email."
    )
    setPending(false)
  }

  return (
    <div className="absolute top-0 right-0 left-0 z-50 flex flex-col gap-3 border-b border-[#e4d7ff] bg-[#f4efff]/95 px-4 py-3 text-[#32205f] shadow-[0_8px_30px_rgba(55,32,105,0.12)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between md:left-56 md:px-7">
      <div className="flex min-w-0 items-start gap-3 sm:items-center">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-white text-[#6d28d9] shadow-sm sm:mt-0">
          <IconMail className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Verify your email</p>
          <p className="truncate text-xs leading-5 text-[#66568a]">
            Secure your account and make recovery easier for {email}.
          </p>
          {message ? (
            <p className="mt-1 text-xs font-medium text-[#6d28d9]">{message}</p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 pl-11 sm:pl-0">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg px-3 py-2 text-xs font-semibold text-[#66568a] hover:bg-white/70"
        >
          I verified
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={resendVerification}
          className="rounded-lg bg-[#6d28d9] px-3 py-2 text-xs font-semibold text-white hover:bg-[#5b21b6] disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send verification email"}
        </button>
      </div>
    </div>
  )
}

function reviveAutomationSchema(schema: AutomationSchema): AutomationSchema {
  return {
    ...schema,
    created_at: schema.created_at ? new Date(schema.created_at) : new Date(),
  }
}

function withSocialIntegrationSummary(
  automation: Automation,
  socialIntegrations: AutomationSocialIntegration[]
): Automation {
  const activeIntegrations = socialIntegrations.filter(
    (integration) =>
      !integration.disabled && isSlideshowSocialProvider(integration.provider)
  )
  const first = activeIntegrations[0]

  if (!first) {
    return {
      ...automation,
      account: "No social account",
      handle: "Click to add account",
      socialIntegrations,
    }
  }

  const extraCount = activeIntegrations.length - 1
  const provider = socialProviderLabel(first.provider)
  const account = extraCount > 0 ? `${first.name} +${extraCount}` : first.name
  const profile = first.profile
    ? `@${first.profile.replace(/^@/, "")}`
    : provider

  return {
    ...automation,
    account,
    handle: `${provider} · ${profile}`,
    socialIntegrations,
  }
}

function socialProviderLabel(
  provider: AutomationSocialIntegration["provider"]
) {
  switch (provider) {
    case "youtube":
      return "YouTube"
    case "instagram":
      return "Instagram"
    case "tiktok":
      return "TikTok"
    case "tiktok-creative":
      return "TikTok Creative"
    case "tiktok-seller":
      return "TikTok Seller"
    case "facebook":
      return "Facebook"
    case "x":
      return "X"
    case "twitter":
      return "Twitter"
    case "linkedin":
      return "LinkedIn"
    case "threads":
      return "Threads"
    case "pinterest":
      return "Pinterest"
    case "bluesky":
      return "Bluesky"
    case "telegram":
      return "Telegram"
    case "google":
      return "Google"
    case "google-business-profile":
      return "Google Business Profile"
  }
}

"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { DateTime } from "luxon"
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
  IconMessage,
  IconMovie,
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
  IconWand,
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
import { EditorView } from "@/components/realfarm/slideshow-editor"
import { TemplateFolderModal } from "@/components/realfarm/templates"
import { UGCAdsView } from "@/components/realfarm/ugc-ads-view"
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
  type AutomationStatus,
  type AutomationTemplate,
  type AutomationTextItem,
  type ImageCollectionConfig,
} from "@/lib/realfarm-automation"
import {
  allImagesCollectionFrom,
  collectionToStored,
  defaultImageCollections,
  storedToCollection,
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
import { cn } from "@/lib/utils"

type AutomationRunSummary = {
  id: string
  automationId: string
  createdAt: string
  plan?: {
    slides?: {
      id?: string
      imageUrl?: string
      text?: string
      imageCaption?: string
    }[]
  }
}

export function RealFarmWorkspace({ data }: { data: RealFarmData }) {
  const [view, setView] = useState<ViewKey>("home")
  const [selectedSoundId, setSelectedSoundId] = useState("")
  const [collections, setCollections] = useState<CreatedImageCollection[]>(() =>
    defaultImageCollections(data)
  )
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
    []
  )
  const [templateConfigEdits, setTemplateConfigEdits] = useState<
    Record<string, AutomationSchema>
  >({})
  const [templateExampleRunsById, setTemplateExampleRunsById] = useState<
    Record<string, AutomationRunSummary[]>
  >({})
  const [recentAutomationRuns, setRecentAutomationRuns] = useState<
    AutomationRunSummary[]
  >([])
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(
    null
  )
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
  const visibleCollections = useMemo(
    () => [allImagesCollection, ...collections],
    [allImagesCollection, collections]
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

    void fetchJsonWithTimeout(`/api/automations?id=${encodeURIComponent(id)}`, {
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
      status: nextStatus === "live" ? "Live" : "Paused",
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

  async function createLocalAutomation(
    input: {
      name?: string
      schema?: AutomationSchema
      template?: AutomationTemplate
      overrides?: {
        status?: AutomationStatus
        tiktok_account_id?: string | null
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

  return (
    <main className="h-svh overflow-hidden bg-[#f6f6f2] text-[#242421]">
      <div className="flex h-svh">
        <Sidebar
          data={data}
          view={view}
          onViewChange={setView}
          onNewAutomation={() => setTemplateFolderOpen(true)}
        />
        <section className="min-w-0 flex-1 overflow-y-auto px-5 py-5 lg:px-7">
          {view === "home" && (
            <HomeView
              data={data}
              templates={templateAutomations}
              recentRunsByAutomationId={showcaseRunsByAutomationId}
              onCreate={() => setTemplateFolderOpen(true)}
              onUseTemplate={(automation) => {
                const templateSource = mergeAutomationSchema(
                  automation,
                  templateConfigEdits[automation.id]
                )
                void createLocalAutomation({
                  name: automation.name,
                  template: {
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
              onAutomations={() => setView("automations")}
            />
          )}
          {view === "swipes" && <SwipesView />}
          {view === "avatars" && <AvatarsView />}
          {view === "ugcads" && (
            <UGCAdsView
              data={data}
              selectedSound={selectedSound}
              music={data.assets.music}
              onSoundSelect={setSelectedSoundId}
              onCreate={createDraft}
            />
          )}
          {view === "greenscreen" && (
            <GreenscreenMemesView
              data={data}
              collections={visibleCollections}
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
            <ContentCalendarView onGoLibrary={() => setView("editor")} />
          )}
          {view === "analytics" && <AnalyticsView />}
          {view === "editor" && (
            <EditorView
              data={data}
              automations={automations}
              automationConfigs={automationConfigEdits}
              collections={visibleCollections}
              recentRunsByAutomationId={recentRunsByAutomationId}
              selectedSound={selectedSound}
              music={data.assets.music}
              onSoundSelect={setSelectedSoundId}
              onAutomationConfigChange={(automation, config) => {
                const nextConfig = reviveAutomationSchema(config)
                setAutomationConfigEdits((current) => ({
                  ...current,
                  [automation.id]: nextConfig,
                }))
                persistAutomationPatch(automation.id, { schema: nextConfig })
              }}
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
                onCreateCollection={(collection) => {
                  setCollections((current) => [collection, ...current])
                  persistCollection(collection)
                }}
                onDeleteCollections={(ids) => {
                  deleteCollections(ids)
                }}
                onOpenCollection={setSelectedCollectionId}
              />
            ))}
          {view === "automations" && (
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
                  automationFavoriteEdits[automation.id] ?? automation.favorite
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
              onEdit={setEditingAutomation}
            />
          )}
        </section>
      </div>
      {editingAutomation && (
        <AutomationSettingsDrawer
          automation={editingAutomation}
          config={mergeAutomationSchema(
            editingAutomation,
            automationConfigEdits[editingAutomation.id]
          )}
          collections={visibleCollections}
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
            persistAutomationPatch(editingAutomation.id, { schema: config })
          }}
          onDelete={() => deleteAutomation(editingAutomation.id)}
          onClose={() => setEditingAutomation(null)}
        />
      )}
      {templateFolderOpen && (
        <TemplateFolderModal
          data={data}
          templates={templateAutomations}
          automationConfigs={templateConfigEdits}
          collections={visibleCollections}
          recentRunsByAutomationId={showcaseRunsByAutomationId}
          onClose={() => setTemplateFolderOpen(false)}
          onCreateBlank={() => {
            void createLocalAutomation()
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
              template: {
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

function reviveAutomationSchema(schema: AutomationSchema): AutomationSchema {
  return {
    ...schema,
    created_at: schema.created_at ? new Date(schema.created_at) : new Date(),
  }
}

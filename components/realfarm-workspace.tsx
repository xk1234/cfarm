"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { toast } from "sonner"
import type { SocialAccountStatusItem } from "@/components/realfarm/social-account-status"
import {
  MobileNavigation,
  Sidebar,
  type ViewKey,
} from "@/components/realfarm/navigation"
import {
  mergeAutomationSchema,
  type AutomationSchedule,
  type AutomationSchema,
  type AutomationSocialIntegration,
  type AutomationStatus,
  type RuntimeAutomationTemplate,
} from "@/lib/realfarm-automation"
import {
  collectionToStored,
  defaultImageCollections,
  greenscreenMemeCollectionFromAssets,
  storedToCollection,
  ugcAvatarVideoCollectionFromAssets,
  type CreatedImageCollection,
  type StoredImageCollection,
} from "@/lib/realfarm-collections"
import type { Automation, RealFarmData } from "@/lib/realfarm-data"
import {
  xAutomationToAutomation,
  type XAutomationRecord,
  type XAutomationRun,
} from "@/lib/x-automation"
import type { AutomationRecord } from "@/lib/automations"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import type { ProductCollection } from "@/lib/product-collections"
import { isSlideshowSocialProvider } from "@/lib/slideshow-social-platforms"
import { cn } from "@/lib/utils"

const HomeView = dynamic(() =>
  import("@/components/realfarm/home-view").then((module) => module.HomeView)
)
const ContentCalendarView = dynamic(() =>
  import("@/components/realfarm/content-calendar/content-calendar-view").then(
    (module) => module.ContentCalendarView
  )
)
const AnalyticsView = dynamic(() =>
  import("@/components/realfarm/analytics/analytics-view").then(
    (module) => module.AnalyticsView
  )
)
const CollectionsView = dynamic(() =>
  import("@/components/realfarm/collections-view").then(
    (module) => module.CollectionsView
  )
)
const CollectionDetailView = dynamic(() =>
  import("@/components/realfarm/collections-view").then(
    (module) => module.CollectionDetailView
  )
)
const AutomationsView = dynamic(() =>
  import("@/components/realfarm/automations-view").then(
    (module) => module.AutomationsView
  )
)
const AutomationSettingsDrawer = dynamic(() =>
  import("@/components/realfarm/automation-settings").then(
    (module) => module.AutomationSettingsDrawer
  )
)
const XAutomationStudio = dynamic(() =>
  import("@/components/x-automation-studio").then(
    (module) => module.XAutomationStudio
  )
)
const SocialAccountPickerModal = dynamic(() =>
  import("@/components/realfarm/social-account-picker").then(
    (module) => module.SocialAccountPickerModal
  )
)
const UserSettingsModal = dynamic(() =>
  import("@/components/realfarm/user-settings-modal").then(
    (module) => module.UserSettingsModal
  )
)
const TemplateFolderModal = dynamic(() =>
  import("@/components/realfarm/templates").then(
    (module) => module.TemplateFolderModal
  )
)

export type AutomationRunSummary = {
  ownerId?: string
  id: string
  automationId: string
  automationTitle?: string
  scheduledFor?: string
  requestId?: string
  status?: string
  slideshowId?: string
  socialStatuses?: SocialAccountStatusItem[]
  manuallyPublishedAt?: string
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

async function loadRecentAutomationRuns() {
  const payload = await fetchJsonWithTimeout<{
    runs?: AutomationRunSummary[]
  }>("/api/automations/runs?limit=100", {
    toastOnError: false,
  })
  return payload.runs ?? []
}

export function RealFarmWorkspace({
  data,
  initialTemplateData = emptyInitialTemplateData,
  initialNavigation,
  user,
}: {
  data: RealFarmData
  initialTemplateData?: InitialTemplateData
  initialNavigation?: {
    view?: ViewKey
    automationId?: string
    runId?: string
  }
  user: { id: string; email: string; emailVerified: boolean }
}) {
  const [view, setView] = useState<ViewKey>(initialNavigation?.view ?? "home")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedSoundId] = useState("")
  const [workspaceAssets, setWorkspaceAssets] = useState(data.assets)
  const [workspaceAssetsLoaded, setWorkspaceAssetsLoaded] = useState(
    Object.values(data.assets).some((assets) => assets.length > 0)
  )
  const [collections, setCollections] = useState<CreatedImageCollection[]>(() =>
    defaultImageCollections(data)
  )
  const [collectionsLoaded, setCollectionsLoaded] = useState(false)
  const [productCollections, setProductCollections] = useState<
    ProductCollection[]
  >([])
  const [productCollectionsLoaded, setProductCollectionsLoaded] =
    useState(false)
  const [selectedCollectionId, setSelectedCollectionId] = useState<
    string | null
  >(null)
  const [createdAutomations, setCreatedAutomations] = useState<Automation[]>([])
  const [persistedAutomations, setPersistedAutomations] = useState<
    Automation[]
  >([])
  const [persistedAutomationsLoaded, setPersistedAutomationsLoaded] =
    useState(false)
  const [xAutomations, setXAutomations] = useState<XAutomationRecord[]>([])
  const [xAutomationsLoaded, setXAutomationsLoaded] = useState(false)
  const [xAutomationRuns, setXAutomationRuns] = useState<XAutomationRun[]>([])
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
  const templateAutomations = initialTemplateData.templates
  const templateConfigEdits = useMemo<Record<string, AutomationSchema>>(
    () =>
      Object.fromEntries(
        Object.entries(initialTemplateData.schemas).map(([id, schema]) => [
          id,
          reviveAutomationSchema(schema),
        ])
      ),
    [initialTemplateData.schemas]
  )
  const templateExampleRunsById = initialTemplateData.exampleRunsByTemplateId
  const [recentRunsLoaded, setRecentRunsLoaded] = useState(false)
  const [recentRunsError, setRecentRunsError] = useState("")
  const [recentAutomationRuns, setRecentAutomationRuns] = useState<
    AutomationRunSummary[]
  >([])
  const recentRunsRevisionRef = useRef(0)
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(
    null
  )
  const linkedAutomationId = initialNavigation?.automationId?.trim() ?? ""
  const linkedAutomationRunId = initialNavigation?.runId?.trim() ?? ""
  const [socialAccountAutomation, setSocialAccountAutomation] =
    useState<Automation | null>(null)
  const [templateFolderOpen, setTemplateFolderOpen] = useState(false)

  const automations = useMemo(
    () =>
      [
        ...createdAutomations,
        ...persistedAutomations,
        ...xAutomations.map(xAutomationToAutomation),
      ]
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
      xAutomations,
    ]
  )
  const ugcAvatarVideoCollection = useMemo(
    () =>
      ugcAvatarVideoCollectionFromAssets(
        workspaceAssets.ugcAvatarVideos,
        collections
      ),
    [collections, workspaceAssets.ugcAvatarVideos]
  )
  const greenscreenMemeCollection = useMemo(
    () => greenscreenMemeCollectionFromAssets(workspaceAssets.greenscreenMemes),
    [workspaceAssets.greenscreenMemes]
  )
  const visibleCollections = useMemo(
    () => [ugcAvatarVideoCollection, greenscreenMemeCollection, ...collections],
    [ugcAvatarVideoCollection, greenscreenMemeCollection, collections]
  )
  const selectedCollection =
    visibleCollections.find(
      (collection) => collection.id === selectedCollectionId
    ) ?? null
  const selectedSound =
    workspaceAssets.music.find((sound) => sound.id === selectedSoundId) ?? null
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
  const xRunsByAutomationId = useMemo(
    () =>
      xAutomationRuns.reduce<Record<string, XAutomationRun[]>>(
        (groups, run) => {
          groups[run.automationId] = [...(groups[run.automationId] ?? []), run]
          return groups
        },
        {}
      ),
    [xAutomationRuns]
  )

  useEffect(() => {
    const needsAssets =
      templateFolderOpen ||
      (view === "automations" &&
        Boolean(editingAutomation?.id) &&
        editingAutomation?.automationKind !== "x_threads")
    if (!needsAssets || workspaceAssetsLoaded) return
    let active = true
    void fetchJsonWithTimeout<{ assets?: RealFarmData["assets"] }>(
      "/api/media-library"
    )
      .then((payload) => {
        if (active && payload.assets) setWorkspaceAssets(payload.assets)
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setWorkspaceAssetsLoaded(true)
      })
    return () => {
      active = false
    }
  }, [
    editingAutomation?.automationKind,
    editingAutomation?.id,
    templateFolderOpen,
    view,
    workspaceAssetsLoaded,
  ])

  useEffect(() => {
    const needsCollections =
      view === "collections" || view === "automations" || templateFolderOpen
    if (!needsCollections || collectionsLoaded) return
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
      .finally(() => {
        if (active) setCollectionsLoaded(true)
      })

    return () => {
      active = false
    }
  }, [collectionsLoaded, templateFolderOpen, view])

  useEffect(() => {
    if (view !== "automations" || xAutomationsLoaded) return
    let active = true
    void Promise.all([
      fetchJsonWithTimeout<{ automations?: XAutomationRecord[] }>(
        "/api/x-automations"
      ),
      fetchJsonWithTimeout<{ runs?: XAutomationRun[] }>(
        "/api/x-automations/generate"
      ),
    ])
      .then(([automationPayload, runPayload]) => {
        if (!active) return
        const loadedAutomations = automationPayload.automations ?? []
        setXAutomations(loadedAutomations)
        setXAutomationRuns(runPayload.runs ?? [])
        const linked = loadedAutomations
          .map(xAutomationToAutomation)
          .find((automation) => automation.id === linkedAutomationId)
        if (linked) setEditingAutomation(linked)
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setXAutomationsLoaded(true)
      })
    return () => {
      active = false
    }
  }, [linkedAutomationId, view, xAutomationsLoaded])

  useEffect(() => {
    if (view !== "collections" || productCollectionsLoaded) return
    let active = true
    void fetchJsonWithTimeout<{ collections?: ProductCollection[] }>(
      "/api/product-collections"
    )
      .then((payload) => {
        if (active) setProductCollections(payload.collections ?? [])
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setProductCollectionsLoaded(true)
      })

    return () => {
      active = false
    }
  }, [productCollectionsLoaded, view])

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
        const linked = payload.automations.find(
          (automation) => automation.id === linkedAutomationId
        )
        if (linked) setEditingAutomation(linked)
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
      .finally(() => {
        if (active) setPersistedAutomationsLoaded(true)
      })

    return () => {
      active = false
    }
  }, [linkedAutomationId])

  useEffect(() => {
    let active = true
    const requestRevision = recentRunsRevisionRef.current
    void loadRecentAutomationRuns()
      .then((runs) => {
        if (active && requestRevision === recentRunsRevisionRef.current) {
          setRecentAutomationRuns(runs)
          setRecentRunsError("")
        }
      })
      .catch((error) => {
        if (active) {
          setRecentRunsError(
            getApiErrorMessage(error, "Failed to load recent generations")
          )
        }
      })
      .finally(() => {
        if (active) {
          setRecentRunsLoaded(true)
        }
      })

    return () => {
      active = false
    }
  }, [])

  async function persistCollection(collection: CreatedImageCollection) {
    if (collection.virtual) {
      return
    }
    await fetchJsonWithTimeout("/api/image-collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectionToStored(collection)),
    })
  }

  async function commitCollection(
    previous: CreatedImageCollection | null,
    next: CreatedImageCollection,
    failureMessage: string
  ) {
    setCollections((current) => [
      next,
      ...current.filter((collection) => collection.id !== next.id),
    ])
    try {
      await persistCollection(next)
      return true
    } catch (error) {
      setCollections((current) =>
        previous
          ? [
              previous,
              ...current.filter((collection) => collection.id !== previous.id),
            ]
          : current.filter((collection) => collection.id !== next.id)
      )
      toast.error(getApiErrorMessage(error, failureMessage))
      return false
    }
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
    recentRunsRevisionRef.current += 1
    setRecentAutomationRuns((current) =>
      [run, ...current.filter((item) => item.id !== run.id)].slice(0, 100)
    )
  }

  function removeRecentAutomationRun(runId: string) {
    recentRunsRevisionRef.current += 1
    setRecentAutomationRuns((current) =>
      current.filter((item) => item.id !== runId)
    )
  }

  async function deleteCollections(ids: string[]) {
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

    const storedCollections = persistedCollections.map(collectionToStored)
    try {
      await fetchJsonWithTimeout("/api/image-collections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        toastOnError: false,
        body: JSON.stringify({ collections: storedCollections }),
      })
      toast.success(
        `${persistedCollections.length} collection${persistedCollections.length === 1 ? "" : "s"} deleted`,
        {
          duration: 10_000,
          action: {
            label: "Undo",
            onClick: () => {
              void fetchJsonWithTimeout("/api/image-collections", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                toastOnError: false,
                body: JSON.stringify({
                  action: "restore",
                  collections: storedCollections,
                }),
              })
                .then(() => {
                  setCollections((current) => {
                    const currentIds = new Set(
                      current.map((collection) => collection.id)
                    )
                    return [
                      ...deletedCollections.filter(
                        (collection) => !currentIds.has(collection.id)
                      ),
                      ...current,
                    ]
                  })
                  toast.success("Collection deletion undone")
                })
                .catch((error) => toast.error(getApiErrorMessage(error)))
            },
          },
        }
      )
    } catch (error) {
      setCollections((current) => {
        const currentIds = new Set(current.map((collection) => collection.id))
        return [
          ...deletedCollections.filter(
            (collection) => !currentIds.has(collection.id)
          ),
          ...current,
        ]
      })
      toast.error(getApiErrorMessage(error))
      throw error
    }
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
      toast.error(getApiErrorMessage(error, "Failed to update automation"))
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
      toast.error(getApiErrorMessage(error, "Failed to delete automation"))
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
    if (automation.automationKind === "x_threads") {
      const engine = xAutomations.find((item) => item.id === automation.id)
      if (!engine) return
      const nextEngine = {
        ...engine,
        status:
          engine.status === "paused" ? ("live" as const) : ("paused" as const),
      }
      setXAutomations((items) =>
        items.map((item) => (item.id === engine.id ? nextEngine : item))
      )
      void fetchJsonWithTimeout<{ automation: XAutomationRecord }>(
        "/api/x-automations",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ automation: nextEngine }),
        }
      )
        .then(({ automation: savedAutomation }) => {
          setXAutomations((items) =>
            items.map((item) =>
              item.id === savedAutomation.id ? savedAutomation : item
            )
          )
        })
        .catch((error) => {
          setXAutomations((items) =>
            items.map((item) => (item.id === engine.id ? engine : item))
          )
          toast.error(
            getApiErrorMessage(error, "Failed to update automation status")
          )
        })
      return
    }
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

  function onSocialAccountDisconnected(integrationId: string) {
    const withoutDisconnected = (
      integrations: AutomationSocialIntegration[] | undefined
    ) =>
      (integrations ?? []).filter(
        (integration) => integration.integration_id !== integrationId
      )
    setAutomationConfigEdits((current) =>
      Object.fromEntries(
        Object.entries(current).map(([id, config]) => [
          id,
          {
            ...config,
            social_integrations: withoutDisconnected(
              config.social_integrations
            ),
          },
        ])
      )
    )
    const updateSummary = (automation: Automation) =>
      withSocialIntegrationSummary(
        automation,
        withoutDisconnected(automation.socialIntegrations)
      )
    setPersistedAutomations((current) => current.map(updateSummary))
    setCreatedAutomations((current) => current.map(updateSummary))
    setEditingAutomation((current) =>
      current ? updateSummary(current) : current
    )
    setSocialAccountAutomation((current) =>
      current ? updateSummary(current) : current
    )
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
      refreshRecentAutomationRuns()
    }
    setView(nextView)
  }

  function showAutomationList() {
    setEditingAutomation(null)
    setView("automations")
    refreshRecentAutomationRuns()
  }

  function refreshRecentAutomationRuns() {
    const requestRevision = recentRunsRevisionRef.current
    void loadRecentAutomationRuns()
      .then((runs) => {
        // A generation can finish while this request is in flight. Never let
        // that older server snapshot erase the run that was just inserted by
        // the editor; the next refresh will include the persisted record.
        if (requestRevision === recentRunsRevisionRef.current) {
          setRecentAutomationRuns(runs)
          setRecentRunsError("")
        }
      })
      .catch((error) => {
        setRecentRunsError(
          getApiErrorMessage(error, "Failed to load recent generations")
        )
      })
      .finally(() => setRecentRunsLoaded(true))
  }

  const fillsWorkspace = view === "automations" && Boolean(editingAutomation)

  return (
    <main className="relative h-svh overflow-hidden bg-[#f7f7fa] text-app-text">
      {view === "home" && !user.emailVerified ? (
        <EmailVerificationNotice />
      ) : null}
      <div className="flex h-svh">
        <Sidebar
          data={data}
          view={view}
          onViewChange={changeView}
          onNewAutomation={() => setTemplateFolderOpen(true)}
          onSettings={() => setSettingsOpen(true)}
        />
        {!fillsWorkspace ? (
          <MobileNavigation view={view} onViewChange={changeView} />
        ) : null}
        <section
          className={cn(
            "min-w-0 flex-1 overflow-y-auto pb-20 md:pb-0",
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
              generatedRunsLoading={!recentRunsLoaded}
              generatedRunsError={recentRunsError}
              onRetryGeneratedRuns={() => {
                setRecentRunsLoaded(false)
                refreshRecentAutomationRuns()
              }}
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
                    aspect_ratio: templateSource.aspect_ratio,
                    font: templateSource.font,
                    image_fit: templateSource.image_fit,
                    language: templateSource.language,
                    prompt_formatting: templateSource.prompt_formatting,
                    image_collection_ids: templateSource.image_collection_ids,
                    tone: templateSource.tone,
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
              onGenerationRunRemove={removeRecentAutomationRun}
            />
          )}
          {view === "schedule" && (
            <ContentCalendarView onGoAutomations={showAutomationList} />
          )}
          {view === "analytics" && <AnalyticsView />}
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
                  return commitCollection(
                    selectedCollection,
                    nextCollection,
                    "Failed to add images to the collection"
                  )
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
                  void commitCollection(
                    selectedCollection,
                    nextCollection,
                    "Failed to remove images from the collection"
                  )
                }}
                onUpdateCollection={(nextCollection) => {
                  if (selectedCollection.virtual) {
                    return
                  }
                  void commitCollection(
                    selectedCollection,
                    nextCollection,
                    "Failed to update the collection"
                  )
                }}
                onRename={(title) => {
                  if (selectedCollection.virtual) {
                    return
                  }
                  const nextCollection = { ...selectedCollection, title }
                  void commitCollection(
                    selectedCollection,
                    nextCollection,
                    "Failed to rename the collection"
                  )
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
                loading={!collectionsLoaded}
                onCreateCollection={(collection) => {
                  void commitCollection(
                    null,
                    collection,
                    "Failed to create the collection"
                  )
                }}
                onDeleteCollections={deleteCollections}
                onOpenCollection={setSelectedCollectionId}
                onToggleCollectionPin={toggleCollectionPin}
              />
            ))}
          {view === "automations" &&
            (editingAutomation ? (
              editingAutomation.automationKind === "x_threads" ? (
                <XAutomationStudio
                  key={editingAutomation.id}
                  initialAutomations={xAutomations.filter(
                    (item) => item.id === editingAutomation.id
                  )}
                  initialRuns={xAutomationRuns.filter(
                    (run) => run.automationId === editingAutomation.id
                  )}
                  embedded
                  onClose={() => {
                    setEditingAutomation(null)
                    void Promise.all([
                      fetchJsonWithTimeout<{
                        automations?: XAutomationRecord[]
                      }>("/api/x-automations"),
                      fetchJsonWithTimeout<{ runs?: XAutomationRun[] }>(
                        "/api/x-automations/generate"
                      ),
                    ])
                      .then(([automationPayload, runPayload]) => {
                        setXAutomations(automationPayload.automations ?? [])
                        setXAutomationRuns(runPayload.runs ?? [])
                      })
                      .catch(() => undefined)
                  }}
                />
              ) : (
                <AutomationSettingsDrawer
                  key={editingAutomation.id}
                  automation={editingAutomation}
                  initialRunId={linkedAutomationRunId || undefined}
                  config={mergeAutomationSchema(
                    editingAutomation,
                    automationConfigEdits[editingAutomation.id]
                  )}
                  collections={visibleCollections}
                  selectedSound={selectedSound}
                  music={workspaceAssets.music}
                  demoVideos={workspaceAssets.demoVideos}
                  onCreateCollection={(collection) => {
                    void commitCollection(
                      collections.find((item) => item.id === collection.id) ??
                        null,
                      collection,
                      "Failed to save the collection"
                    )
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
                      return {
                        ...current,
                        [editingAutomation.id]: renamedConfig,
                      }
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
                  onClose={() => {
                    setEditingAutomation(null)
                    refreshRecentAutomationRuns()
                  }}
                />
              )
            ) : (
              <AutomationsView
                automations={automations}
                automationsLoading={
                  !persistedAutomationsLoaded || !xAutomationsLoaded
                }
                recentRunsByAutomationId={recentRunsByAutomationId}
                recentRunsLoading={!recentRunsLoaded}
                onGenerationRunUpdate={(run) =>
                  upsertRecentAutomationRun(run as unknown as never)
                }
                xRunsByAutomationId={xRunsByAutomationId}
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
                onGenerationRunRemove={removeRecentAutomationRun}
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
          onSocialAccountDisconnected={onSocialAccountDisconnected}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      {templateFolderOpen && (
        <TemplateFolderModal
          templates={templateAutomations}
          collections={visibleCollections}
          recentRunsByAutomationId={showcaseRunsByAutomationId}
          onClose={() => setTemplateFolderOpen(false)}
          onCreateVideoTemplate={async ({ name, schema }) => {
            const automation = await createLocalAutomation({
              name,
              automationKind: "video",
              schema,
            })
            setTemplateFolderOpen(false)
            setView("automations")
            setEditingAutomation(automation)
          }}
          onCreateCollection={(collection) => {
            void commitCollection(
              collections.find((item) => item.id === collection.id) ?? null,
              collection,
              "Failed to save the collection"
            )
          }}
          onCreateBlank={(automationKind, platform) => {
            if (automationKind === "x_threads") {
              const selectedPlatform = platform === "threads" ? "threads" : "x"
              void fetch("/api/x-automations", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  name:
                    selectedPlatform === "threads"
                      ? "New Threads automation"
                      : "New X automation",
                  platform: selectedPlatform,
                }),
              })
                .then(async (response) => {
                  if (!response.ok)
                    throw new Error(
                      `Could not create ${selectedPlatform === "threads" ? "Threads" : "X"} automation`
                    )
                  return response.json() as Promise<{
                    automation: XAutomationRecord
                  }>
                })
                .then(({ automation }) => {
                  setXAutomations((items) => [automation, ...items])
                  setTemplateFolderOpen(false)
                  setView("automations")
                  setEditingAutomation({
                    id: automation.id,
                    name: automation.name,
                    automationKind: "x_threads",
                    platform: automation.platform,
                    status: automation.status,
                    account: "No social account",
                    handle: automation.platform === "threads" ? "Threads" : "X",
                    times: [],
                    favorite: false,
                    theme: "x_threads",
                    socialIntegrations: automation.publishing.integrations,
                    created_at: automation.createdAt,
                  })
                })
                .catch((error) => {
                  toast.error(
                    getApiErrorMessage(
                      error,
                      `Could not create ${selectedPlatform === "threads" ? "Threads" : "X"} automation`
                    )
                  )
                })
              return
            }
            void createLocalAutomation({ automationKind })
              .then((automation) => {
                setTemplateFolderOpen(false)
                setView("automations")
                setEditingAutomation(automation)
              })
              .catch((error) => {
                toast.error(
                  getApiErrorMessage(error, "Could not create automation")
                )
              })
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
                aspect_ratio: templateSource.aspect_ratio,
                font: templateSource.font,
                image_fit: templateSource.image_fit,
                language: templateSource.language,
                prompt_formatting: templateSource.prompt_formatting,
                image_collection_ids: templateSource.image_collection_ids,
                tone: templateSource.tone,
                formatting: templateSource.formatting,
                tiktok_post_settings: templateSource.tiktok_post_settings,
                web_search_enabled: templateSource.web_search_enabled,
                video_format: templateSource.video_format,
              },
            })
              .then((createdAutomation) => {
                setTemplateFolderOpen(false)
                setView("automations")
                setEditingAutomation(createdAutomation)
              })
              .catch((error) => {
                toast.error(
                  getApiErrorMessage(error, "Could not create automation")
                )
              })
          }}
        />
      )}
    </main>
  )
}

function EmailVerificationNotice() {
  useEffect(() => {
    const toastId = toast.warning("Verify your email", {
      id: "email-verification",
      duration: 8_000,
      action: {
        label: "Send email",
        onClick: () => {
          const pendingToastId = toast.loading("Sending verification email…")
          void fetchJsonWithTimeout<{
            alreadyVerified?: boolean
          }>("/api/auth/verification/resend", {
            method: "POST",
            toastOnError: false,
          })
            .then((payload) => {
              if (payload.alreadyVerified) {
                window.location.reload()
                return
              }
              toast.success("Verification email sent", {
                id: pendingToastId,
                description: "Check your inbox for the verification link.",
              })
            })
            .catch((error) => {
              toast.error("Couldn’t send the verification email", {
                id: pendingToastId,
                description: getApiErrorMessage(
                  error,
                  "Please try again in a moment."
                ),
              })
            })
        },
      },
    })

    return () => {
      toast.dismiss(toastId)
    }
  }, [])

  return null
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

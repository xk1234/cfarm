"use client"

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { toast } from "sonner"
import {
  mergeAutomationSchema,
  type AutomationSchedule,
  type AutomationSchema,
  type AutomationSocialIntegration,
  type AutomationStatus,
  type RuntimeAutomationTemplate,
} from "@/lib/realfarm-automation"
import type { Automation, RealFarmData } from "@/lib/realfarm-data"
import {
  xAutomationToAutomation,
  type XAutomationRecord,
  type XAutomationRun,
} from "@/lib/x-automation"
import type { AutomationRecord } from "@/lib/automations"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import { useCollectionsData } from "@/features/collections/ui/use-collections-data"
import { isSlideshowSocialProvider } from "@/lib/slideshow-social-platforms"
import { AppModal, AppModalPanel } from "@/components/ui/modal"
import type { InitialTemplateData } from "@/features/templates/domain/templates"
import { WorkspaceShell } from "@/features/workspace/ui/workspace-shell"

const TemplatesView = dynamic(() =>
  import("@/components/realfarm/automations-view").then(
    (module) => module.TemplatesView
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
const emptyInitialTemplateData: InitialTemplateData = {
  previewImages: {},
}

export function RealFarmWorkspace({
  data,
  initialTemplateData = emptyInitialTemplateData,
  initialNavigation,
}: {
  data: RealFarmData
  initialTemplateData?: InitialTemplateData
  initialNavigation?: {
    automationId?: string
    runId?: string
  }
}) {
  const [selectedSoundId] = useState("")
  const [workspaceAssets, setWorkspaceAssets] = useState(data.assets)
  const [workspaceAssetsLoaded, setWorkspaceAssetsLoaded] = useState(
    Object.values(data.assets).some((assets) => assets.length > 0)
  )
  const [createdAutomations, setCreatedAutomations] = useState<Automation[]>([])
  const [persistedAutomations, setPersistedAutomations] = useState<
    Automation[]
  >([])
  const [persistedAutomationsLoaded, setPersistedAutomationsLoaded] =
    useState(false)
  const [xAutomations, setXAutomations] = useState<XAutomationRecord[]>([])
  const [xAutomationsLoaded, setXAutomationsLoaded] = useState(false)
  const [xAutomationRuns, setXAutomationRuns] = useState<XAutomationRun[]>([])
  const [xAutomationRunsLoaded, setXAutomationRunsLoaded] = useState(false)
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
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(
    null
  )
  const linkedAutomationId = initialNavigation?.automationId?.trim() ?? ""
  const linkedAutomationRunId = initialNavigation?.runId?.trim() ?? ""
  const [socialAccountAutomation, setSocialAccountAutomation] =
    useState<Automation | null>(null)

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
  const { collections, visibleCollections, commitCollection } =
    useCollectionsData({
      assets: workspaceAssets,
      enabled: true,
    })
  const selectedSound =
    workspaceAssets.music.find((sound) => sound.id === selectedSoundId) ?? null
  const xTemplatesByAutomationId = useMemo(
    () =>
      Object.fromEntries(
        xAutomations.map((template) => [template.id, template])
      ),
    [xAutomations]
  )

  useEffect(() => {
    const needsAssets =
      Boolean(editingAutomation?.id) &&
      editingAutomation?.automationKind !== "x_threads"
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
    workspaceAssetsLoaded,
  ])

  useEffect(() => {
    if (xAutomationsLoaded) return
    let active = true
    void fetchJsonWithTimeout<{ templates?: XAutomationRecord[] }>(
      "/api/social-templates"
    )
      .then((automationPayload) => {
        if (!active) return
        const loadedAutomations = automationPayload.templates ?? []
        setXAutomations(loadedAutomations)
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
  }, [linkedAutomationId, xAutomationsLoaded])

  useEffect(() => {
    if (xAutomationRunsLoaded) return
    let active = true
    void fetchJsonWithTimeout<{ runs?: XAutomationRun[] }>(
      "/api/social-templates/generate"
    )
      .then((payload) => {
        if (active) setXAutomationRuns(payload.runs ?? [])
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setXAutomationRunsLoaded(true)
      })
    return () => {
      active = false
    }
  }, [xAutomationRunsLoaded])

  useEffect(() => {
    let active = true
    void fetchJsonWithTimeout<{
      templates?: Automation[]
      records?: AutomationRecord[]
    }>("/api/templates")
      .then((payload) => {
        if (!active || !payload?.templates) {
          return
        }
        setPersistedAutomations(payload.templates)
        const linked = payload.templates.find(
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

  function persistAutomationPatch(
    id: string,
    patch: {
      name?: string
      hidden?: boolean
      favorite?: boolean
      status?: AutomationStatus
      schema?: AutomationSchema
    }
  ) {
    void fetchJsonWithTimeout<{
      record: AutomationRecord
      template: Automation
    }>("/api/templates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
      toastOnError: false,
    })
      .then(({ template }) => {
        const mergeSummary = (item: Automation) =>
          item.id === template.id ? { ...item, ...template } : item
        setPersistedAutomations((current) => current.map(mergeSummary))
        setCreatedAutomations((current) => current.map(mergeSummary))
        setEditingAutomation((current) =>
          current?.id === template.id ? { ...current, ...template } : current
        )
      })
      .catch((error) => {
        toast.error(getApiErrorMessage(error, "Failed to update template"))
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

    void fetchJsonWithTimeout(`/api/templates/${encodeURIComponent(id)}`, {
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
      toast.error(getApiErrorMessage(error, "Failed to delete template"))
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
      template?: Automation
      record?: AutomationRecord
    }>("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        kind: input.automationKind,
        schema: input.schema,
        template: input.template,
        overrides: {
          ...input.overrides,
          status: input.overrides?.status ?? "paused",
        },
      }),
    })

    if (!payload.template || !payload.record) {
      throw new Error("Failed to create template")
    }

    return applyAutomationRecord(payload.record, payload.template)
  }

  const renderTemplatesView = () => (
    <TemplatesView
      automations={automations}
      automationsLoading={!persistedAutomationsLoaded || !xAutomationsLoaded}
      schemasByAutomationId={automationConfigEdits}
      previewImagesByAutomationId={initialTemplateData.previewImages}
      collections={visibleCollections}
      demoVideos={workspaceAssets.demoVideos}
      xTemplatesByAutomationId={xTemplatesByAutomationId}
      onCreateFromTone={async (fields) => {
        const automation = await createLocalAutomation({
          name: "Matched TikTok slideshow",
          schema: fields as AutomationSchema,
        })
        setEditingAutomation(automation)
      }}
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
      onToggleHidden={(automation) => {
        const hidden = !automation.hidden
        if (automation.automationKind === "x_threads") {
          const template = xAutomations.find(
            (item) => item.id === automation.id
          )
          if (!template) return
          const optimistic = { ...template, hidden }
          setXAutomations((current) =>
            current.map((item) => (item.id === template.id ? optimistic : item))
          )
          void fetchJsonWithTimeout<{ template: XAutomationRecord }>(
            "/api/social-templates",
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ template: optimistic }),
              toastOnError: false,
            }
          )
            .then(({ template: saved }) => {
              setXAutomations((current) =>
                current.map((item) => (item.id === saved.id ? saved : item))
              )
            })
            .catch((error) => {
              setXAutomations((current) =>
                current.map((item) =>
                  item.id === template.id ? template : item
                )
              )
              toast.error(
                getApiErrorMessage(error, "Failed to update template")
              )
            })
          return
        }
        setPersistedAutomations((current) =>
          current.map((item) =>
            item.id === automation.id ? { ...item, hidden } : item
          )
        )
        setCreatedAutomations((current) =>
          current.map((item) =>
            item.id === automation.id ? { ...item, hidden } : item
          )
        )
        persistAutomationPatch(automation.id, { hidden })
      }}
      onEdit={setEditingAutomation}
    />
  )

  return (
    <WorkspaceShell
      view="templates"
      ownerName={data.brand.owner ?? "LumenClip"}
      onSocialAccountDisconnected={onSocialAccountDisconnected}
    >
      {renderTemplatesView()}
      {editingAutomation ? (
        <AppModal
          className="p-2 sm:p-4"
          onClose={() => setEditingAutomation(null)}
        >
          <AppModalPanel
            accessibleTitle={`${editingAutomation.name} template editor`}
            className="h-[calc(100svh-1rem)] max-h-[900px] max-w-[1320px] overflow-hidden rounded-[12px] sm:h-[calc(100svh-2rem)]"
          >
            {editingAutomation.automationKind === "x_threads" ? (
              <XAutomationStudio
                key={editingAutomation.id}
                initialAutomations={xAutomations.filter(
                  (item) => item.id === editingAutomation.id
                )}
                initialRuns={xAutomationRuns.filter(
                  (run) => run.automationId === editingAutomation.id
                )}
                embedded
                modal
                onClose={() => {
                  setEditingAutomation(null)
                  void Promise.all([
                    fetchJsonWithTimeout<{
                      templates?: XAutomationRecord[]
                    }>("/api/social-templates"),
                    fetchJsonWithTimeout<{ runs?: XAutomationRun[] }>(
                      "/api/social-templates/generate"
                    ),
                  ])
                    .then(([automationPayload, runPayload]) => {
                      setXAutomations(automationPayload.templates ?? [])
                      setXAutomationRuns(runPayload.runs ?? [])
                    })
                    .catch(() => undefined)
                }}
              />
            ) : (
              <AutomationSettingsDrawer
                key={editingAutomation.id}
                modal
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
                    persistAutomationPatch(editingAutomation.id, {
                      name,
                      schema: nextConfig,
                    })
                    return {
                      ...current,
                      [editingAutomation.id]: nextConfig,
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
                    schema: sourceConfig,
                  })
                  setEditingAutomation(duplicated)
                }}
                onDelete={() => deleteAutomation(editingAutomation.id)}
                onClose={() => {
                  setEditingAutomation(null)
                }}
              />
            )}
          </AppModalPanel>
        </AppModal>
      ) : null}
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
    </WorkspaceShell>
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

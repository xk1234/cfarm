"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { DateTime } from "luxon"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
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
  IconUser,
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

import { EditorPopupMenu, EditorPopupOption } from "@/components/ui/editor-popup"
import { AnalyticsView, ContentCalendarView } from "@/components/realfarm/calendar-analytics"
import { AutomationSettingsDrawer } from "@/components/realfarm/automation-settings"
import { AutomationsView } from "@/components/realfarm/automations-view"
import {
  BuilderStep,
  CreatorBuilderPanel,
  CreatorPageShell,
  SoundSelector,
} from "@/components/realfarm/creator-ui"
import { GreenscreenMemesView } from "@/components/realfarm/greenscreen-view"
import { CollectionDetailView, CollectionsView } from "@/components/realfarm/collections-view"
import { CreatorsView, HomeView } from "@/components/realfarm/home-view"
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
  type AutomationSchema,
  type AutomationSlideCountMode,
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
import type {
  Automation,
  LocalAsset,
  RealFarmData,
} from "@/lib/realfarm-data"
import { defaultCharacterAttributes, normalizeCharacterAttributes, type Character } from "@/lib/character-model"
import type { CharacterPayload, CharacterRecord } from "@/lib/characters"
import type { PinterestSearchResult } from "@/lib/pinterest-search"
import { cn } from "@/lib/utils"

export function RealFarmWorkspace({ data }: { data: RealFarmData }) {
  const [view, setView] = useState<ViewKey>("home")
  const [selectedSoundId, setSelectedSoundId] = useState("")
  const [collections, setCollections] = useState<CreatedImageCollection[]>(() => defaultImageCollections(data))
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null)
  const [createdAutomations, setCreatedAutomations] = useState<Automation[]>([])
  const [automationNameEdits, setAutomationNameEdits] = useState<Record<string, string>>({})
  const [automationFavoriteEdits, setAutomationFavoriteEdits] = useState<Record<string, boolean>>({})
  const [automationFavoriteRanks, setAutomationFavoriteRanks] = useState<Record<string, number>>({})
  const [automationConfigEdits, setAutomationConfigEdits] = useState<Record<string, AutomationSchema>>({})
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null)
  const [templateFolderOpen, setTemplateFolderOpen] = useState(false)

  const automations = useMemo(
    () => [...createdAutomations, ...data.automations]
      .map((automation, index) => ({
        automation: {
          ...automation,
          name: automationNameEdits[automation.id] ?? automation.name,
          favorite: automationFavoriteEdits[automation.id] ?? automation.favorite,
        },
        index,
        favoriteRank: automationFavoriteRanks[automation.id] ?? 0,
      }))
      .sort((a, b) =>
        Number(b.automation.favorite) - Number(a.automation.favorite) ||
        b.favoriteRank - a.favoriteRank ||
        a.index - b.index
      )
      .map(({ automation }) => automation),
    [automationFavoriteEdits, automationFavoriteRanks, automationNameEdits, createdAutomations, data.automations]
  )
  const allImagesCollection = useMemo(() => allImagesCollectionFrom(collections), [collections])
  const visibleCollections = useMemo(() => [allImagesCollection, ...collections], [allImagesCollection, collections])
  const selectedCollection = visibleCollections.find((collection) => collection.id === selectedCollectionId) ?? null
  const backgroundCollection = collections.find((collection) => collection.id === data.defaultCollections.backgrounds.id)
  const selectedSound = data.assets.music.find((sound) => sound.id === selectedSoundId) ?? null

  useEffect(() => {
    let active = true
    void fetch("/api/image-collections")
      .then((response) => response.ok ? response.json() : null)
      .then((payload: { collections?: StoredImageCollection[] } | null) => {
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

  function persistCollection(collection: CreatedImageCollection) {
    if (collection.virtual) {
      return
    }
    void fetch("/api/image-collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectionToStored(collection)),
    }).catch(() => undefined)
  }

  function createDraft() {
    return undefined
  }

  return (
    <main className="min-h-svh bg-[#f6f6f2] text-[#242421]">
      <div className="flex min-h-svh">
        <Sidebar data={data} view={view} onViewChange={setView} onNewAutomation={() => setTemplateFolderOpen(true)} />
        <section className="min-w-0 flex-1 px-5 py-5 lg:px-7">
          {view === "home" && (
            <HomeView
              data={data}
              onCreate={() => setTemplateFolderOpen(true)}
              onAutomations={() => setView("automations")}
            />
          )}
          {view === "swipes" && <SwipesView />}
          {view === "creators" && <CreatorsView />}
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
              backgrounds={backgroundCollection?.images ?? data.defaultCollections.backgrounds.images}
              onCreate={createDraft}
            />
          )}
          {view === "schedule" && <ContentCalendarView onGoLibrary={() => setView("editor")} />}
          {view === "analytics" && <AnalyticsView />}
          {view === "editor" && (
            <EditorView
              data={data}
              collections={visibleCollections}
              selectedSound={selectedSound}
              music={data.assets.music}
              onSoundSelect={setSelectedSoundId}
              onCreate={createDraft}
            />
          )}
          {view === "collections" && (
            selectedCollection ? (
              <CollectionDetailView
                collection={selectedCollection}
                readonly={selectedCollection.virtual}
                onBack={() => setSelectedCollectionId(null)}
                onAddImages={(images) => {
                  if (selectedCollection.virtual) {
                    return
                  }
                  const nextCollection = { ...selectedCollection, images: [...images, ...selectedCollection.images] }
                  setCollections((current) =>
                    current.map((collection) =>
                      collection.id === selectedCollection.id ? nextCollection : collection
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
                    images: selectedCollection.images.filter((image) => !keys.includes(image.id || image.imageUrl)),
                  }
                  setCollections((current) =>
                    current.map((collection) => collection.id === selectedCollection.id ? nextCollection : collection)
                  )
                  persistCollection(nextCollection)
                }}
                onUpdateCollection={(nextCollection) => {
                  if (selectedCollection.virtual) {
                    return
                  }
                  setCollections((current) =>
                    current.map((collection) => collection.id === selectedCollection.id ? nextCollection : collection)
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
                      collection.id === selectedCollection.id ? nextCollection : collection
                    )
                  )
                  persistCollection(nextCollection)
                  setSelectedCollectionId(selectedCollection.id)
                }}
                onCreateAutomation={(name) => {
                  setCreatedAutomations((current) => [
                    {
                      id: `auto-local-${Date.now()}`,
                      name,
                      status: "Live",
                      account: "No TikTok account",
                      handle: "Click to add account",
                      times: ["8:04 AM"],
                      favorite: false,
                      theme: "empty",
                    },
                    ...current,
                  ])
                  setView("automations")
                  setSelectedCollectionId(null)
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
                  setCollections((current) => current.filter((collection) => !ids.includes(collection.id)))
                }}
                onOpenCollection={setSelectedCollectionId}
              />
            )
          )}
          {view === "automations" && (
            <AutomationsView
              automations={automations}
              onCreateNew={() => setTemplateFolderOpen(true)}
              onRename={(automation, name) => {
                setAutomationNameEdits((current) => ({ ...current, [automation.id]: name }))
                setCreatedAutomations((current) =>
                  current.map((item) => item.id === automation.id ? { ...item, name } : item)
                )
              }}
              onToggleFavorite={(automation) => {
                const nextFavorite = !(automationFavoriteEdits[automation.id] ?? automation.favorite)
                setAutomationFavoriteEdits((current) => ({ ...current, [automation.id]: nextFavorite }))
                setAutomationFavoriteRanks((current) => ({ ...current, [automation.id]: nextFavorite ? Date.now() : 0 }))
                setCreatedAutomations((current) =>
                  current.map((item) => item.id === automation.id ? { ...item, favorite: nextFavorite } : item)
                )
              }}
              onEdit={setEditingAutomation}
            />
          )}
        </section>
      </div>
      {editingAutomation && (
        <AutomationSettingsDrawer
          automation={editingAutomation}
          config={mergeAutomationSchema(editingAutomation, automationConfigEdits[editingAutomation.id])}
          onRename={(name) => {
            setAutomationNameEdits((current) => ({ ...current, [editingAutomation.id]: name }))
            setAutomationConfigEdits((current) => {
              const nextConfig = mergeAutomationSchema(editingAutomation, current[editingAutomation.id])
              return { ...current, [editingAutomation.id]: { ...nextConfig, title: name } }
            })
            setCreatedAutomations((current) =>
              current.map((automation) => automation.id === editingAutomation.id ? { ...automation, name } : automation)
            )
            setEditingAutomation((current) => current ? { ...current, name } : current)
          }}
          onConfigChange={(config) => {
            setAutomationConfigEdits((current) => ({ ...current, [editingAutomation.id]: config }))
          }}
          onClose={() => setEditingAutomation(null)}
        />
      )}
      {templateFolderOpen && (
        <TemplateFolderModal
          data={data}
          onClose={() => setTemplateFolderOpen(false)}
          onCreateBlank={() => {
            setTemplateFolderOpen(false)
            setView("editor")
          }}
          onUseTemplate={(automation) => {
            setCreatedAutomations((current) => [
              {
                ...automation,
                id: `auto-template-${Date.now()}`,
                name: automation.name,
              },
              ...current,
            ])
            setTemplateFolderOpen(false)
            setView("editor")
          }}
        />
      )}
    </main>
  )
}


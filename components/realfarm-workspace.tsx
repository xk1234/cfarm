"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import {
  MobileNavigation,
  Sidebar,
  type ViewKey,
} from "@/components/realfarm/navigation"
import {
  renderHref,
  workspaceLocationFromUrl,
  workspaceViewHref,
} from "@/components/realfarm/workspace-navigation"
import type { WorkspaceSettingsTab } from "@/components/realfarm/user-settings-modal"
import type { RealFarmData } from "@/lib/realfarm-data"
import { useCollectionsData } from "@/components/realfarm/collections/use-collections-data"
import { storedCollectionId } from "@/lib/realfarm-collections"

const RendersView = dynamic(() =>
  import("@/components/render/renders-view").then((module) => module.RendersView)
)
const NewRenderView = dynamic(() =>
  import("@/components/render/new-render-view").then(
    (module) => module.NewRenderView
  )
)
const RenderDetailView = dynamic(() =>
  import("@/components/render/render-detail-view").then(
    (module) => module.RenderDetailView
  )
)
const ContentCalendarView = dynamic(() =>
  import("@/components/realfarm/content-calendar/content-calendar-view").then(
    (module) => module.ContentCalendarView
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
const UserSettingsModal = dynamic(() =>
  import("@/components/realfarm/user-settings-modal").then(
    (module) => module.UserSettingsModal
  )
)

export function RealFarmWorkspace({
  data,
  initialNavigation,
}: {
  data: RealFarmData
  initialNavigation?: {
    view?: ViewKey
    collectionId?: string
    renderId?: string
  }
}) {
  const [view, setView] = useState<ViewKey>(
    initialNavigation?.view === "render" && !initialNavigation.renderId
      ? "home"
      : (initialNavigation?.view ?? "home")
  )
  const [selectedCollectionId, setSelectedCollectionId] = useState(
    initialNavigation?.collectionId ?? null
  )
  const [selectedRenderId, setSelectedRenderId] = useState(
    initialNavigation?.renderId ?? null
  )
  const [settingsTab, setSettingsTab] = useState<WorkspaceSettingsTab | null>(
    null
  )
  const {
    visibleCollections,
    collectionsLoaded,
    commitCollection,
    deleteCollections,
    toggleCollectionPin,
  } = useCollectionsData({ enabled: view === "collections" })
  const selectedCollection =
    visibleCollections.find(
      (collection) => collection.id === selectedCollectionId
    ) ?? null

  useEffect(() => {
    function restoreWorkspaceLocation() {
      const location = workspaceLocationFromUrl(
        window.location.pathname,
        window.location.search
      )
      setView(location.view)
      setSelectedCollectionId(location.collectionId ?? null)
      setSelectedRenderId(location.renderId ?? null)
    }

    window.addEventListener("popstate", restoreWorkspaceLocation)
    return () =>
      window.removeEventListener("popstate", restoreWorkspaceLocation)
  }, [])

  function changeView(nextView: ViewKey) {
    if (nextView === "collections") setSelectedCollectionId(null)
    setView(nextView)
    pushWorkspaceUrl(workspaceViewHref(nextView))
  }

  function showRender(renderId: string) {
    setSelectedRenderId(renderId)
    setView("render")
    pushWorkspaceUrl(renderHref(renderId))
  }

  function showCollection(collectionId: string | null) {
    setSelectedCollectionId(collectionId)
    setView("collections")
    pushWorkspaceUrl(
      collectionId
        ? `/app/collections/${encodeURIComponent(collectionId)}`
        : workspaceViewHref("collections")
    )
  }

  function openSettings(tab: WorkspaceSettingsTab = "api-keys") {
    setSettingsTab(tab)
  }

  return (
    <main className="relative h-svh overflow-hidden bg-[#f7f7fa] text-app-text">
      <div className="flex h-svh">
        <Sidebar
          data={data}
          view={view}
          onViewChange={changeView}
          onSettings={() => openSettings()}
          onOpenRender={showRender}
        />
        <MobileNavigation
          view={view}
          onViewChange={changeView}
          onSettings={() => openSettings()}
          onOpenRender={showRender}
        />
        <section className="min-w-0 flex-1 overflow-y-auto px-4 pt-[4.5rem] pb-4 sm:px-5 sm:pt-[4.75rem] sm:pb-5 md:py-5 lg:px-7">
          {view === "home" && (
            <RendersView
              onNewRender={() => changeView("new")}
              onOpenRender={showRender}
            />
          )}
          {view === "new" && <NewRenderView onRendered={showRender} />}
          {view === "render" && selectedRenderId ? (
            <RenderDetailView
              key={selectedRenderId}
              renderId={selectedRenderId}
              onBack={() => changeView("home")}
              onOpenSettings={() => openSettings("socialbu")}
            />
          ) : null}
          {view === "schedule" && (
            <ContentCalendarView onOpenRender={showRender} />
          )}
          {view === "collections" &&
            (selectedCollection ? (
              <CollectionDetailView
                collection={selectedCollection}
                readonly={selectedCollection.virtual}
                onBack={() => showCollection(null)}
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
                  // The client id is the name slug (as the server list
                  // derives it), so a rename moves the collection's URL too.
                  const nextCollection = {
                    ...selectedCollection,
                    id: storedCollectionId({ name: title }),
                    title,
                  }
                  setSelectedCollectionId(nextCollection.id)
                  replaceWorkspaceUrl(
                    `/app/collections/${encodeURIComponent(nextCollection.id)}`
                  )
                  void commitCollection(
                    selectedCollection,
                    nextCollection,
                    "Failed to rename the collection"
                  ).then((saved) => {
                    if (saved) return
                    setSelectedCollectionId(selectedCollection.id)
                    replaceWorkspaceUrl(
                      `/app/collections/${encodeURIComponent(selectedCollection.id)}`
                    )
                  })
                }}
              />
            ) : (
              <CollectionsView
                collections={visibleCollections}
                loading={!collectionsLoaded}
                onCreateCollection={(collection) => {
                  void commitCollection(
                    null,
                    collection,
                    "Failed to create the collection"
                  )
                }}
                onDeleteCollections={deleteCollections}
                onOpenCollection={(id) => showCollection(id)}
                onToggleCollectionPin={toggleCollectionPin}
              />
            ))}
        </section>
      </div>
      {settingsTab ? (
        <UserSettingsModal
          initialTab={settingsTab}
          onClose={() => setSettingsTab(null)}
        />
      ) : null}
    </main>
  )
}

function replaceWorkspaceUrl(href: string) {
  window.history.replaceState(null, "", href)
}

function pushWorkspaceUrl(href: string) {
  const current = `${window.location.pathname}${window.location.search}`
  if (current !== href) window.history.pushState(null, "", href)
}

"use client"

import { useRef, useState } from "react"
import type * as React from "react"
import { IconSearch } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { SelectControl, SwitchPillButton } from "@/components/ui/form-controls"
import { Spinner } from "@/components/ui/spinner"
import {
  AppModal,
  AppModalCloseButton,
  AppModalPanel,
} from "@/components/ui/modal"
import { thumbTone } from "@/components/realfarm/shared-media"
import {
  collectionToStored,
  storedToCollection,
  type CreatedImageCollection,
  type PinterestCollectionCreatePayload,
  type StoredImageCollection,
} from "@/lib/realfarm-collections"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import {
  isPinterestBoardUrl,
  type PinterestSearchResult,
} from "@/lib/pinterest-search"
import { cn } from "@/lib/utils"

export function PinterestCollectionSearch({
  onCancel,
  onCreateCollection,
}: {
  onCancel: () => void
  onCreateCollection: (collection: CreatedImageCollection) => void
}) {
  const [query, setQuery] = useState("")
  const [searchedQuery, setSearchedQuery] = useState("")
  const [results, setResults] = useState<PinterestSearchResult[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [limit, setLimit] = useState(20)
  const [searchSource, setSearchSource] = useState<"pinterest" | "pexels">(
    "pinterest"
  )
  const [source, setSource] = useState<
    "pinterest" | "pexels" | "fallback" | "pexels-fallback" | "empty"
  >("fallback")
  const [searchStatus, setSearchStatus] = useState<
    "idle" | "searching" | "loadingMore"
  >("idle")
  const [creatingCollection, setCreatingCollection] = useState(false)
  const [autoCaption, setAutoCaption] = useState(true)
  const [showImageLabels, setShowImageLabels] = useState(true)
  const [recentSearches, setRecentSearches] = useState<string[]>(() =>
    readRecentPinterestSearches()
  )
  const createControllerRef = useRef<AbortController | null>(null)

  function cancel() {
    createControllerRef.current?.abort()
    createControllerRef.current = null
    toast.dismiss("pinterest-auto-caption")
    onCancel()
  }

  async function search(nextLimit = 20, queryOverride = query) {
    const trimmedQuery = queryOverride.trim()
    if (!trimmedQuery) {
      return
    }

    setSearchStatus(
      nextLimit > limit && results.length > 0 ? "loadingMore" : "searching"
    )
    setSearchedQuery(trimmedQuery)
    setLimit(nextLimit)

    try {
      const payload = await fetchJsonWithTimeout<{
        source?: "pinterest" | "pexels" | "fallback" | "pexels-fallback"
        results?: PinterestSearchResult[]
      }>(`/api/${searchSource}/search?limit=${nextLimit}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify([{ query: trimmedQuery, apiKey: "", trim: true }]),
        toastOnError: false,
      })

      setResults(payload.results ?? [])
      setSource(payload.source ?? "fallback")
      saveRecentPinterestSearch(trimmedQuery)
      setSearchStatus("idle")
    } catch (searchError) {
      toast.error(
        getApiErrorMessage(
          searchError,
          `${searchLabel(searchSource)} search failed`
        )
      )
      setSearchStatus("idle")
    }
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const formQuery = String(formData.get("query") ?? "")
    setSelectedIds(new Set())
    setQuery(formQuery)
    void search(20, formQuery)
  }

  function loadMore() {
    void search(limit + 20)
  }

  function saveRecentPinterestSearch(value: string) {
    const next = [
      value,
      ...recentSearches.filter((item) => item !== value),
    ].slice(0, 6)
    setRecentSearches(next)
    window.localStorage.setItem(
      "reelfarm:pinterest-recent",
      JSON.stringify(next)
    )
  }

  function toggleResult(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectedResults = results.filter((result) => selectedIds.has(result.id))
  const canCreate = selectedResults.length > 0
  const loadingMore = searchStatus === "loadingMore"
  const searching = searchStatus === "searching"
  const searchBusy = searchStatus !== "idle"
  const isBoardQuery =
    searchSource === "pinterest" && isPinterestBoardUrl(query)

  async function createCollection() {
    if (!canCreate) {
      return
    }

    setCreatingCollection(true)
    const controller = new AbortController()
    createControllerRef.current = controller
    const collectionInput = searchedQuery || query.trim()
    const collectionName = pinterestCollectionTitle(
      collectionInput,
      searchSource === "pexels"
        ? "pexels"
        : isPinterestBoardUrl(collectionInput)
          ? "board"
          : "search"
    )
    const createdAt = new Date().toISOString()
    const createPayload: PinterestCollectionCreatePayload = {
      image_urls: selectedResults
        .map((result) => result.imageUrl)
        .filter(Boolean),
      user_id: "103073708745629128582",
      collection_name: collectionName,
      auto_caption: autoCaption,
    }

    try {
      toast.loading(
        autoCaption
          ? `Importing and captioning ${selectedResults.length} images...`
          : `Importing ${selectedResults.length} images...`,
        { id: "pinterest-auto-caption" }
      )
      const collection = await importSelectedImages({
        collectionName,
        collectionCreatedAt: createdAt,
        selectedResults,
        source,
        payload: createPayload,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      onCreateCollection(
        autoCaption
          ? await captionCollection(collection, controller.signal)
          : collection
      )
      if (controller.signal.aborted) return
      if (autoCaption) {
        toast.success("Image captions ready", { id: "pinterest-auto-caption" })
      } else {
        toast.success("Image collection imported", {
          id: "pinterest-auto-caption",
        })
      }
    } catch (captionError) {
      if (controller.signal.aborted) return
      toast.dismiss("pinterest-auto-caption")
      toast.error(
        getApiErrorMessage(
          captionError,
          autoCaption ? "Auto-caption failed" : "Image import failed"
        )
      )
    } finally {
      if (createControllerRef.current === controller) {
        createControllerRef.current = null
        setCreatingCollection(false)
      }
    }
  }

  return (
    <AppModal className="bg-[#24251f]/50" onClose={cancel}>
      <AppModalPanel
        accessibleTitle="Search for collection images"
        className="relative flex max-h-[78vh] max-w-[640px] flex-col rounded-[10px]"
      >
        <AppModalCloseButton
          className="absolute top-3 right-3 z-10"
          onClick={cancel}
          ariaLabel="Close Pinterest search"
        />
        <div className="border-b border-app-panel-border p-4 pb-3">
          <form
            className="flex items-center gap-2 rounded-[9px] bg-app-surface pr-9"
            onSubmit={submitSearch}
          >
            <IconSearch className="size-5 shrink-0 text-app-text-faint" />
            <input
              className="h-10 min-w-0 flex-1 bg-transparent text-[18px] font-medium outline-none placeholder:text-app-muted-text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              name="query"
              placeholder={
                searchSource === "pexels"
                  ? "Search Pexels..."
                  : "Search Pinterest or paste a board URL..."
              }
              autoFocus
            />
            <SelectControl
              value={searchSource}
              onChange={(event) => {
                const nextSource =
                  event.target.value === "pexels" ? "pexels" : "pinterest"
                setSearchSource(nextSource)
                setResults([])
                setSelectedIds(new Set())
                setSearchedQuery("")
                setSource(
                  nextSource === "pexels" ? "pexels-fallback" : "fallback"
                )
              }}
              aria-label="Image search source"
            >
              <option value="pinterest">Pinterest</option>
              <option value="pexels">Pexels</option>
            </SelectControl>
            <Button
              type="submit"

              disabled={searchBusy || creatingCollection || !query.trim()}
            >
              {searching
                ? isBoardQuery
                  ? "Importing"
                  : "Searching"
                : isBoardQuery
                  ? "Import Board"
                  : "Search"}
            </Button>
          </form>
        </div>
        <div className="mt-3 flex min-h-6 flex-wrap items-center justify-between gap-3 px-4 text-[12px] text-app-muted-text">
          <div className="flex flex-wrap items-center gap-3">
            {results.length > 0 && <span>{results.length} results loaded</span>}
            {(source === "fallback" || source === "pexels-fallback") &&
              results.length > 0 && <span>Showing local preview results</span>}
          </div>
          {results.length > 0 ? (
            <label className="flex items-center gap-2 font-semibold text-app-text-soft">
              <SwitchPillButton
                enabled={showImageLabels}
                onClick={() => setShowImageLabels((current) => !current)}
                aria-label="Toggle image labels"
              />
              Image labels
            </label>
          ) : null}
        </div>
        {results.length === 0 && !searchBusy ? (
          <div className="min-h-[250px] px-5 pt-2 pb-8">
            <div className="mb-3 text-[12px] font-semibold">Most recent</div>
            {recentSearches.length > 0 ? (
              <div className="grid gap-3 text-[13px] text-app-text-soft">
                {recentSearches.map((suggestion) => (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    key={suggestion}
                    className="justify-start px-2 text-left"
                    onClick={() => {
                      setQuery(suggestion)
                    }}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            ) : (
              <div className="text-[13px] font-medium text-app-text-faint">
                No recent searches yet
              </div>
            )}
          </div>
        ) : (
          <div className="min-h-0 overflow-y-auto px-3 py-3">
            <div className="columns-3 gap-2 sm:columns-4">
              {results.map((result, index) => (
                <PinterestResultCard
                  key={result.id}
                  result={result}
                  index={index}
                  selected={selectedIds.has(result.id)}
                  showLabel={showImageLabels}
                  onClick={() => toggleResult(result.id)}
                />
              ))}
            </div>
            {searching && results.length === 0 && (
              <PinterestResultSkeletonGrid />
            )}
            {results.length > 0 && (
              <div className="flex justify-center py-4">
                <Button
                  variant="softControl"
                  size="appDefault"
                  onClick={loadMore}
                  disabled={searchBusy || creatingCollection}
                >
                  {loadingMore ? (
                    <>
                      <Spinner
                        size={14}
                        color="currentColor"
                        className="mr-2"
                      />
                      Loading
                    </>
                  ) : (
                    "Load More"
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
        <div className="mt-auto flex items-center justify-between border-t border-app-panel-border px-5 py-4 text-[12px] font-medium">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="compact"
              onClick={cancel}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="compact"
              onClick={() =>
                setSelectedIds(new Set(results.map((result) => result.id)))
              }
              disabled={results.length === 0}
            >
              Select All
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="compact"
              onClick={() => setSelectedIds(new Set())}
              disabled={selectedIds.size === 0}
            >
              Clear
            </Button>
            <label className="flex items-center gap-2 text-app-muted-text">
              <SwitchPillButton
                enabled={autoCaption}
                onClick={() => setAutoCaption((current) => !current)}
                aria-label="Toggle auto caption"
              />
              Auto-caption
            </label>
          </div>
          {results.length > 0 ? (
            <div className="flex items-center gap-3">
              <Button
                variant="action"
                size="appDefault"

                disabled={!canCreate || creatingCollection}
                onClick={() => void createCollection()}
              >
                {creatingCollection
                  ? autoCaption
                    ? "Captioning..."
                    : "Adding..."
                  : `Add ${selectedResults.length} images`}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="action"
              size="appDefault"

              onClick={() => void search(20)}
              disabled={!query.trim() || searchBusy || creatingCollection}
            >
              Search
            </Button>
          )}
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

function PinterestResultCard({
  result,
  index,
  selected,
  showLabel,
  onClick,
}: {
  result: PinterestSearchResult
  index: number
  selected: boolean
  showLabel: boolean
  onClick: () => void
}) {
  const width = result.width && result.width > 0 ? result.width : 736
  const height = result.height && result.height > 0 ? result.height : 980

  return (
    <button
      className="group mb-2 inline-block w-full break-inside-avoid text-left"
      onClick={onClick}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-[6px] border-2 bg-[#d9d8d0] transition",
          selected
            ? "border-[#32d982]"
            : "border-white group-hover:border-app-panel-border",
          !result.imageUrl && thumbTone("pinterest", index)
        )}
        style={
          result.imageUrl
            ? {
                backgroundImage: `url(${result.imageUrl})`,
                backgroundPosition: "center",
                backgroundSize: "contain",
                backgroundRepeat: "no-repeat",
                backgroundColor: result.dominantColor,
                aspectRatio: `${width} / ${height}`,
              }
            : {
                aspectRatio: `${width} / ${height}`,
              }
        }
      >
        <span
          className={cn(
            "absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full text-[12px] font-bold",
            selected
              ? "bg-[#32d982] text-white"
              : "bg-app-surface text-[#55544e]"
          )}
        >
          {selected ? "✓" : "+"}
        </span>
        {showLabel ? (
          <div className="absolute inset-x-1.5 bottom-1.5 rounded bg-black/35 p-1.5 text-[10px] leading-tight font-semibold text-white">
            {result.title}
          </div>
        ) : null}
      </div>
    </button>
  )
}

function PinterestResultSkeletonGrid() {
  return (
    <div className="columns-3 gap-2 sm:columns-4">
      {Array.from({ length: 16 }, (_, index) => (
        <div
          key={index}
          className="mb-2 inline-block w-full break-inside-avoid overflow-hidden rounded-[6px] border-2 border-white bg-[#e7e6df]"
          style={{
            aspectRatio:
              index % 5 === 0
                ? "4 / 5.6"
                : index % 3 === 0
                  ? "4 / 6.2"
                  : "4 / 5",
          }}
        >
          <div className="h-full w-full animate-pulse bg-gradient-to-r from-[#e2e1da] via-[#f1f0eb] to-[#e2e1da]" />
        </div>
      ))}
    </div>
  )
}

function readRecentPinterestSearches() {
  if (typeof window === "undefined") {
    return []
  }

  const storedSearches = window.localStorage.getItem(
    "reelfarm:pinterest-recent"
  )
  if (!storedSearches) {
    return []
  }

  try {
    const parsed = JSON.parse(storedSearches) as unknown
    return Array.isArray(parsed)
      ? parsed
          .filter((item): item is string => typeof item === "string")
          .slice(0, 6)
      : []
  } catch {
    return []
  }
}

async function captionCollection(
  collection: CreatedImageCollection,
  signal?: AbortSignal
) {
  const payload = await fetchJsonWithTimeout<{
    collection?: StoredImageCollection
  }>("/api/image-collections/captions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(collectionToStored(collection)),
    timeoutMs: 180_000,
    toastOnError: false,
    signal,
  })
  if (!payload.collection) {
    throw new Error("Auto-caption failed")
  }

  const captioned = storedToCollection(payload.collection)
  return {
    ...collection,
    title: captioned.title,
    createdAt: captioned.createdAt,
    images: collection.images.map((image, index) => ({
      ...image,
      description:
        payload.collection?.images[index]?.caption ?? image.description,
    })),
  }
}

async function importSelectedImages(input: {
  collectionName: string
  collectionCreatedAt: string
  selectedResults: PinterestSearchResult[]
  source: CreatedImageCollection["source"]
  payload: PinterestCollectionCreatePayload
  signal?: AbortSignal
}) {
  const payload = await fetchJsonWithTimeout<{
    collection?: StoredImageCollection
  }>("/api/image-collections/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      collectionName: input.collectionName,
      collectionCreatedAt: input.collectionCreatedAt,
      images: input.selectedResults
        .filter((result) => result.imageUrl)
        .map((result) => ({
          url: result.imageUrl,
          caption: result.description || result.title,
          sourceUrl: result.sourceUrl || result.imageUrl,
        })),
    }),
    timeoutMs: 180_000,
    toastOnError: false,
    signal: input.signal,
  })
  if (!payload.collection) {
    throw new Error("Image import failed")
  }

  return {
    ...storedToCollection(payload.collection),
    source: input.source,
    payload: input.payload,
  }
}

function searchLabel(source: "pinterest" | "pexels") {
  return source === "pexels" ? "Pexels" : "Pinterest"
}

function pinterestCollectionTitle(
  input: string,
  mode: "search" | "board" | "pexels"
) {
  const trimmed = input.trim()
  if (mode === "pexels") {
    return `Pexels - ${trimmed || "search"}`
  }
  if (mode !== "board") {
    return `Pinterest - ${trimmed || "search"}`
  }

  try {
    const url = new URL(trimmed)
    const parts = url.pathname.split("/").filter(Boolean)
    return `Pinterest - ${parts.at(-1)?.replace(/[-_]+/g, " ") || "Imported board"}`
  } catch {
    return `Pinterest - ${trimmed || "Imported board"}`
  }
}

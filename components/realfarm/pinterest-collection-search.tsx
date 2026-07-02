"use client"

import { useState } from "react"
import type * as React from "react"
import { IconChevronRight, IconSearch, IconX } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { PinterestPreviewTile, thumbTone } from "@/components/realfarm/shared-media"
import type { CreatedImageCollection, PinterestCollectionCreatePayload } from "@/lib/realfarm-collections"
import type { PinterestSearchResult } from "@/lib/pinterest-search"
import { cn } from "@/lib/utils"

export function PinterestCollectionSearch({
  onCancel,
  onCreateCollection,
}: {
  onCancel: () => void
  onCreateCollection: (collection: CreatedImageCollection) => void
}) {
  const [mode, setMode] = useState<"search" | "board">("search")
  const [query, setQuery] = useState("")
  const [searchedQuery, setSearchedQuery] = useState("")
  const [results, setResults] = useState<PinterestSearchResult[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [limit, setLimit] = useState(20)
  const [source, setSource] = useState<"pinterest" | "fallback" | "empty">("fallback")
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle")
  const [error, setError] = useState("")
  const [autoCaption, setAutoCaption] = useState(true)
  const [recentSearches, setRecentSearches] = useState<string[]>(() => readRecentPinterestSearches())

  async function search(nextLimit = 20, queryOverride = query) {
    const trimmedQuery = queryOverride.trim()
    if (!trimmedQuery) {
      return
    }

    setStatus("loading")
    setError("")
    setSearchedQuery(trimmedQuery)
    setLimit(nextLimit)

    try {
      const response = await fetch(`/api/pinterest/search?limit=${nextLimit}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify([{ query: trimmedQuery, apiKey: "", trim: true, mode }]),
      })
      const payload = (await response.json()) as {
        source?: "pinterest" | "fallback"
        results?: PinterestSearchResult[]
        error?: string
      }

      if (!response.ok) {
        throw new Error(payload.error ?? "Pinterest search failed")
      }

      setResults(payload.results ?? [])
      setSource(payload.source ?? "fallback")
      saveRecentPinterestSearch(trimmedQuery)
      setStatus("idle")
    } catch (searchError) {
      setStatus("error")
      setError(searchError instanceof Error ? searchError.message : "Pinterest search failed")
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
    const next = [value, ...recentSearches.filter((item) => item !== value)].slice(0, 6)
    setRecentSearches(next)
    window.localStorage.setItem("reelfarm:pinterest-recent", JSON.stringify(next))
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

  function createCollection() {
    if (!canCreate) {
      return
    }

    const collectionName = pinterestCollectionTitle(searchedQuery || query.trim(), mode)
    const createPayload: PinterestCollectionCreatePayload = {
      image_urls: selectedResults.map((result) => result.imageUrl).filter(Boolean),
      user_id: "103073708745629128582",
      collection_name: collectionName,
      auto_caption: autoCaption,
    }

    onCreateCollection({
      id: `collection-${Date.now()}`,
      title: collectionName,
      images: selectedResults,
      createdAt: new Date().toISOString(),
      source,
      payload: createPayload,
    })
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#24251f]/50 p-4">
      <section className="relative flex max-h-[78vh] w-full max-w-[640px] flex-col overflow-hidden rounded-[10px] bg-white shadow-2xl">
        <button
          className="absolute right-3 top-3 z-10 grid size-8 place-items-center rounded-full text-[#8c8b84] hover:bg-[#f1f0eb] hover:text-[#242421]"
          onClick={onCancel}
          aria-label="Close Pinterest search"
        >
          <IconX className="size-4" />
        </button>
        <div className="border-b border-[#ecebe4] p-4 pb-3">
          <form className="flex items-center gap-2 rounded-[9px] bg-white pr-9" onSubmit={submitSearch}>
            <IconSearch className="size-5 shrink-0 text-[#9a9991]" />
            <input
              className="h-10 min-w-0 flex-1 bg-transparent text-[18px] font-medium outline-none placeholder:text-[#77766f]"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              name="query"
              placeholder={mode === "board" ? "Paste Pinterest board URL..." : "Search Pinterest..."}
              autoFocus
            />
            <Button
              type="button"
              variant="outline"
              className="h-9 min-w-[112px] justify-between gap-2 rounded-[7px] bg-white px-3 text-[13px] font-semibold text-[#34332f]"
              onClick={() => {
                setMode((current) => current === "search" ? "board" : "search")
                setQuery("")
                setResults([])
                setSelectedIds(new Set())
                setSearchedQuery("")
              }}
            >
              <span>{mode === "board" ? "Use Search" : "Import Board"}</span>
              <IconChevronRight className={cn("size-4 text-[#77766f]", mode === "board" ? "-rotate-90" : "rotate-90")} />
            </Button>
            <Button
              type="submit"
              className="h-9 rounded-[8px] bg-[#aeadad] px-5 text-[13px] font-semibold text-white hover:bg-[#989796] disabled:bg-[#c8c7c2]"
              disabled={status === "loading" || !query.trim()}
            >
              {status === "loading" ? (mode === "board" ? "Importing" : "Searching") : mode === "board" ? "Import Board" : "Search"}
            </Button>
          </form>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 px-4 text-[12px] text-[#77766f]">
          {results.length > 0 && <span>{results.length} results loaded</span>}
          {source === "fallback" && results.length > 0 && <span>Showing local preview results</span>}
        </div>
        {status === "error" && (
          <div className="mt-4 rounded-[8px] border border-[#f1c5bc] bg-[#fff3f0] px-3 py-2 text-[13px] text-[#b44d38]">
            {error}
          </div>
        )}
        {results.length === 0 && status !== "loading" ? (
          <div className="min-h-[250px] px-5 pb-8 pt-2">
            {mode === "search" ? (
              <>
                <div className="mb-3 text-[12px] font-semibold">Most recent</div>
                {recentSearches.length > 0 ? (
                  <div className="grid gap-3 text-[13px] text-[#62615b]">
                    {recentSearches.map((suggestion) => (
                      <button
                        key={suggestion}
                        className="text-left hover:text-[#242421]"
                        onClick={() => {
                          setQuery(suggestion)
                        }}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-[13px] font-medium text-[#9a9991]">No recent searches yet</div>
                )}
              </>
            ) : (
              <div className="grid min-h-[210px] place-items-center text-center text-[13px] font-medium leading-5 text-[#77766f]">
                Paste a Pinterest board URL, import it, then select the images to create a collection.
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
                  onClick={() => toggleResult(result.id)}
                />
              ))}
            </div>
            {status === "loading" && results.length === 0 && <PinterestResultSkeletonGrid />}
            {results.length > 0 && (
              <div className="flex justify-center py-4">
                <Button variant="softControl" size="appDefault" className="rounded-[8px] px-5 text-[12px]" onClick={loadMore} disabled={status === "loading"}>
                  {status === "loading" ? (
                    <>
                      <span className="mr-2 size-3.5 animate-spin rounded-full border-2 border-[#8c8b84] border-t-transparent" />
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
        <div className="mt-auto flex items-center justify-between border-t border-[#ecebe4] px-5 py-4 text-[12px] font-medium">
          <div className="flex items-center gap-7">
            <button onClick={onCancel}>Cancel</button>
            <button
              onClick={() => setSelectedIds(new Set(results.map((result) => result.id)))}
              disabled={results.length === 0}
              className="disabled:text-[#c4c2ba]"
            >
              Select All
            </button>
            <button onClick={() => setSelectedIds(new Set())} disabled={selectedIds.size === 0} className="disabled:text-[#c4c2ba]">
              Clear
            </button>
            <label className="flex items-center gap-2 text-[#77766f]">
              <button
                type="button"
                className={cn(
                  "relative h-5 w-9 rounded-full transition",
                  autoCaption ? "bg-[#ff5626]" : "bg-[#e2e0d8]"
                )}
                onClick={() => setAutoCaption((current) => !current)}
                aria-pressed={autoCaption}
                aria-label="Toggle auto caption"
              >
                <span
                  className={cn(
                    "absolute top-0.5 size-4 rounded-full bg-white shadow transition",
                    autoCaption ? "left-[18px]" : "left-0.5"
                  )}
                />
              </button>
              Auto-caption
            </label>
          </div>
          {results.length > 0 ? (
            <div className="flex items-center gap-3">
              <Button
                variant="action"
                size="appDefault"
                className="rounded-[8px] px-5 text-[13px] disabled:bg-[#d7d5cc]"
                disabled={!canCreate}
                onClick={createCollection}
              >
                Add {selectedResults.length} images
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="action"
              size="appDefault"
              className="rounded-[8px] px-5 text-[13px]"
              onClick={() => void search(20)}
              disabled={!query.trim() || status === "loading"}
            >
              Search
            </Button>
          )}
        </div>
      </section>
    </div>
  )
}

function PinterestResultCard({
  result,
  index,
  selected,
  onClick,
}: {
  result: PinterestSearchResult
  index: number
  selected: boolean
  onClick: () => void
}) {
  const width = result.width && result.width > 0 ? result.width : 736
  const height = result.height && result.height > 0 ? result.height : 980

  return (
    <button className="group mb-2 inline-block w-full break-inside-avoid text-left" onClick={onClick}>
      <div
        className={cn(
          "relative overflow-hidden rounded-[6px] border-2 bg-[#d9d8d0] transition",
          selected ? "border-[#32d982]" : "border-white group-hover:border-[#deddd5]",
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
        <span className={cn("absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full text-[12px] font-bold", selected ? "bg-[#32d982] text-white" : "bg-white text-[#55544e]")}>
          {selected ? "✓" : "+"}
        </span>
        <div className="absolute inset-x-1.5 bottom-1.5 rounded bg-black/35 p-1.5 text-[10px] font-semibold leading-tight text-white">
          {result.title}
        </div>
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
          style={{ aspectRatio: index % 5 === 0 ? "4 / 5.6" : index % 3 === 0 ? "4 / 6.2" : "4 / 5" }}
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

  const storedSearches = window.localStorage.getItem("reelfarm:pinterest-recent")
  if (!storedSearches) {
    return []
  }

  try {
    const parsed = JSON.parse(storedSearches) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string").slice(0, 6)
      : []
  } catch {
    return []
  }
}

function pinterestCollectionTitle(input: string, mode: "search" | "board") {
  const trimmed = input.trim()
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


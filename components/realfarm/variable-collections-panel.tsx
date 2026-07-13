"use client"

import { useEffect, useMemo, useState } from "react"
import {
  IconBrackets,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { SearchControl } from "@/components/ui/form-controls"
import { AppModal, AppModalPanel } from "@/components/ui/modal"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import type { WordCollectionRecord } from "@/lib/word-collections"

type VariableDraft = {
  originalId?: string
  tag: string
  description: string
  values: string
}

const emptyDraft: VariableDraft = {
  tag: "",
  description: "",
  values: "",
}

export function VariableCollectionsPanel() {
  const [collections, setCollections] = useState<WordCollectionRecord[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [draft, setDraft] = useState<VariableDraft | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchJsonWithTimeout<{ collections?: WordCollectionRecord[] }>(
      "/api/word-collections",
      { toastOnError: false }
    )
      .then((payload) => {
        if (!cancelled) {
          setCollections(payload.collections ?? [])
          setError("")
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(
            getApiErrorMessage(
              requestError,
              "Failed to load variable collections"
            )
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filteredCollections = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) {
      return collections
    }
    return collections.filter((collection) =>
      [collection.id, collection.name, collection.description]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    )
  }, [collections, search])

  async function saveDraft() {
    if (!draft || saving) {
      return
    }
    const id = variableId(draft.tag)
    if (!id) {
      setError("Enter a tag name for this variable collection.")
      return
    }
    setSaving(true)
    setError("")
    try {
      const payload = await fetchJsonWithTimeout<{
        collection?: WordCollectionRecord
      }>("/api/word-collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        toastOnError: false,
        body: JSON.stringify({
          id: draft.originalId || id,
          name: id,
          description: draft.description,
          words: variableValues(draft.values),
          source: "manual",
        }),
      })
      if (!payload.collection) {
        throw new Error("Variable collection was not saved")
      }
      setCollections((current) => [
        payload.collection!,
        ...current.filter((item) => item.id !== payload.collection!.id),
      ])
      setDraft(null)
    } catch (saveError) {
      setError(
        getApiErrorMessage(saveError, "Failed to save variable collection")
      )
    } finally {
      setSaving(false)
    }
  }

  async function deleteCollection(collection: WordCollectionRecord) {
    if (!window.confirm(`Delete [[${collection.id}]] and all of its values?`)) {
      return
    }
    try {
      await fetchJsonWithTimeout(
        `/api/word-collections/${encodeURIComponent(collection.id)}`,
        { method: "DELETE", toastOnError: false }
      )
      setCollections((current) =>
        current.filter((item) => item.id !== collection.id)
      )
    } catch (deleteError) {
      setError(
        getApiErrorMessage(deleteError, "Failed to delete variable collection")
      )
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <SearchControl
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search variables"
          aria-label="Search variable collections"
          className="max-w-[440px]"
        />
        <Button
          variant="action"
          size="appDefault"
          onClick={() => setDraft(emptyDraft)}
        >
          <IconPlus className="size-4" />
          Add variable
        </Button>
      </div>

      {error ? (
        <div className="mb-4 rounded-[7px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="app-empty-state grid min-h-[260px] place-items-center text-[14px] font-semibold text-app-muted-text">
          Loading variables…
        </div>
      ) : filteredCollections.length === 0 ? (
        <button
          type="button"
          className="app-empty-state grid min-h-[360px] w-full place-items-center text-center transition hover:bg-app-control-hover"
          onClick={() => setDraft(emptyDraft)}
        >
          <span className="max-w-[390px]">
            <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-white text-[#e46954] shadow-sm">
              <IconBrackets className="size-6" />
            </span>
            <span className="block text-[18px] font-semibold">
              {collections.length === 0
                ? "No variable collections yet"
                : "No matching variables"}
            </span>
            <span className="mt-2 block text-[13px] leading-5 text-[#77766f]">
              Store reusable values for dynamic tags such as [[zodiac]],
              [[city]], or [[product]].
            </span>
          </span>
        </button>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredCollections.map((collection) => (
            <article
              key={collection.id}
              className="rounded-[8px] border border-app-panel-border bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-[15px] font-bold text-app-text">
                    [[{collection.id}]]
                  </div>
                  <div className="mt-1 text-[12px] font-semibold text-app-muted-text">
                    {collection.words.length} values
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="iconControl"
                    size="icon-control-sm"
                    aria-label={`Edit ${collection.id}`}
                    onClick={() =>
                      setDraft({
                        originalId: collection.id,
                        tag: collection.id,
                        description: collection.description ?? "",
                        values: collection.words.join("\n"),
                      })
                    }
                  >
                    <IconPencil className="size-4" />
                  </Button>
                  <Button
                    variant="iconControl"
                    size="icon-control-sm"
                    className="text-app-danger"
                    aria-label={`Delete ${collection.id}`}
                    onClick={() => void deleteCollection(collection)}
                  >
                    <IconTrash className="size-4" />
                  </Button>
                </div>
              </div>
              {collection.description ? (
                <p className="mt-3 text-[13px] leading-5 text-app-muted-text">
                  {collection.description}
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-1.5">
                {collection.words.slice(0, 8).map((word) => (
                  <span
                    key={word}
                    className="rounded-full bg-[#f1f0ea] px-2.5 py-1 text-[11px] font-semibold text-[#5f5e57]"
                  >
                    {word}
                  </span>
                ))}
                {collection.words.length > 8 ? (
                  <span className="px-1 py-1 text-[11px] font-semibold text-app-muted-text">
                    +{collection.words.length - 8} more
                  </span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      {draft ? (
        <VariableCollectionModal
          draft={draft}
          saving={saving}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSave={() => void saveDraft()}
        />
      ) : null}
    </div>
  )
}

function VariableCollectionModal({
  draft,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  draft: VariableDraft
  saving: boolean
  onChange: (draft: VariableDraft) => void
  onClose: () => void
  onSave: () => void
}) {
  return (
    <AppModal onClose={onClose}>
      <AppModalPanel className="max-w-[560px] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[20px] font-semibold text-app-text">
              {draft.originalId ? "Edit variable" : "New variable"}
            </h2>
            <p className="mt-1 text-[13px] leading-5 text-app-muted-text">
              The tag name is used in hooks as [[tag-name]].
            </p>
          </div>
          <Button
            variant="iconControl"
            size="icon-control-sm"
            onClick={onClose}
            aria-label="Close variable editor"
          >
            ×
          </Button>
        </div>
        <label className="mt-5 block">
          <span className="text-[12px] font-bold text-app-text">Tag name</span>
          <div className="mt-1 flex h-10 items-center rounded-[6px] border border-app-panel-border bg-white px-3 focus-within:border-[#77766f]">
            <span className="font-mono text-[13px] text-app-muted-text">
              [[
            </span>
            <input
              value={draft.tag}
              disabled={Boolean(draft.originalId)}
              onChange={(event) =>
                onChange({ ...draft, tag: event.target.value })
              }
              className="min-w-0 flex-1 bg-transparent px-1 font-mono text-[13px] outline-none disabled:text-app-muted-text"
              placeholder="zodiac"
            />
            <span className="font-mono text-[13px] text-app-muted-text">
              ]]
            </span>
          </div>
        </label>
        <label className="mt-4 block">
          <span className="text-[12px] font-bold text-app-text">
            Description{" "}
            <span className="font-medium text-app-muted-text">(optional)</span>
          </span>
          <input
            value={draft.description}
            onChange={(event) =>
              onChange({ ...draft, description: event.target.value })
            }
            className="mt-1 h-10 w-full rounded-[6px] border border-app-panel-border px-3 text-[13px] outline-none focus:border-[#77766f]"
            placeholder="Values used for zodiac-specific hooks"
          />
        </label>
        <label className="mt-4 block">
          <span className="text-[12px] font-bold text-app-text">
            Values{" "}
            <span className="font-medium text-app-muted-text">
              (one per line)
            </span>
          </span>
          <textarea
            value={draft.values}
            onChange={(event) =>
              onChange({ ...draft, values: event.target.value })
            }
            className="mt-1 h-52 w-full resize-none rounded-[6px] border border-app-panel-border p-3 text-[13px] leading-6 outline-none focus:border-[#77766f]"
            placeholder={"aries\ntaurus\ngemini"}
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="softControl" size="appDefault" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="action"
            size="appDefault"
            disabled={saving || !variableId(draft.tag)}
            onClick={onSave}
          >
            {saving ? "Saving…" : "Save variable"}
          </Button>
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

function variableId(value: string) {
  return value
    .trim()
    .replace(/^\[\[|\]\]$/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function variableValues(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

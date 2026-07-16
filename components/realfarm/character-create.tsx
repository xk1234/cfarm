"use client"

import { useRef, useState } from "react"
import type * as React from "react"
import {
  IconChevronLeft,
  IconChevronRight,
  IconMovie,
  IconPhoto,
  IconRefresh,
  IconUpload,
  IconVolume,
  IconX,
} from "@tabler/icons-react"
import { Copy, ImagePlus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { SelectControl } from "@/components/ui/form-controls"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import { Spinner } from "@/components/ui/spinner"
import { UploadDropzone } from "@/components/ui/upload-dropzone"
import {
  defaultCharacterAttributes,
  normalizeCharacterAttributes,
} from "@/lib/character-model"
import type { CharacterPayload, CharacterRecord } from "@/lib/characters"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import {
  characterAttributeOptions,
  characterEditorFields,
  characterEditorTabs,
  characterSummaryFields,
  defaultCharacterHeadshotPrompt,
  defaultCharacterPreviewUrl,
  formatCharacterFieldName,
  formatCharacterValue,
  getCharacterFieldValue,
  imageEditModels,
  parseImportedCharacter,
  setCharacterFieldValue,
  upscaleModels,
  type CharacterAttributes,
  type CharacterEditorTab,
  type ImportedCharacterPayload,
} from "@/lib/realfarm-character-ui"
import { cn } from "@/lib/utils"

export function NewCharacterModal({
  fullPage,
  initialCharacter,
  onCancel,
  onSave,
}: {
  fullPage?: boolean
  initialCharacter?: CharacterRecord | null
  onCancel: () => void
  onSave: (payload: CharacterPayload) => Promise<void> | void
}) {
  const [name, setName] = useState(initialCharacter?.name ?? "UU's character 1")
  const [attributes, setAttributes] = useState<CharacterAttributes>(() =>
    normalizeCharacterAttributes(
      initialCharacter?.attributes ?? defaultCharacterAttributes
    )
  )
  const [previewUrl, setPreviewUrl] = useState(
    initialCharacter?.preview_url ?? ""
  )
  const [importOpen, setImportOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<CharacterEditorTab>("Overview")

  function updateAttribute(key: string, value: string) {
    setAttributes((current) =>
      setCharacterFieldValue(
        current,
        key,
        key === "age" ? Number(value) : value
      )
    )
  }

  function importCharacter(payload: ImportedCharacterPayload) {
    if (payload.name) {
      setName(payload.name)
    }
    setAttributes((current) =>
      normalizeCharacterAttributes({ ...current, ...payload.attributes })
    )
    setPreviewUrl(payload.previewUrl ?? "")
    setImportOpen(false)
  }

  async function copyAttributesJson() {
    await navigator.clipboard
      ?.writeText(JSON.stringify({ name, attributes }, null, 2))
      .catch(() => undefined)
  }

  async function submitCharacter() {
    setSaving(true)
    try {
      await onSave({
        id: initialCharacter?.id,
        name: name.trim() || "UU's character 1",
        attributes: normalizeCharacterAttributes({
          ...attributes,
          name: name.trim() || "UU's character 1",
        }),
        preview_url: previewUrl,
      })
    } finally {
      setSaving(false)
    }
  }

  const editor = (
    <section
      className={cn(
        "grid w-full overflow-hidden bg-app-surface lg:grid-cols-[300px_1fr]",
        fullPage
          ? "min-h-[calc(100svh-72px)] rounded-[8px] lg:grid-cols-[260px_1fr]"
          : "h-[82vh] min-h-[640px] max-w-[1120px] rounded-[12px] shadow-2xl lg:grid-cols-[260px_1fr]"
      )}
    >
      <aside className="flex min-h-0 flex-col bg-[#f1f1eb] p-2.5">
        <div className="mb-4 flex h-10 items-center gap-3 px-3">
          <button
            className="grid size-8 place-items-center rounded-[6px] hover:bg-white/70"
            onClick={onCancel}
            aria-label="Close new character"
          >
            <IconChevronLeft className="size-5" />
          </button>
          <h2 className="text-[22px] font-bold text-app-text">
            {initialCharacter ? "Edit Character" : "New Character"}
          </h2>
        </div>
        <button
          className={cn(
            "mb-4 h-11 rounded-[11px] px-4 text-left text-[16px] font-bold text-[#303030]",
            activeTab === "Overview"
              ? "bg-app-surface shadow-sm"
              : "hover:bg-white/65"
          )}
          onClick={() => setActiveTab("Overview")}
        >
          Overview
        </button>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2">
          {characterEditorTabs
            .filter((tab) => tab !== "Overview")
            .map((group) => (
              <button
                key={group}
                className={cn(
                  "flex h-10 w-full items-center justify-between rounded-[9px] px-3 text-left text-[14px] font-semibold text-[#596575] hover:bg-white/65",
                  activeTab === group && "bg-app-surface text-[#202938] shadow-sm"
                )}
                onClick={() => setActiveTab(group)}
              >
                {group}
                <IconChevronRight className="size-4 text-[#9ba5b4]" />
              </button>
            ))}
        </div>
        <div className="space-y-2 pt-3">
          <button
            className="flex h-10 w-full items-center justify-center gap-2 rounded-[10px] border border-[#d6dce5] bg-app-surface text-[14px] font-bold text-[#34332f]"
            onClick={() => setImportOpen(true)}
          >
            <IconUpload className="size-4" />
            Import Prompt
          </button>
          <button
            className="flex h-10 w-full items-center justify-center gap-2 rounded-[10px] border border-[#d6dce5] bg-app-surface text-[14px] font-bold text-[#34332f]"
            onClick={copyAttributesJson}
          >
            <Copy className="size-4" />
            Copy Attributes JSON
          </button>
        </div>
      </aside>

      <div className="min-w-0 overflow-y-auto">
        <div className="grid min-h-[460px] place-items-center bg-[#b8b8b8] px-6 py-6">
          <div className="flex w-full max-w-[560px] flex-col items-center">
            <CharacterPortrait previewUrl={previewUrl} />
            <button className="mt-4 flex h-10 items-center gap-2 rounded-[11px] border border-[#e4e7ee] bg-white/80 px-5 text-[14px] font-bold text-[#a4adba] shadow-sm">
              <IconRefresh className="size-4" />
              Re-render Preview
            </button>
            <div className="mt-6 flex w-full flex-wrap justify-center gap-3">
              <input
                className="h-11 min-w-[260px] flex-1 rounded-[11px] border border-[#d8dce5] bg-app-surface px-4 text-[17px] font-semibold text-app-text shadow-sm outline-none"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <Button
                variant="action"
                disabled={saving}
                onClick={submitCharacter}
              >
                <span className="text-[19px]">✓</span>
                {initialCharacter ? "Save Changes" : "Save Character"}
              </Button>
            </div>
          </div>
        </div>
        <div className="px-6 py-6">
          <CharacterEditorTabContent
            activeTab={activeTab}
            attributes={attributes}
            onChange={updateAttribute}
          />
        </div>
      </div>
    </section>
  )

  if (fullPage) {
    return (
      <div className="bg-app-surface-subtle">
        {editor}
        {importOpen && (
          <ImportPromptModal
            onCancel={() => setImportOpen(false)}
            onImport={importCharacter}
          />
        )}
      </div>
    )
  }

  return (
    <AppModal onClose={onCancel}>
      {editor}
      {importOpen && (
        <ImportPromptModal
          onCancel={() => setImportOpen(false)}
          onImport={importCharacter}
        />
      )}
    </AppModal>
  )
}

function CharacterOverview({
  attributes,
}: {
  attributes: CharacterAttributes
}) {
  return (
    <div>
      <h3 className="text-[22px] font-bold text-[#303030]">Overview</h3>
      <div className="my-4 h-px bg-[#dedede]" />
      <div className="grid gap-x-10 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
        {characterSummaryFields.map(([label, key]) => (
          <div
            key={`${label}-${key}`}
            className="grid grid-cols-[105px_1fr] items-baseline gap-3"
          >
            <div className="text-[14px] font-semibold text-[#a3acba]">
              {label}
            </div>
            <div className="text-right text-[17px] font-medium text-[#202938]">
              {formatCharacterValue(getCharacterFieldValue(attributes, key))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CharacterEditorTabContent({
  activeTab,
  attributes,
  onChange,
}: {
  activeTab: CharacterEditorTab
  attributes: CharacterAttributes
  onChange: (key: string, value: string) => void
}) {
  if (activeTab === "Overview") {
    return <CharacterOverview attributes={attributes} />
  }

  if (activeTab === "Voice") {
    return (
      <CharacterAttributeTabForm
        group="Voice"
        attributes={attributes}
        onChange={onChange}
      />
    )
  }

  if (activeTab === "Images") {
    return (
      <CharacterGeneratedAssetState
        title="No generated images yet"
        description="Generated character images will appear here."
        icon="image"
      />
    )
  }

  if (activeTab === "Videos") {
    return (
      <CharacterGeneratedAssetState
        title="No generated videos yet"
        description="Generated character videos will appear here."
        icon="video"
      />
    )
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <CharacterModelPanel
        title="Image edit"
        description="Available after opening a generated image."
        models={imageEditModels}
      />
      <CharacterModelPanel
        title="Upscale"
        description="Available after opening an image or video generation."
        models={upscaleModels}
      />
    </div>
  )
}

function CharacterGeneratedAssetState({
  title,
  description,
  icon,
}: {
  title: string
  description: string
  icon: "voice" | "image" | "video"
}) {
  const Icon =
    icon === "voice" ? IconVolume : icon === "video" ? IconMovie : IconPhoto
  return (
    <div className="grid min-h-[300px] place-items-center rounded-[14px] border border-dashed border-[#d7d7d0] bg-app-surface-subtle text-center">
      <div>
        <Icon className="mx-auto size-11 text-[#b8babf]" stroke={1.5} />
        <div className="mt-4 text-[20px] font-bold text-app-text">{title}</div>
        <div className="mt-2 text-[14px] font-semibold text-[#8b8b86]">
          {description}
        </div>
      </div>
    </div>
  )
}

export function CharacterModelPanel({
  title,
  description,
  models,
}: {
  title: string
  description: string
  models: Array<{ label: string; url: string }>
}) {
  return (
    <section>
      <h3 className="text-[22px] font-bold text-[#303030]">{title}</h3>
      <p className="mt-1 text-[14px] font-semibold text-[#878780]">
        {description}
      </p>
      <div className="mt-4 grid gap-3">
        {models.map((model) => (
          <a
            key={model.url}
            href={model.url}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-14 items-center justify-between rounded-[12px] border border-[#e3e3dd] bg-app-surface px-4 text-[15px] font-bold text-[#2f2f2b] shadow-sm hover:bg-app-surface-subtle"
          >
            {model.label}
            <IconChevronRight className="size-4 text-[#a5a59e]" />
          </a>
        ))}
      </div>
    </section>
  )
}

function CharacterAttributeTabForm({
  group,
  attributes,
  onChange,
}: {
  group: "Voice"
  attributes: CharacterAttributes
  onChange: (key: string, value: string) => void
}) {
  return (
    <div className="space-y-9">
      {characterEditorFields[group].map((field) => (
        <CharacterOptionSection
          key={field}
          title={formatCharacterFieldName(field)}
        >
          <div className="grid gap-3 md:grid-cols-3">
            {characterAttributeOptions[field].map((option) => (
              <button
                key={option}
                className={cn(
                  "grid min-h-16 place-items-center rounded-[10px] bg-[#f8f8f6] px-3 py-3 text-center text-[16px] font-medium text-[#374151]",
                  String(getCharacterFieldValue(attributes, field)) ===
                    option &&
                    "border-2 border-[#3b82f6] bg-app-surface text-app-text"
                )}
                onClick={() => onChange(field, option)}
              >
                {formatCharacterValue(option)}
              </button>
            ))}
          </div>
        </CharacterOptionSection>
      ))}
    </div>
  )
}

function CharacterOptionSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h3 className="text-[22px] font-bold text-[#303030]">{title}</h3>
      <div className="my-4 h-px bg-[#dedede]" />
      {children}
    </section>
  )
}

export function CharacterCreateModal({
  onCancel,
  onSave,
}: {
  onCancel: () => void
  onSave: (payload: CharacterPayload) => Promise<void> | void
}) {
  const [name, setName] = useState("UU's character 1")
  const [attributes, setAttributes] = useState<CharacterAttributes>(() =>
    normalizeCharacterAttributes(defaultCharacterAttributes)
  )
  const [previewUrl, setPreviewUrl] = useState(defaultCharacterPreviewUrl)
  const [headshotReady, setHeadshotReady] = useState(true)
  const [headshotError, setHeadshotError] = useState("")
  const [attributesLoading, setAttributesLoading] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const headshotRequestRef = useRef(0)

  async function extractAttributesFromImage(
    nextName: string,
    sourceImageDataUrl: string
  ) {
    return fetchJsonWithTimeout<{
      name?: string
      attributes?: CharacterAttributes
    }>("/api/characters/attributes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeoutMs: 90_000,
      toastOnError: false,
      body: JSON.stringify({
        name: nextName,
        currentAttributes: normalizeCharacterAttributes({
          ...attributes,
          name: nextName,
        }),
        sourceImageDataUrl,
      }),
    })
  }

  async function generateHeadshot(
    nextName: string,
    nextAttributes: CharacterAttributes,
    prompt: string,
    sourceImageDataUrl?: string
  ) {
    const requestId = headshotRequestRef.current + 1
    headshotRequestRef.current = requestId
    setHeadshotReady(false)
    setHeadshotError("")
    const toastId = toast.loading("Generating character headshot...")

    try {
      const result = await fetchJsonWithTimeout<{
        preview_url?: string
        error?: string
        attributes?: CharacterAttributes
      }>("/api/characters/headshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeoutMs: 240_000,
        toastOnError: false,
        body: JSON.stringify({
          name: nextName,
          attributes: normalizeCharacterAttributes({
            ...nextAttributes,
            name: nextName,
          }),
          customPrompt: prompt,
          sourceImageDataUrl,
        }),
      })
      if (!result.preview_url) {
        throw new Error(result.error || "Headshot generation failed")
      }
      if (headshotRequestRef.current !== requestId) {
        toast.dismiss(toastId)
        return
      }
      if (result.attributes) {
        setAttributes(
          normalizeCharacterAttributes({ ...result.attributes, name: nextName })
        )
      }
      setPreviewUrl(result.preview_url)
      setHeadshotReady(true)
      toast.success("Character headshot ready", { id: toastId })
    } catch (error) {
      if (headshotRequestRef.current === requestId) {
        const message = getApiErrorMessage(error, "Headshot generation failed")
        setHeadshotError(message)
        setHeadshotReady(true)
        toast.error(message, { id: toastId })
      } else {
        toast.dismiss(toastId)
      }
    }
  }

  function updateCreateAttribute(key: string, value: string) {
    setAttributes((current) =>
      setCharacterFieldValue(
        current,
        key,
        key === "age" ? Number(value) : value
      )
    )
    setHeadshotError("")
  }

  async function regenerateFace() {
    const cleanName = name.trim() || "UU's character 1"
    await generateHeadshot(
      cleanName,
      normalizeCharacterAttributes({ ...attributes, name: cleanName }),
      defaultCharacterHeadshotPrompt
    )
  }

  async function applyImport(payload: ImportedCharacterPayload) {
    let nextName = payload.name?.trim() || name
    let nextAttributes = normalizeCharacterAttributes({
      ...attributes,
      ...payload.attributes,
      name: nextName,
    })

    const requestId = headshotRequestRef.current + 1
    headshotRequestRef.current = requestId
    setUploadOpen(false)
    setAttributesLoading(true)
    setHeadshotReady(false)
    setHeadshotError("")
    let startedHeadshot = false
    try {
      if (payload.sourceImageDataUrl) {
        const extracted = await extractAttributesFromImage(
          nextName,
          payload.sourceImageDataUrl
        )
        if (headshotRequestRef.current !== requestId) {
          return
        }
        nextName = extracted.name?.trim() || nextName
        nextAttributes = normalizeCharacterAttributes({
          ...(extracted.attributes ?? nextAttributes),
          name: nextName,
        })
      }

      setName(nextName)
      setAttributes(nextAttributes)
      startedHeadshot = true
      await generateHeadshot(
        nextName,
        nextAttributes,
        defaultCharacterHeadshotPrompt,
        payload.sourceImageDataUrl
      )
    } catch (error) {
      if (headshotRequestRef.current === requestId) {
        const message = getApiErrorMessage(
          error,
          "Character attribute extraction failed"
        )
        setHeadshotError(message)
        setHeadshotReady(true)
        toast.error(message)
      }
    } finally {
      if (startedHeadshot || headshotRequestRef.current === requestId) {
        setAttributesLoading(false)
      }
    }
  }

  async function submitCharacter() {
    setSaving(true)
    try {
      const cleanName = name.trim() || "UU's character 1"
      await onSave({
        name: cleanName,
        attributes: normalizeCharacterAttributes({
          ...attributes,
          name: cleanName,
        }),
        preview_url: previewUrl,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppModal onClose={onCancel}>
      <AppModalPanel
        accessibleTitle="New Character"
        className="relative max-h-[92vh] max-w-[880px] overflow-y-auto rounded-[16px]"
      >
        <div className="flex items-center justify-between border-b border-app-panel-border px-5 py-4">
          <h2 className="text-[22px] font-bold text-app-text">
            New Character
          </h2>
          <button
            className="grid size-9 place-items-center rounded-[8px] text-app-muted-text hover:bg-[#f4f4f2]"
            onClick={onCancel}
            aria-label="Close new character"
          >
            <IconX className="size-5" />
          </button>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-[230px_1fr]">
          <div>
            <div className="relative w-fit">
              {previewUrl ? (
                <CharacterPortrait previewUrl={previewUrl} />
              ) : (
                <CharacterBlankPortrait />
              )}
              {!headshotReady && (
                <div className="absolute inset-0 grid place-items-center rounded-[18px] bg-white/80 px-5 text-center backdrop-blur-sm">
                  <div className="flex flex-col items-center">
                    <Spinner size={30} className="mb-3" />
                    <div className="text-[13px] font-bold text-app-text-soft">
                      Generating headshot...
                    </div>
                  </div>
                </div>
              )}
            </div>
            {headshotError && (
              <div className="mt-3 rounded-[10px] bg-[#fff0f0] px-3 py-2 text-[13px] font-semibold text-[#c63d4a]">
                {headshotError}
              </div>
            )}
            <button
              className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-[11px] border border-[#d8dce5] bg-app-surface text-[14px] font-bold text-app-text shadow-sm hover:bg-app-surface-subtle"
              onClick={() => setUploadOpen(true)}
              type="button"
            >
              <IconUpload className="size-4" />
              Upload JSON or image
            </button>
            <button
              className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-[11px] border border-[#d8dce5] bg-app-surface text-[14px] font-bold text-app-text shadow-sm hover:bg-app-surface-subtle disabled:cursor-not-allowed disabled:opacity-55"
              onClick={regenerateFace}
              disabled={!headshotReady || attributesLoading}
              type="button"
            >
              <IconRefresh className="size-4" />
              Regenerate face
            </button>
          </div>

          <div className="min-w-0">
            <label
              htmlFor="new-character-name"
              className="text-[13px] font-bold text-app-muted-text"
            >
              Name
            </label>
            <input
              id="new-character-name"
              className="mt-2 h-11 w-full rounded-[10px] border border-[#d8dce5] bg-app-surface px-3 text-[16px] font-semibold text-app-text outline-none"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />

            <div className="mt-5 rounded-[12px] border border-app-panel-border bg-app-surface-subtle p-4">
              <div className="mb-3 text-[14px] font-bold text-app-text">
                Character attributes
              </div>
              {attributesLoading ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {characterSummaryFields.map(([label, key]) => (
                    <div
                      key={`${label}-${key}`}
                      className="rounded-[8px] bg-app-surface px-3 py-2"
                    >
                      <div className="text-[10px] font-bold tracking-wide text-[#a3acba] uppercase">
                        {label}
                      </div>
                      <div className="mt-2 h-4 animate-pulse rounded-md bg-[#e5e7eb]" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {characterSummaryFields.map(([label, key]) => (
                    <CharacterAttributeCardControl
                      key={`${label}-${key}`}
                      label={label}
                      field={key}
                      attributes={attributes}
                      disabled={!headshotReady}
                      onChange={updateCreateAttribute}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                variant="action"
                disabled={saving || !previewUrl}
                onClick={submitCharacter}
              >
                Save Character
              </Button>
            </div>
          </div>
        </div>

        {uploadOpen && (
          <CharacterCreateUploadModal
            currentName={name}
            currentAttributes={attributes}
            onCancel={() => setUploadOpen(false)}
            onImport={applyImport}
          />
        )}
      </AppModalPanel>
    </AppModal>
  )
}

function CharacterAttributeCardControl({
  label,
  field,
  attributes,
  disabled,
  onChange,
}: {
  label: string
  field: string
  attributes: CharacterAttributes
  disabled: boolean
  onChange: (key: string, value: string) => void
}) {
  const value = getCharacterFieldValue(attributes, field)
  const hasOptions = Boolean(characterAttributeOptions[field]?.length)
  const options = characterAttributeOptions[field] ?? []
  const selectedValue = Array.isArray(value)
    ? (value[0] ?? "none")
    : String(value ?? "")
  const currentValueIsKnown = options.includes(selectedValue)
  const visibleOptions =
    hasOptions && selectedValue && !currentValueIsKnown
      ? [selectedValue, ...options]
      : options

  return (
    <div className="rounded-[8px] bg-app-surface px-3 py-2">
      <label
        className="text-[10px] font-bold tracking-wide text-[#a3acba] uppercase"
        htmlFor={`character-attribute-${field.replace(/\./g, "-")}`}
      >
        {label}
      </label>
      {hasOptions ? (
        <SelectControl
          id={`character-attribute-${field.replace(/\./g, "-")}`}
          className="mt-2 w-full"
          value={selectedValue}
          disabled={disabled}
          onChange={(event) => onChange(field, event.target.value)}
        >
          {visibleOptions.map((option) => (
            <option key={option} value={option}>
              {formatCharacterValue(option)}
            </option>
          ))}
        </SelectControl>
      ) : (
        <div className="mt-1 truncate text-[13px] font-semibold text-[#202938]">
          {formatCharacterValue(value)}
        </div>
      )}
    </div>
  )
}

function CharacterBlankPortrait() {
  return (
    <div className="grid h-[300px] w-[225px] place-items-center rounded-[18px] border-[5px] border-white bg-[#eeeeea] shadow-xl">
      <IconPhoto className="size-12 text-[#b8babf]" stroke={1.5} />
    </div>
  )
}

function CharacterCreateUploadModal({
  currentName,
  currentAttributes,
  onCancel,
  onImport,
}: {
  currentName: string
  currentAttributes: CharacterAttributes
  onCancel: () => void
  onImport: (payload: ImportedCharacterPayload) => Promise<void> | void
}) {
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const [activeTab, setActiveTab] = useState<"json" | "image">("json")
  const [text, setText] = useState("")
  const [error, setError] = useState("")
  const [imagePreview, setImagePreview] = useState("")
  const [importing, setImporting] = useState(false)

  async function importText(value: string) {
    const parsed = parseImportedCharacter(value)
    if (!parsed) {
      setError("Could not find character attributes in that JSON.")
      return
    }
    setImporting(true)
    try {
      await onImport(parsed)
    } finally {
      setImporting(false)
    }
  }

  async function handleImageFile(file: File | undefined) {
    if (!file) return
    const dataUrl = await readFileAsDataUrl(file)
    setImagePreview(dataUrl)
    setError("")
  }

  function submitImport() {
    if (activeTab === "image") {
      if (!imagePreview) {
        setError("Upload an image first.")
        return
      }
      setImporting(true)
      void Promise.resolve(
        onImport({
          name: currentName,
          attributes: currentAttributes,
          sourceImageDataUrl: imagePreview,
        })
      ).finally(() => setImporting(false))
      return
    }

    void importText(text)
  }

  return (
    <AppModal layer="absolute" className="z-10" onClose={onCancel}>
      <AppModalPanel className="max-w-[560px]">
        <AppModalHeader
          title="Upload character source"
          description="Upload JSON attributes or a character image."
          closeLabel="Close upload modal"
          onClose={onCancel}
        />

        <div className="space-y-4 p-5">
          <div className="grid rounded-[10px] bg-[#f2f1ef] p-1 sm:grid-cols-2">
            <button
              className={cn(
                "flex h-10 items-center justify-center gap-2 rounded-[8px] text-[14px] font-bold",
                activeTab === "json"
                  ? "bg-app-surface text-app-text shadow-sm"
                  : "text-app-muted-text hover:bg-white/60"
              )}
              onClick={() => {
                setActiveTab("json")
                setError("")
              }}
            >
              <Copy className="size-5" />
              Paste JSON
            </button>
            <button
              className={cn(
                "flex h-10 items-center justify-center gap-2 rounded-[8px] text-[14px] font-bold",
                activeTab === "image"
                  ? "bg-app-surface text-app-text shadow-sm"
                  : "text-app-muted-text hover:bg-white/60"
              )}
              onClick={() => {
                setActiveTab("image")
                setError("")
                setTimeout(() => imageInputRef.current?.focus(), 0)
              }}
            >
              <ImagePlus className="size-5" />
              Upload image
            </button>
          </div>

          {activeTab === "json" ? (
            <textarea
              className="h-52 w-full resize-none rounded-[12px] border border-[#dde1e7] bg-app-surface p-3 text-[13px] font-medium outline-none placeholder:text-[#9ca3af]"
              placeholder="Paste character JSON here..."
              value={text}
              onChange={(event) => {
                setText(event.target.value)
                setError("")
              }}
            />
          ) : (
            <UploadDropzone
              inputRef={imageInputRef}
              accept="image/*"
              className="min-h-52"
              onFiles={(files) => void handleImageFile(files?.[0])}
            >
              {imagePreview ? (
                <div className="flex flex-col items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- User-selected local image preview. */}
                  <img
                    src={imagePreview}
                    alt="Uploaded character source"
                    className="h-28 w-28 rounded-[12px] object-cover shadow-sm"
                  />
                  <span className="text-[13px] font-bold text-app-text">
                    Replace image
                  </span>
                </div>
              ) : (
                <div>
                  <IconUpload className="mx-auto mb-3 size-8 text-[#9ca3af]" />
                  <div className="text-[15px] font-bold text-app-text">
                    Drag and drop an image
                  </div>
                  <div className="mt-1 text-[13px] font-semibold text-[#85857f]">
                    or choose a file from your computer
                  </div>
                  <span className="mt-4 inline-block text-[13px] font-bold text-app-action">
                    Upload image
                  </span>
                </div>
              )}
            </UploadDropzone>
          )}
          {error && (
            <div className="text-[13px] font-semibold text-[#d8505f]">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-app-panel-border px-5 py-4">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="action"
            disabled={
              importing || (activeTab === "json" ? !text.trim() : !imagePreview)
            }
            onClick={submitImport}
          >
            {importing ? "Generating..." : "Generate headshot"}
          </Button>
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function ImportPromptModal({
  onCancel,
  onImport,
}: {
  onCancel: () => void
  onImport: (payload: ImportedCharacterPayload) => void
}) {
  const [prompt, setPrompt] = useState("")
  const [error, setError] = useState("")

  function submitImport() {
    const parsed = parseImportedCharacter(prompt)
    if (!parsed) {
      setError("Could not find character attributes in that prompt.")
      return
    }

    onImport(parsed)
  }

  return (
    <AppModal className="z-[60]" onClose={onCancel}>
      <AppModalPanel
        accessibleTitle="Paste your JSON prompt"
        className="max-w-[720px] rounded-[14px]"
      >
        <div className="border-b border-app-panel-border px-6 py-6">
          <h2 className="text-[30px] font-bold text-app-text">
            Paste your JSON prompt
          </h2>
          <p className="mt-4 max-w-[640px] text-[26px] leading-9 font-medium text-app-muted-text">
            Paste an image generation prompt and AI will extract the character
            attributes.
          </p>
        </div>
        <div className="px-6 py-7">
          <textarea
            className="h-[330px] w-full resize-none rounded-[16px] border border-[#dde1e7] bg-[#fbfbfa] p-6 text-[18px] font-medium outline-none placeholder:text-[#9ca3af]"
            placeholder="Paste your prompt here (JSON or plain text)..."
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value)
              setError("")
            }}
            autoFocus
          />
          {error && (
            <div className="mt-3 text-[13px] font-semibold text-[#d8505f]">
              {error}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-4 border-t border-app-panel-border px-6 py-5">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={!prompt.trim()} onClick={submitImport}>
            Import
          </Button>
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

function CharacterPortrait({ previewUrl }: { previewUrl: string }) {
  return (
    <div
      className="relative h-[300px] w-[225px] overflow-hidden rounded-[18px] border-[5px] border-white bg-app-surface bg-cover bg-center shadow-xl"
      role="img"
      aria-label="Character preview"
      style={{
        backgroundImage: `url(${previewUrl || defaultCharacterPreviewUrl})`,
      }}
    />
  )
}

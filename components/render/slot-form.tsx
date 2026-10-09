"use client"

import { useId, useState, type DragEvent, type ReactNode } from "react"
import {
  IconArrowDown,
  IconArrowUp,
  IconArrowsShuffle,
  IconPhotoPlus,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react"

import {
  apiRoutes,
  mediaThumbnailUrl,
  uploadMedia,
} from "@/components/realfarm/api-client"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/icon-button"
import type {
  CollectionImageSource,
  ListSlotDef,
  ScalarSlotDef,
  SlideshowSpec,
  SlotValues,
  SpecIssue,
} from "@/lib/render/spec"
import { cn } from "@/lib/utils"

import { MediaPicker, type PickedImage } from "./media-picker"
import {
  addListItem,
  describeImageSource,
  getSlotValue,
  imageValueKind,
  moveListItem,
  removeListItem,
  setSlotValue,
  slotFields,
  slotLabel,
  slotPathKey,
  type SlotPath,
} from "./slot-values"

export type SlotFormProps = {
  spec: Pick<SlideshowSpec, "slots">
  values: SlotValues
  onChange: (values: SlotValues) => void
  /** Slot-value issues keyed by slot path (`hook`, `items/0/title`). */
  issues?: Map<string, SpecIssue[]>
  /** Thumbnails chosen in the picker, keyed by slot path. */
  thumbnails?: Record<string, string | null>
  onThumbnail?: (key: string, url: string | null) => void
  disabled?: boolean
}

/** Thumbnail for a slot value without picker state. */
export function imageValueThumbnail(value: unknown): string | null {
  const kind = imageValueKind(value)
  if (kind === "media") {
    const id = (value as { media: string }).media
    return mediaThumbnailUrl({ id, fileId: id })
  }
  if (kind === "url") {
    const url = typeof value === "string" ? value : (value as { url: string }).url
    return apiRoutes.imageProxy(url)
  }
  return null
}

/** Form generated from the template's `slots`: image drop targets plus plain inputs. */
export function SlotForm({
  spec,
  values,
  onChange,
  issues,
  thumbnails = {},
  onThumbnail,
  disabled,
}: SlotFormProps) {
  const [picker, setPicker] = useState<{ path: SlotPath; label: string } | null>(null)
  const fields = slotFields(spec)
  const imageFields = fields.filter((f) => f.kind === "scalar" && f.def.type === "image")
  const otherScalars = fields.filter((f) => f.kind === "scalar" && f.def.type !== "image")
  const lists = fields.filter((f) => f.kind === "list")

  function update(path: SlotPath, value: unknown) {
    onChange(setSlotValue(values, path, value))
  }

  function pick(path: SlotPath, picked: PickedImage) {
    update(path, picked.source)
    onThumbnail?.(slotPathKey(path), picked.thumbnailUrl)
    setPicker(null)
  }

  const imageTile = (path: SlotPath, label: string, def: ScalarSlotDef) => (
    <ImageSlotTile
      key={slotPathKey(path)}
      label={label}
      required={"required" in def && !!def.required}
      value={getSlotValue(values, path)}
      thumbnail={thumbnails[slotPathKey(path)]}
      issues={issues?.get(slotPathKey(path))}
      disabled={disabled}
      onOpen={() => setPicker({ path, label })}
      onClear={() => {
        update(path, undefined)
        onThumbnail?.(slotPathKey(path), null)
      }}
      onUploaded={(picked) => pick(path, picked)}
    />
  )

  return (
    <div className="space-y-8">
      {imageFields.length > 0 ? (
        <FormSection title="Images">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {imageFields.map((field) =>
              field.kind === "scalar" ? imageTile([field.name], field.label, field.def) : null
            )}
          </div>
        </FormSection>
      ) : null}

      {otherScalars.length > 0 ? (
        <FormSection title="Text and options">
          <div className="space-y-4">
            {otherScalars.map((field) =>
              field.kind === "scalar" ? (
                <ScalarInput
                  key={field.name}
                  label={field.label}
                  def={field.def}
                  value={values[field.name]}
                  issues={issues?.get(field.name)}
                  disabled={disabled}
                  onChange={(value) => update([field.name], value)}
                />
              ) : null
            )}
          </div>
        </FormSection>
      ) : null}

      {lists.map((field) =>
        field.kind === "list" ? (
          <ListSlotEditor
            key={field.name}
            name={field.name}
            label={field.label}
            def={field.def}
            values={values}
            issues={issues}
            disabled={disabled}
            onChange={onChange}
            renderImage={imageTile}
          />
        ) : null
      )}

      {picker ? (
        <MediaPicker
          title={picker.label}
          onClose={() => setPicker(null)}
          onSelect={(picked) => pick(picker.path, picked)}
        />
      ) : null}
    </div>
  )
}

function FormSection({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-app-text">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  )
}

function IssueText({ issues, id }: { issues?: SpecIssue[]; id?: string }) {
  if (!issues?.length) return null
  return (
    <p id={id} role="alert" className="text-xs font-medium text-app-danger">
      {issues[0].message}
    </p>
  )
}

export function ImageSlotTile({
  label,
  required,
  value,
  thumbnail,
  issues,
  disabled,
  onOpen,
  onClear,
  onUploaded,
}: {
  label: string
  required: boolean
  value: unknown
  thumbnail?: string | null
  issues?: SpecIssue[]
  disabled?: boolean
  onOpen: () => void
  onClear: () => void
  onUploaded: (picked: PickedImage) => void
}) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const kind = imageValueKind(value)
  const src = thumbnail ?? imageValueThumbnail(value)
  const errorId = useId()

  async function drop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (!file || disabled) return
    if (!file.type.startsWith("image/")) {
      setUploadError("Drop an image file.")
      return
    }
    setUploading(true)
    setUploadError("")
    try {
      const media = await uploadMedia(file)
      onUploaded({ source: { media: media.id }, thumbnailUrl: mediaThumbnailUrl(media), label: file.name })
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed.")
    } finally {
      setUploading(false)
    }
  }

  const hasIssue = !!issues?.length || !!uploadError

  return (
    <div className="min-w-0 space-y-1.5" data-slot-tile={label}>
      <div className="relative">
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={onOpen}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => void drop(event)}
          aria-label={`${label}: ${kind === "empty" ? "choose image" : describeImageSource(value)}`}
          aria-describedby={hasIssue ? errorId : undefined}
          className={cn(
            "lc-focus-ring relative grid aspect-[3/4] w-full place-items-center overflow-hidden rounded-xl border bg-app-surface-subtle text-app-muted-text transition",
            kind === "empty" ? "border-dashed border-app-panel-border-strong" : "border-app-panel-border",
            dragging && "border-app-action bg-app-action/5",
            hasIssue && "border-app-danger",
            "hover:border-app-action disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- owner-checked or proxied thumbnail
            <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
          ) : kind === "collection" ? (
            <span className="flex flex-col items-center gap-2 px-3 text-center text-xs font-semibold text-app-text">
              <IconArrowsShuffle className="size-6" />
              {describeImageSource(value)}
              <span className="font-normal text-app-muted-text">
                Seed {(value as CollectionImageSource).seed ?? "default"}
              </span>
            </span>
          ) : (
            <span className="flex flex-col items-center gap-2 px-3 text-center text-xs font-semibold">
              <IconPhotoPlus className="size-6" />
              {uploading ? "Uploading…" : "Choose or drop image"}
            </span>
          )}
        </button>
        {kind !== "empty" && !disabled ? (
          <IconButton
            label={`Clear ${label}`}
            variant="softControl"
            className="absolute top-2 right-2 size-8"
            onClick={onClear}
          >
            <IconX />
          </IconButton>
        ) : null}
      </div>
      <p className="truncate text-xs font-semibold text-app-text">
        {label}
        {required ? <span className="text-app-danger"> *</span> : null}
      </p>
      <div id={errorId}>
        <IssueText issues={uploadError ? [{ code: "asset.fetch_failed", path: "", message: uploadError }] : issues} />
      </div>
    </div>
  )
}

const inputClass =
  "w-full rounded-[10px] border border-app-panel-border bg-app-control-bg px-3 text-sm text-app-text outline-none focus:border-app-action aria-invalid:border-app-danger disabled:opacity-60"

export function ScalarInput({
  label,
  def,
  value,
  issues,
  disabled,
  onChange,
}: {
  label: string
  def: ScalarSlotDef
  value: unknown
  issues?: SpecIssue[]
  disabled?: boolean
  onChange: (value: unknown) => void
}) {
  const id = useId()
  const errorId = `${id}-error`
  const invalid = !!issues?.length
  const required = "required" in def && !!def.required
  const describedBy = invalid ? errorId : undefined

  let control: ReactNode = null
  switch (def.type) {
    case "text": {
      const text = typeof value === "string" ? value : ""
      const common = {
        id,
        value: text,
        disabled,
        placeholder: def.default ?? "",
        maxLength: def.maxLength,
        "aria-invalid": invalid || undefined,
        "aria-describedby": describedBy,
        "aria-required": required || undefined,
      }
      control = def.multiline ? (
        <textarea
          {...common}
          rows={3}
          className={cn(inputClass, "py-2")}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          {...common}
          type="text"
          className={cn(inputClass, "h-9")}
          onChange={(event) => onChange(event.target.value)}
        />
      )
      break
    }
    case "color": {
      const color = typeof value === "string" ? value : (def.default ?? "")
      control = (
        <div className="flex gap-2">
          <input
            type="color"
            aria-label={`${label} picker`}
            value={/^#[0-9a-f]{6}$/i.test(color) ? color : "#000000"}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            className="h-9 w-12 shrink-0 cursor-pointer rounded-[10px] border border-app-panel-border bg-app-control-bg p-1"
          />
          <input
            id={id}
            type="text"
            value={typeof value === "string" ? value : ""}
            placeholder={def.default ?? "#000000"}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value)}
            className={cn(inputClass, "h-9 font-mono")}
          />
        </div>
      )
      break
    }
    case "number":
      control = (
        <input
          id={id}
          type="number"
          value={typeof value === "number" ? value : ""}
          placeholder={def.default !== undefined ? String(def.default) : ""}
          min={def.min}
          max={def.max}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(event) =>
            onChange(event.target.value === "" ? undefined : Number(event.target.value))
          }
          className={cn(inputClass, "h-9 max-w-40")}
        />
      )
      break
    case "boolean":
      return (
        <label className="flex items-center gap-2 text-sm font-medium text-app-text">
          <input
            type="checkbox"
            checked={typeof value === "boolean" ? value : !!def.default}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
            className="size-4 accent-[var(--app-action)]"
          />
          {label}
        </label>
      )
    case "image":
      return null
  }

  const text = typeof value === "string" ? value : ""
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-semibold text-app-text">
          {label}
          {required ? <span className="text-app-danger"> *</span> : null}
        </label>
        {def.type === "text" && def.maxLength ? (
          <span className="text-[11px] tabular-nums text-app-muted-text">
            {text.length}/{def.maxLength}
          </span>
        ) : null}
      </div>
      {control}
      <IssueText issues={issues} id={errorId} />
    </div>
  )
}

function ListSlotEditor({
  name,
  label,
  def,
  values,
  issues,
  disabled,
  onChange,
  renderImage,
}: {
  name: string
  label: string
  def: ListSlotDef
  values: SlotValues
  issues?: Map<string, SpecIssue[]>
  disabled?: boolean
  onChange: (values: SlotValues) => void
  renderImage: (path: SlotPath, label: string, def: ScalarSlotDef) => ReactNode
}) {
  const items = Array.isArray(values[name]) ? (values[name] as Record<string, unknown>[]) : []
  const max = def.maxItems ?? Infinity
  const min = def.minItems ?? 0
  const itemFields = Object.entries(def.item)
  const imageItemFields = itemFields.filter(([, d]) => d.type === "image")
  const otherItemFields = itemFields.filter(([, d]) => d.type !== "image")

  return (
    <FormSection
      title={label}
      actions={
        <Button
          type="button"
          variant="softControl"
          size="appDefault"
          disabled={disabled || items.length >= max}
          onClick={() => onChange(addListItem(values, name))}
        >
          <IconPlus />
          Add item
        </Button>
      }
    >
      <IssueText issues={issues?.get(name)} />
      <ol className="space-y-3">
        {items.map((item, index) => (
          <li
            key={index}
            className="rounded-xl border border-app-panel-border bg-app-surface p-3 sm:p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-app-muted-text">
                {label} {index + 1}
              </span>
              <div className="flex gap-1">
                <IconButton
                  label={`Move ${label} ${index + 1} up`}
                  disabled={disabled || index === 0}
                  onClick={() => onChange(moveListItem(values, name, index, -1))}
                >
                  <IconArrowUp />
                </IconButton>
                <IconButton
                  label={`Move ${label} ${index + 1} down`}
                  disabled={disabled || index === items.length - 1}
                  onClick={() => onChange(moveListItem(values, name, index, 1))}
                >
                  <IconArrowDown />
                </IconButton>
                <IconButton
                  label={`Remove ${label} ${index + 1}`}
                  disabled={disabled || items.length <= min}
                  onClick={() => onChange(removeListItem(values, name, index))}
                >
                  <IconTrash />
                </IconButton>
              </div>
            </div>
            <div
              className={cn(
                "grid gap-4",
                imageItemFields.length > 0 && "sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)]"
              )}
            >
              {imageItemFields.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-1">
                  {imageItemFields.map(([key, fieldDef]) =>
                    renderImage([name, index, key], `${slotLabel(key, fieldDef)}`, fieldDef)
                  )}
                </div>
              ) : null}
              <div className="min-w-0 space-y-3">
                {otherItemFields.map(([key, fieldDef]) => (
                  <ScalarInput
                    key={key}
                    label={slotLabel(key, fieldDef)}
                    def={fieldDef}
                    value={item?.[key]}
                    issues={issues?.get(`${name}/${index}/${key}`)}
                    disabled={disabled}
                    onChange={(value) => onChange(setSlotValue(values, [name, index, key], value))}
                  />
                ))}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </FormSection>
  )
}

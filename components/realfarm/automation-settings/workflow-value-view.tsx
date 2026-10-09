import { JsonViewer } from "@/components/ui/json-viewer"
import { cn } from "@/lib/utils"

import type { SlideshowWorkflowStep } from "./slideshow-workflow"

type Direction = "input" | "output"

export function WorkflowValueView({
  step,
  direction,
  value,
}: {
  step: SlideshowWorkflowStep
  direction: Direction
  value: unknown
}) {
  const normalized = parseSerializedJson(value)
  const label = `${step.label} ${direction}`

  return (
    <div className="mt-3">
      {step.id === "generate-text" && direction === "input" ? (
        <ProviderRequest value={normalized} />
      ) : step.id === "generate-text" && direction === "output" ? (
        <GeneratedCopy value={normalized} />
      ) : step.id === "select-images" || step.id === "render-slides" ? (
        <MediaPayload
          value={normalized}
          showImageSlots={direction === "output" || step.id === "render-slides"}
        />
      ) : (
        <Metadata value={normalized} />
      )}

      <details className="mt-4 border-t border-app-panel-border pt-3">
        <summary className="lc-focus-ring w-fit cursor-pointer rounded-[6px] px-1 py-0.5 text-[12px] font-semibold text-app-muted-text hover:text-app-text">
          Raw {direction} JSON
        </summary>
        <JsonViewer value={normalized} label={label} compact />
      </details>
    </div>
  )
}

function ProviderRequest({ value }: { value: unknown }) {
  const record = asRecord(value)
  const messages = Array.isArray(record?.messages) ? record.messages : []

  if (!record || messages.length === 0) {
    return (
      <EmptyTrace>
        The exact provider request was not recorded for this run.
      </EmptyTrace>
    )
  }

  return (
    <div className="space-y-4" data-workflow-view="provider-request">
      <dl className="grid gap-3 rounded-[12px] bg-app-surface-subtle p-4 sm:grid-cols-3">
        <MetadataItem label="Provider" value="OpenRouter" />
        <MetadataItem label="Model" value={readable(record.model)} mono />
        <MetadataItem
          label="Max tokens"
          value={readable(record.max_tokens)}
          mono
        />
      </dl>

      <div className="space-y-3">
        {messages.map((message, index) => {
          const item = asRecord(message)
          const role = readable(item?.role) || `Message ${index + 1}`
          return (
            <article
              key={`${role}-${index}`}
              className="overflow-hidden rounded-[12px] border border-app-panel-border bg-app-surface"
            >
              <h4 className="border-b border-app-panel-border bg-app-surface-subtle px-4 py-2 text-[11px] font-semibold tracking-[0.06em] text-app-text-faint uppercase">
                {role} prompt
              </h4>
              <PromptContent value={item?.content} />
            </article>
          )
        })}
      </div>

      {record.response_format ? (
        <details className="rounded-[12px] border border-app-panel-border px-4 py-3">
          <summary className="lc-focus-ring w-fit cursor-pointer rounded-[6px] text-[12px] font-semibold text-app-text">
            Response schema
          </summary>
          <JsonViewer
            value={record.response_format}
            label="Provider response schema"
            compact
          />
        </details>
      ) : null}
    </div>
  )
}

function PromptContent({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    return (
      <div className="space-y-3 p-4">
        {value.map((part, index) => {
          const item = asRecord(part)
          const text = item ? (item.text ?? item.content) : part
          return (
            <p
              key={index}
              className="text-[13px] leading-6 whitespace-pre-wrap text-app-text"
            >
              {readable(text) || "Empty prompt part"}
            </p>
          )
        })}
      </div>
    )
  }

  return (
    <p className="p-4 text-[13px] leading-6 whitespace-pre-wrap text-app-text">
      {readable(value) || "Empty prompt"}
    </p>
  )
}

function GeneratedCopy({ value }: { value: unknown }) {
  const record = asRecord(value)
  if (!record) return <Metadata value={value} />

  const slides = Array.isArray(record.slides) ? record.slides : []
  return (
    <div className="space-y-4" data-workflow-view="generated-copy">
      <dl className="grid gap-3 rounded-[12px] bg-app-surface-subtle p-4 sm:grid-cols-2">
        <MetadataItem label="Model" value={readable(record.model)} mono />
        <MetadataItem label="Title" value={readable(record.title)} />
        <MetadataItem
          label="Caption"
          value={readable(record.caption)}
          className="sm:col-span-2"
        />
        <MetadataItem
          label="Hashtags"
          value={readableList(record.hashtags)}
          className="sm:col-span-2"
        />
      </dl>

      {slides.length > 0 ? (
        <div className="space-y-2">
          {slides.map((slide, index) => {
            const item = asRecord(slide)
            return (
              <article
                key={readable(item?.id) || index}
                className="grid gap-2 rounded-[12px] border border-app-panel-border px-4 py-3 sm:grid-cols-[6rem_1fr]"
              >
                <span className="text-[11px] font-semibold text-app-text-faint">
                  Slide {readable(item?.index) || index + 1}
                  {item?.role ? ` · ${readable(item.role)}` : ""}
                </span>
                <p className="text-[13px] leading-5 font-medium whitespace-pre-wrap text-app-text">
                  {readable(item?.text) || "No text recorded"}
                </p>
              </article>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function MediaPayload({
  value,
  showImageSlots,
}: {
  value: unknown
  showImageSlots: boolean
}) {
  const record = asRecord(value)
  if (!record) return <Metadata value={value} />

  const slides = Array.isArray(record.slides)
    ? record.slides
    : Array.isArray(record.renderedSlides)
      ? record.renderedSlides
      : []
  const outputImages = Array.isArray(record.outputImages)
    ? record.outputImages.filter(
        (item): item is string => typeof item === "string"
      )
    : []

  if (slides.length === 0 && outputImages.length === 0) {
    return <Metadata value={value} />
  }

  return (
    <div className="space-y-4" data-workflow-view="media-payload">
      {slides.length > 0 && !showImageSlots ? (
        <div className="space-y-2">
          {slides.map((slide, index) => {
            const item = asRecord(slide)
            return (
              <article
                key={readable(item?.id) || index}
                className="grid gap-2 rounded-[12px] border border-app-panel-border px-4 py-3 sm:grid-cols-[6rem_1fr]"
              >
                <span className="text-[11px] font-semibold text-app-text-faint">
                  Slide {readable(item?.index) || index + 1}
                  {item?.role ? ` · ${readable(item.role)}` : ""}
                </span>
                <p className="text-[12px] leading-5 whitespace-pre-wrap text-app-muted-text">
                  {readable(item?.imageCaption) ||
                    readable(item?.text) ||
                    "No selection context recorded"}
                </p>
              </article>
            )
          })}
        </div>
      ) : slides.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {slides.map((slide, index) => {
            const item = asRecord(slide)
            const imageUrl = firstString(
              item?.imageUrl,
              item?.sourceImageUrl,
              item?.outputUrl,
              outputImages[index]
            )
            return (
              <SlideMediaCard
                key={readable(item?.id) || imageUrl || index}
                index={Number(item?.index) || index + 1}
                imageUrl={imageUrl}
                role={readable(item?.role)}
                text={readable(item?.text)}
                caption={readable(item?.imageCaption)}
              />
            )
          })}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {outputImages.map((imageUrl, index) => (
            <SlideMediaCard
              key={`${imageUrl}-${index}`}
              index={index + 1}
              imageUrl={imageUrl}
            />
          ))}
        </div>
      )}

      <Metadata
        value={omit(record, ["slides", "renderedSlides", "outputImages"])}
      />
    </div>
  )
}

function SlideMediaCard({
  index,
  imageUrl,
  role,
  text,
  caption,
}: {
  index: number
  imageUrl?: string
  role?: string
  text?: string
  caption?: string
}) {
  return (
    <article className="overflow-hidden rounded-[12px] border border-app-panel-border bg-app-surface">
      <div className="grid aspect-[4/3] place-items-center bg-app-media-empty">
        {imageUrl ? (
          // The trace may contain arbitrary signed or local URLs that Next Image cannot allowlist.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={`Slide ${index} selected visual`}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="text-[12px] font-medium text-app-text-faint">
            No image recorded
          </span>
        )}
      </div>
      <div className="space-y-2 p-3">
        <span className="text-[11px] font-semibold text-app-text-faint">
          Slide {index}
          {role ? ` · ${role}` : ""}
        </span>
        {text ? (
          <p className="text-[13px] leading-5 font-semibold whitespace-pre-wrap text-app-text">
            {text}
          </p>
        ) : null}
        {caption ? (
          <p className="text-[12px] leading-5 whitespace-pre-wrap text-app-muted-text">
            {caption}
          </p>
        ) : null}
        {imageUrl ? (
          <a
            href={imageUrl}
            target="_blank"
            rel="noreferrer"
            className="lc-focus-ring inline-flex rounded-[5px] text-[11px] font-semibold text-app-action hover:underline"
          >
            Open original
          </a>
        ) : null}
      </div>
    </article>
  )
}

function Metadata({ value }: { value: unknown }) {
  const record = asRecord(value)
  if (!record) {
    return (
      <p className="rounded-[12px] bg-app-surface-subtle p-4 text-[13px] leading-6 whitespace-pre-wrap text-app-text">
        {readable(value) || "No value recorded"}
      </p>
    )
  }

  const entries = Object.entries(record).filter(([, item]) => isReadable(item))
  if (entries.length === 0) return null
  return (
    <dl className="grid gap-3 rounded-[12px] bg-app-surface-subtle p-4 sm:grid-cols-2">
      {entries.map(([key, item]) => (
        <MetadataItem
          key={key}
          label={humanizeKey(key)}
          value={readableList(item)}
          mono={/id$|url$|dir$/i.test(key)}
        />
      ))}
    </dl>
  )
}

function MetadataItem({
  label,
  value,
  mono = false,
  className,
}: {
  label: string
  value?: string
  mono?: boolean
  className?: string
}) {
  return (
    <div className={className}>
      <dt className="text-[11px] font-medium text-app-text-faint">{label}</dt>
      <dd
        className={cn(
          "mt-1 text-[13px] leading-5 font-medium break-words whitespace-pre-wrap text-app-text",
          mono && "font-mono text-[12px]"
        )}
      >
        {value || "None"}
      </dd>
    </div>
  )
}

function EmptyTrace({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[12px] border border-dashed border-app-panel-border bg-app-surface-subtle px-4 py-5 text-[13px] font-medium text-app-muted-text">
      {children}
    </div>
  )
}

export function parseSerializedJson(value: unknown): unknown {
  if (typeof value !== "string") return value
  const trimmed = value.trim()
  if (!/^[{[]/.test(trimmed)) return value
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return value
  }
}

export function readable(value: unknown): string {
  if (value === undefined || value === null) return ""
  if (typeof value === "string") {
    return value.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n")
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  return ""
}

function readableList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(readable).filter(Boolean).join(" · ")
  }
  return readable(value)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function isReadable(value: unknown) {
  return (
    value === null ||
    ["string", "number", "boolean", "undefined"].includes(typeof value) ||
    (Array.isArray(value) &&
      value.every((item) => !item || typeof item !== "object"))
  )
}

function firstString(...values: unknown[]) {
  return values.find(
    (value): value is string => typeof value === "string" && value.length > 0
  )
}

function humanizeKey(value: string) {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function omit(record: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !keys.includes(key))
  )
}

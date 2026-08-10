import type { ReactNode } from "react"
import {
  IconAlertTriangle,
  IconBraces,
  IconCheck,
  IconFileText,
  IconPhoto,
  IconSparkles,
} from "@tabler/icons-react"

import { cn } from "@/lib/utils"

import {
  asRecord,
  findArtifactArray,
  humanizeArtifactKey,
  inferWorkflowArtifactKind,
  isAudioUrl,
  isEmptyArtifact,
  isVideoUrl,
  mediaUrlFromRecord,
  numberValue,
  safeMediaUrl,
  stringValue,
  type WorkflowArtifactContext,
} from "./artifact-utils"

export function WorkflowArtifactPreview({
  value,
  context,
  depth = 0,
}: {
  value: unknown
  context?: WorkflowArtifactContext
  depth?: number
}) {
  const kind = inferWorkflowArtifactKind(value, context)

  if (kind === "empty") return <EmptyArtifact />
  if (kind === "slideshow") return <SlideshowArtifact value={value} />
  if (kind === "media") return <MediaArtifact value={value} />
  if (kind === "prompt") return <PromptArtifact value={value} />
  if (kind === "script") return <ScriptArtifact value={value} />
  if (kind === "hook") return <HookArtifact value={value} />
  if (kind === "validation") return <ValidationArtifact value={value} />

  return <StructuredArtifact value={value} depth={depth} />
}

function SlideshowArtifact({ value }: { value: unknown }) {
  const record = asRecord(value)
  const slides = Array.isArray(value)
    ? value
    : (findArtifactArray(record, ["slides"]) ?? [])

  return (
    <section data-artifact-kind="slideshow" className="space-y-3">
      <ArtifactHeading
        icon={<IconFileText className="size-4" />}
        title="Slide sequence"
        meta={`${slides.length} slide${slides.length === 1 ? "" : "s"}`}
      />
      <ol className="grid gap-3 xl:grid-cols-2">
        {slides.map((item, index) => {
          const slide = asRecord(item) ?? {}
          const slideNumber = slide.slide ?? index + 1
          const role = stringValue(slide.role)
          const text =
            stringValue(slide.text) ??
            stringValue(slide.title) ??
            textFromItems(slide.textItems)
          const imageUrl = mediaUrlFromRecord(slide)

          return (
            <li
              key={stringValue(slide.id) ?? stringValue(slide.slideId) ?? index}
              className="grid min-w-0 grid-cols-[72px_minmax(0,1fr)] overflow-hidden rounded-xl border border-app-panel-border bg-app-surface-subtle"
            >
              <ArtifactMedia
                url={imageUrl}
                label={`Slide ${slideNumber} preview`}
                className="min-h-28 rounded-none border-0 border-r border-app-panel-border"
              />
              <div className="min-w-0 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-app-text-faint">
                    Slide {String(slideNumber)}
                  </span>
                  {role ? (
                    <span className="text-[10px] font-semibold text-app-muted-text">
                      {humanizeArtifactKey(role)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm leading-5 whitespace-pre-wrap text-app-text">
                  {text ?? "No text on this slide"}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
      <ArtifactSummary record={record} omittedKeys={["slides"]} />
    </section>
  )
}

function MediaArtifact({ value }: { value: unknown }) {
  const record = asRecord(value)
  const items = Array.isArray(value)
    ? value
    : (findArtifactArray(record, [
        "selectedImages",
        "selectedAssets",
        "renderedSlides",
        "assets",
        "images",
        "media",
      ]) ?? (record && mediaUrlFromRecord(record) ? [record] : []))

  return (
    <section data-artifact-kind="media" className="space-y-3">
      <ArtifactHeading
        icon={<IconPhoto className="size-4" />}
        title="Selected media"
        meta={`${items.length} item${items.length === 1 ? "" : "s"}`}
      />
      <div className="flex snap-x gap-3 overflow-x-auto pb-1">
        {items.map((item, index) => {
          const media = asRecord(item) ?? {}
          const url = mediaUrlFromRecord(media)
          const slideNumber = media.slide ?? index + 1
          const caption =
            stringValue(media.imageCaption) ??
            stringValue(media.caption) ??
            stringValue(media.title) ??
            stringValue(media.imageKey)

          return (
            <figure
              key={
                stringValue(media.id) ?? stringValue(media.imageKey) ?? index
              }
              className="w-36 shrink-0 snap-start overflow-hidden rounded-xl border border-app-panel-border bg-app-surface-subtle"
            >
              <ArtifactMedia
                url={url}
                label={caption ?? `Media item ${index + 1}`}
                mediaType={
                  stringValue(media.audioUrl)
                    ? "audio"
                    : stringValue(media.videoUrl)
                      ? "video"
                      : undefined
                }
                className="aspect-[4/5] rounded-none border-0 border-b border-app-panel-border"
              />
              <figcaption className="min-w-0 p-2.5">
                <p className="text-[11px] font-semibold text-app-text-faint">
                  Item {String(slideNumber)}
                </p>
                <p className="mt-1 line-clamp-2 text-xs leading-4 text-app-muted-text">
                  {caption ?? "Selected asset"}
                </p>
              </figcaption>
            </figure>
          )
        })}
      </div>
      <ArtifactSummary
        record={record}
        omittedKeys={[
          "selectedImages",
          "selectedAssets",
          "renderedSlides",
          "assets",
          "images",
          "media",
        ]}
      />
    </section>
  )
}

function PromptArtifact({ value }: { value: unknown }) {
  const root = asRecord(value) ?? {}
  const promptPayload = asRecord(root.promptPayload) ?? root
  const messages = Array.isArray(promptPayload.messages)
    ? promptPayload.messages
    : []

  return (
    <section data-artifact-kind="prompt" className="space-y-3">
      <ArtifactHeading
        icon={<IconSparkles className="size-4" />}
        title="Model prompt"
        meta={messages.length ? `${messages.length} messages` : undefined}
      />
      {messages.length ? (
        <div className="space-y-2">
          {messages.map((item, index) => {
            const message = asRecord(item) ?? {}
            const role = stringValue(message.role) ?? "message"
            const content = promptContent(message.content)
            return (
              <div
                key={`${role}-${index}`}
                className="overflow-hidden rounded-xl border border-app-panel-border bg-app-surface-subtle"
              >
                <div className="border-b border-app-panel-border px-3 py-2 text-[11px] font-semibold text-app-text-faint">
                  {humanizeArtifactKey(role)}
                </div>
                <pre className="max-h-64 overflow-auto p-3 font-mono text-xs leading-5 whitespace-pre-wrap text-app-text">
                  {content}
                </pre>
              </div>
            )
          })}
        </div>
      ) : (
        <StructuredArtifact value={promptPayload} depth={1} />
      )}
      <ArtifactSummary
        record={root}
        omittedKeys={["promptPayload", "messages"]}
      />
    </section>
  )
}

function HookArtifact({ value }: { value: unknown }) {
  const record = asRecord(value) ?? {}
  const hook =
    stringValue(record.resolvedHook) ??
    stringValue(record.hook) ??
    stringValue(record.hookTemplate)
  const substitutions = asRecord(
    record.substitutions ?? record.hookSubstitutions
  )
  const candidates = Array.isArray(record.candidates)
    ? record.candidates
    : Array.isArray(record.hookCandidates)
      ? record.hookCandidates
      : []

  return (
    <section data-artifact-kind="hook" className="space-y-3">
      <ArtifactHeading
        icon={<IconSparkles className="size-4" />}
        title="Resolved hook"
        meta={candidates.length ? `${candidates.length} candidates` : undefined}
      />
      {hook ? (
        <blockquote className="rounded-xl border border-app-panel-border bg-app-surface-subtle p-4 text-base leading-6 font-semibold tracking-[-0.01em] text-app-text">
          {hook}
        </blockquote>
      ) : null}
      {substitutions && Object.keys(substitutions).length ? (
        <dl className="grid gap-2 sm:grid-cols-2">
          {Object.entries(substitutions).map(([key, item]) => (
            <div
              key={key}
              className="rounded-lg border border-app-panel-border bg-background px-3 py-2"
            >
              <dt className="text-[10px] font-semibold text-app-text-faint">
                {humanizeArtifactKey(key)}
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-app-text">
                {scalarText(item)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {candidates.length ? (
        <details className="rounded-lg border border-app-panel-border bg-background px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold text-app-muted-text">
            View hook candidates
          </summary>
          <div className="mt-2">
            <StructuredArtifact value={candidates} depth={1} />
          </div>
        </details>
      ) : null}
      <ArtifactSummary
        record={record}
        omittedKeys={[
          "resolvedHook",
          "hook",
          "hookTemplate",
          "substitutions",
          "hookSubstitutions",
          "candidates",
          "hookCandidates",
        ]}
      />
    </section>
  )
}

function ScriptArtifact({ value }: { value: unknown }) {
  const root = asRecord(value) ?? {}
  const plan = asRecord(root.plan) ?? root
  const segments = Array.isArray(plan.segments)
    ? plan.segments
    : Array.isArray(plan.posts)
      ? plan.posts
      : []
  const hook = stringValue(plan.hookOverlay) ?? stringValue(plan.hook)
  const duration = numberValue(plan.durationSeconds)

  return (
    <section data-artifact-kind="script" className="space-y-3">
      <ArtifactHeading
        icon={<IconFileText className="size-4" />}
        title="Content plan"
        meta={
          duration !== undefined
            ? `${duration}s target`
            : segments.length
              ? `${segments.length} sections`
              : undefined
        }
      />
      {hook ? (
        <div className="rounded-xl border border-app-panel-border bg-app-surface-subtle p-4">
          <p className="text-[11px] font-semibold text-app-text-faint">Hook</p>
          <p className="mt-1 text-base leading-6 font-semibold tracking-[-0.01em] text-app-text">
            {hook}
          </p>
        </div>
      ) : null}
      {segments.length ? (
        <ol className="space-y-2">
          {segments.map((item, index) => {
            const segment = asRecord(item) ?? {}
            const spokenText =
              stringValue(segment.spokenText) ??
              stringValue(segment.text) ??
              stringValue(segment.content)
            const brollPrompt = stringValue(segment.brollPrompt)
            const start = numberValue(segment.startSeconds)
            const end = numberValue(segment.endSeconds)
            return (
              <li
                key={stringValue(segment.id) ?? index}
                className="rounded-xl border border-app-panel-border bg-background p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-app-text-faint">
                    Section {index + 1}
                  </span>
                  {start !== undefined ? (
                    <span className="font-mono text-[11px] text-app-text-faint">
                      {formatTimeRange(start, end)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm leading-5 whitespace-pre-wrap text-app-text">
                  {spokenText ?? "No spoken copy"}
                </p>
                {brollPrompt ? (
                  <div className="mt-2 rounded-lg bg-app-control-bg px-3 py-2 text-xs leading-5 text-app-muted-text">
                    <span className="font-semibold text-app-text-faint">
                      Visual:{" "}
                    </span>
                    {brollPrompt}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ol>
      ) : null}
      <ArtifactSummary
        record={root}
        omittedKeys={
          root.plan ? ["plan"] : ["hook", "hookOverlay", "segments", "posts"]
        }
      />
    </section>
  )
}

function ValidationArtifact({ value }: { value: unknown }) {
  const record = asRecord(value) ?? {}
  const issues = arrayFromUnknown(
    record.issues ?? record.failures ?? record.errors ?? record.warnings
  )
  const score = numberValue(record.score ?? record.overallScore)
  const explicitPass =
    typeof record.passed === "boolean"
      ? record.passed
      : typeof record.valid === "boolean"
        ? record.valid
        : undefined
  const unavailable = record.available === false
  const passed = explicitPass ?? (!unavailable && issues.length === 0)

  return (
    <section data-artifact-kind="validation" className="space-y-3">
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl border p-3",
          passed
            ? "border-emerald-300/70 bg-emerald-500/10 text-emerald-800 dark:border-emerald-400/30 dark:text-emerald-200"
            : "border-amber-300/70 bg-amber-500/10 text-amber-900 dark:border-amber-400/30 dark:text-amber-100"
        )}
      >
        <span className="mt-0.5 shrink-0">
          {passed ? (
            <IconCheck className="size-5" />
          ) : (
            <IconAlertTriangle className="size-5" />
          )}
        </span>
        <div className="min-w-0">
          <p className="font-semibold">
            {unavailable
              ? "Validation unavailable"
              : passed
                ? "Ready"
                : "Needs review"}
          </p>
          <p className="mt-0.5 text-xs leading-5 opacity-80">
            {score !== undefined
              ? `Quality score ${formatScore(score)}`
              : issues.length
                ? `${issues.length} issue${issues.length === 1 ? "" : "s"} found`
                : "No blocking issues found"}
          </p>
        </div>
      </div>
      {issues.length ? (
        <ul className="space-y-2">
          {issues.map((issue, index) => (
            <li
              key={index}
              className="rounded-lg border border-app-panel-border bg-app-surface-subtle px-3 py-2 text-sm leading-5 text-app-text"
            >
              {scalarText(issue)}
            </li>
          ))}
        </ul>
      ) : null}
      <ArtifactSummary
        record={record}
        omittedKeys={[
          "issues",
          "failures",
          "errors",
          "warnings",
          "score",
          "overallScore",
          "passed",
          "valid",
          "available",
        ]}
      />
    </section>
  )
}

function StructuredArtifact({
  value,
  depth = 0,
}: {
  value: unknown
  depth?: number
}) {
  if (isEmptyArtifact(value)) return <EmptyArtifact />
  if (typeof value === "boolean") {
    return <span className="text-sm font-medium">{value ? "Yes" : "No"}</span>
  }
  if (typeof value === "string" || typeof value === "number") {
    return <ScalarArtifact value={value} />
  }
  if (Array.isArray(value)) {
    return (
      <div data-artifact-kind="structured" className="space-y-2">
        {value.map((item, index) => (
          <div
            key={index}
            className={cn(
              "min-w-0",
              typeof item === "object" &&
                item !== null &&
                "rounded-lg border border-app-panel-border bg-app-surface-subtle p-3"
            )}
          >
            <WorkflowArtifactPreview value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    )
  }

  const entries = Object.entries(asRecord(value) ?? {}).filter(
    ([, item]) => item !== undefined
  )
  if (!entries.length) return <EmptyArtifact />

  return (
    <dl data-artifact-kind="structured" className="space-y-3">
      {entries.map(([key, item]) => {
        const complex = item !== null && typeof item === "object"
        return (
          <div
            key={key}
            className={cn(
              "min-w-0",
              complex &&
                depth < 2 &&
                "rounded-xl border border-app-panel-border bg-app-surface-subtle p-3"
            )}
          >
            <dt className="text-[11px] font-semibold text-app-text-faint">
              {humanizeArtifactKey(key)}
            </dt>
            <dd className="mt-1 min-w-0">
              {complex && depth < 3 ? (
                <WorkflowArtifactPreview value={item} depth={depth + 1} />
              ) : (
                <ScalarArtifact value={item} />
              )}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

function ScalarArtifact({ value }: { value: unknown }) {
  const text = scalarText(value)
  const mediaUrl = safeMediaUrl(value)

  if (mediaUrl) {
    return (
      <a
        href={mediaUrl}
        target="_blank"
        rel="noreferrer"
        className="text-sm font-medium break-all text-app-action underline-offset-4 hover:underline"
      >
        {text}
      </a>
    )
  }

  return (
    <span className="text-sm leading-6 break-words whitespace-pre-wrap text-app-text">
      {text}
    </span>
  )
}

function ArtifactMedia({
  url,
  label,
  className,
  mediaType,
}: {
  url?: string
  label: string
  className?: string
  mediaType?: "audio" | "video"
}) {
  if (!url) {
    return (
      <div
        className={cn(
          "grid place-items-center rounded-lg border border-app-panel-border bg-app-control-bg text-app-text-faint",
          className
        )}
        aria-label={`${label} unavailable`}
      >
        <IconPhoto className="size-5" />
      </div>
    )
  }

  if (mediaType === "audio" || isAudioUrl(url)) {
    return (
      <div
        className={cn(
          "grid place-items-center rounded-lg border border-app-panel-border bg-app-control-bg p-3",
          className
        )}
      >
        <audio
          aria-label={label}
          src={url}
          controls
          preload="metadata"
          className="w-full"
        />
      </div>
    )
  }

  if (mediaType === "video" || isVideoUrl(url)) {
    return (
      <video
        aria-label={label}
        src={url}
        controls
        muted
        preload="metadata"
        className={cn(
          "rounded-lg border border-app-panel-border bg-app-strong object-cover",
          className
        )}
      />
    )
  }

  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "rounded-lg border border-app-panel-border bg-app-control-bg bg-cover bg-center",
        className
      )}
      style={{ backgroundImage: `url(${JSON.stringify(url)})` }}
    />
  )
}

function ArtifactHeading({
  icon,
  title,
  meta,
}: {
  icon: ReactNode
  title: string
  meta?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-app-text">
        <span className="text-app-action">{icon}</span>
        <span className="truncate">{title}</span>
      </div>
      {meta ? (
        <span className="shrink-0 text-xs font-medium text-app-text-faint">
          {meta}
        </span>
      ) : null}
    </div>
  )
}

function ArtifactSummary({
  record,
  omittedKeys,
}: {
  record: Record<string, unknown> | null
  omittedKeys: string[]
}) {
  if (!record) return null
  const rest = Object.fromEntries(
    Object.entries(record).filter(
      ([key, item]) => !omittedKeys.includes(key) && item !== undefined
    )
  )
  if (!Object.keys(rest).length) return null

  return (
    <details className="rounded-lg border border-app-panel-border bg-background px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-app-muted-text marker:hidden">
        <IconBraces className="size-4" />
        More fields
      </summary>
      <div className="mt-3 border-t border-app-panel-border pt-3">
        <StructuredArtifact value={rest} depth={1} />
      </div>
    </details>
  )
}

function EmptyArtifact() {
  return <span className="text-sm text-app-text-faint">No data</span>
}

function textFromItems(value: unknown) {
  if (!Array.isArray(value)) return undefined
  const parts = value
    .map((item) => stringValue(asRecord(item)?.text))
    .filter((item): item is string => Boolean(item))
  return parts.length ? parts.join("\n") : undefined
}

function promptContent(value: unknown) {
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        const record = asRecord(item)
        return (
          stringValue(record?.text) ??
          stringValue(record?.content) ??
          scalarText(item)
        )
      })
      .join("\n")
  }
  return scalarText(value)
}

function scalarText(value: unknown) {
  if (value === null || value === undefined || value === "") return "No data"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "string" || typeof value === "number")
    return String(value)
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function arrayFromUnknown(value: unknown) {
  if (Array.isArray(value)) return value
  return value === undefined || value === null || value === "" ? [] : [value]
}

function formatScore(score: number) {
  return score <= 1 ? `${Math.round(score * 100)}%` : String(score)
}

function formatTimeRange(start: number, end?: number) {
  return end === undefined ? `${start}s` : `${start}s-${end}s`
}

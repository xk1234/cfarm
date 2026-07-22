"use client"

import { useState } from "react"
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
  Ref,
  VideoHTMLAttributes,
} from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { IconAlertTriangle, IconPhoto } from "@tabler/icons-react"

import { cn } from "@/lib/utils"

const cardVariants = cva(
  "overflow-hidden border border-brand-border bg-brand-surface text-brand-ink",
  {
    variants: {
      surface: {
        flat: "shadow-none",
        raised: "shadow-app-card",
      },
      tone: {
        default: "",
        danger: "border-brand-danger",
      },
      radius: {
        card: "rounded-card",
        media: "rounded-media",
      },
    },
    defaultVariants: { surface: "raised", tone: "default", radius: "card" },
  }
)

export function MediaCard({
  className,
  surface,
  tone,
  radius,
  ...props
}: HTMLAttributes<HTMLElement> & VariantProps<typeof cardVariants>) {
  return (
    <article
      className={cn(cardVariants({ surface, tone, radius }), className)}
      {...props}
    />
  )
}

type PreviewState = "ready" | "loading" | "error" | "empty"

type MediaCardPreviewProps = HTMLAttributes<HTMLDivElement> & {
  alt?: string
  aspect?: "portrait" | "square" | "wide"
  children?: ReactNode
  fallback?: ReactNode
  imageSrc?: string
  objectFit?: "cover" | "contain"
  state?: PreviewState
  videoRef?: Ref<HTMLVideoElement>
  videoSrc?: string
  videoProps?: Omit<VideoHTMLAttributes<HTMLVideoElement>, "src" | "ref">
}

export function MediaCardPreview({
  alt,
  aspect = "portrait",
  children,
  className,
  fallback,
  imageSrc,
  objectFit = "cover",
  state,
  videoRef,
  videoSrc,
  videoProps,
  ...props
}: MediaCardPreviewProps) {
  const [mediaState, setMediaState] = useState<PreviewState>(
    state ?? (imageSrc ? "loading" : videoSrc ? "ready" : "empty")
  )
  const activeState = state ?? mediaState
  const hasMedia = Boolean(imageSrc || videoSrc || children)

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-media bg-brand-canvas",
        aspect === "portrait" && "aspect-[9/16]",
        aspect === "square" && "aspect-square",
        aspect === "wide" && "aspect-video",
        className
      )}
      data-media-state={activeState}
      {...props}
    >
      {imageSrc ? (
        // Media URLs are user/Appwrite supplied and are not restricted to configured Next hosts.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={alt ?? ""}
          className={cn(
            "absolute inset-0 size-full",
            objectFit === "cover" ? "object-cover" : "object-contain"
          )}
          loading="lazy"
          onError={() => setMediaState("error")}
          onLoad={() => setMediaState("ready")}
          src={imageSrc}
        />
      ) : null}
      {videoSrc ? (
        <video
          aria-label={alt}
          className={cn(
            "absolute inset-0 size-full",
            objectFit === "cover" ? "object-cover" : "object-contain"
          )}
          onError={() => setMediaState("error")}
          ref={videoRef}
          src={videoSrc}
          {...videoProps}
        />
      ) : null}
      {children}
      {activeState === "loading" ? (
        fallback ?? <MediaCardFallback label="Loading media" loading />
      ) : null}
      {activeState === "error" || (!hasMedia && activeState === "empty") ? (
        fallback ?? (
          <MediaCardFallback
            label={activeState === "error" ? "Media unavailable" : "No media"}
          />
        )
      ) : null}
    </div>
  )
}

export function MediaCardFallback({
  label,
  loading = false,
}: {
  label: string
  loading?: boolean
}) {
  const Icon = loading ? IconPhoto : IconAlertTriangle
  return (
    <div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-brand-canvas p-6 text-center text-caption font-semibold text-brand-muted"
      role="status"
    >
      <Icon className={cn("size-6", loading && "animate-pulse")} aria-hidden />
      <span>{label}</span>
    </div>
  )
}

const statusVariants = cva(
  "inline-flex min-h-6 items-center rounded-full px-2.5 text-caption font-semibold",
  {
    variants: {
      tone: {
        neutral: "bg-brand-canvas text-brand-muted",
        accent: "bg-brand-accent-soft text-brand-accent",
        success: "bg-app-success-surface text-brand-success",
        danger: "bg-app-danger-surface text-brand-danger",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
)

export function MediaCardStatus({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof statusVariants>) {
  return <span className={cn(statusVariants({ tone }), className)} {...props} />
}

export function MediaCardActions({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("absolute top-2 right-2 z-30 flex gap-1", className)}
      {...props}
    />
  )
}

export function MediaCardAction({
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "lc-focus-ring grid size-10 place-items-center rounded-control bg-brand-surface/90 text-brand-ink shadow-app-control transition-colors hover:bg-brand-canvas disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      type={type}
      {...props}
    />
  )
}

export function MediaCardMetadata({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center gap-2 text-caption text-brand-muted", className)}
      {...props}
    />
  )
}

export function MediaCardCaption({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-label font-medium text-brand-ink", className)}
      {...props}
    />
  )
}

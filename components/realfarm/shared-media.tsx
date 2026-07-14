"use client"

import {
  IconMovie,
  IconPlayerPlay,
  IconUser,
  IconVolume,
} from "@tabler/icons-react"
import type { ReactNode } from "react"

import { SelectLike, SwitchPill } from "@/components/ui/form-controls"
import { Spinner } from "@/components/ui/spinner"
import type { CreatedImageCollection } from "@/lib/realfarm-collections"
import type { Video } from "@/lib/realfarm-data"
import type { PinterestSearchResult } from "@/lib/pinterest-search"
import { cn } from "@/lib/utils"

export function VideoGrid({
  videos,
  avatarUrl,
}: {
  videos: Video[]
  avatarUrl?: string
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {videos.map((video, index) => (
        <article key={video.id} className="app-card overflow-hidden">
          <VideoPhone
            caption={video.caption}
            tone={video.tone}
            avatarIndex={index}
            avatarUrl={avatarUrl}
            className="h-52 w-full rounded-none"
          />
        </article>
      ))}
    </div>
  )
}

export function VideoPhone({
  caption,
  tone,
  avatarIndex,
  avatarUrl,
  className,
}: {
  caption: string
  tone: string
  avatarIndex: number
  avatarUrl?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[5px] bg-[#d8d6ce]",
        phoneTone(tone),
        className
      )}
    >
      <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
      <div className="absolute top-[18%] left-1/2 size-28 -translate-x-1/2 rounded-full bg-white/30 blur-2xl" />
      <AvatarDot
        name="creator"
        index={avatarIndex}
        imageUrl={avatarUrl}
        className="absolute top-[27%] left-1/2 size-28 -translate-x-1/2 border-4 border-white/20"
      />
      <div className="absolute inset-x-5 bottom-[30%] text-center text-[12px] leading-tight font-extrabold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.8)]">
        {caption}
      </div>
      <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-3">
        {[IconMovie, IconVolume, IconUser].map((Icon, index) => (
          <span
            key={index}
            className="grid size-8 place-items-center rounded-[5px] bg-white/85 text-[#686761]"
          >
            <Icon className="size-4" />
          </span>
        ))}
      </div>
    </div>
  )
}

export function ToolPill({
  icon: Icon,
  label,
  danger,
  onClick,
}: {
  icon?: React.ComponentType<{ className?: string }>
  label?: string
  danger?: boolean
  onClick?: () => void
}) {
  return (
    <button
      className={cn(
        "grid h-8 min-w-8 place-items-center rounded-full bg-white px-2 text-[12px] font-semibold shadow-sm",
        danger && "text-[#e16d6d]"
      )}
      onClick={onClick}
      aria-label={label}
    >
      {Icon ? <Icon className="size-4" /> : label}
    </button>
  )
}

export function MediaCardShell({
  children,
  className,
  danger,
}: {
  children: ReactNode
  className?: string
  danger?: boolean
}) {
  return (
    <article
      className={cn(
        "app-card overflow-hidden",
        danger && "border-app-danger-surface",
        className
      )}
    >
      {children}
    </article>
  )
}

export function MediaFrame({
  children,
  className,
  aspect = "portrait",
}: {
  children: ReactNode
  className?: string
  aspect?: "portrait" | "square" | "wide"
}) {
  return (
    <div
      className={cn(
        "app-media-frame",
        aspect === "portrait" && "aspect-[9/16]",
        aspect === "square" && "aspect-square",
        aspect === "wide" && "aspect-video",
        className
      )}
    >
      {children}
    </div>
  )
}

export function MediaPendingState({
  label,
  className,
}: {
  label: string
  className?: string
}) {
  return (
    <MediaFrame
      className={cn(
        "flex flex-col items-center justify-center gap-4 bg-app-surface p-6 text-center",
        className
      )}
    >
      <Spinner size={26} aria-label={label} />
      <div className="text-[13px] font-semibold text-app-muted-text">
        {label}
      </div>
    </MediaFrame>
  )
}

export function MediaErrorState({
  title,
  message,
  action,
}: {
  title: string
  message: string
  action?: ReactNode
}) {
  return (
    <MediaFrame className="flex flex-col items-center justify-center gap-3 bg-app-danger-surface p-6 text-center">
      <div className="text-[13px] font-bold text-app-danger-muted">{title}</div>
      <div className="line-clamp-4 text-[12px] leading-5 font-semibold text-app-danger-text">
        {message}
      </div>
      {action}
    </MediaFrame>
  )
}

export function CollectionPreview({
  collection,
  index,
}: {
  collection: CreatedImageCollection
  index: number
}) {
  const firstImage = collection.images[0]

  if (!firstImage) {
    return (
      <div className="grid h-[170px] place-items-center bg-app-media-empty text-[13px] font-semibold text-app-muted-text">
        No {collection.mediaType === "video" ? "videos" : "images"}
      </div>
    )
  }

  return (
    <PinterestPreviewTile
      image={firstImage}
      index={index}
      className="h-[170px]"
    />
  )
}

export function PinterestPreviewTile({
  image,
  index,
  className,
  fit = "cover",
}: {
  image: PinterestSearchResult
  index: number
  className?: string
  fit?: "cover" | "contain"
}) {
  const isVideo = isVideoMediaUrl(image.imageUrl)

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-app-media-empty",
        !image.imageUrl && thumbTone("collection", index),
        className
      )}
      style={
        image.imageUrl && !isVideo
          ? {
              backgroundImage: `url(${image.imageUrl})`,
              backgroundPosition: "center",
              backgroundSize: fit,
              backgroundRepeat: "no-repeat",
            }
          : undefined
      }
    >
      {image.imageUrl && isVideo ? (
        <>
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src={image.imageUrl}
            muted
            playsInline
            preload="metadata"
          />
          <span className="absolute inset-0 grid place-items-center bg-black/10 text-white">
            <span className="grid size-9 place-items-center rounded-full bg-black/55">
              <IconPlayerPlay className="size-5" fill="white" />
            </span>
          </span>
        </>
      ) : null}
    </div>
  )
}

function isVideoMediaUrl(url?: string) {
  return /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(url ?? "")
}

export function ControlRow({
  label,
  value,
  image,
}: {
  label: string
  value: string
  image?: boolean
}) {
  return (
    <div className="mb-3 flex items-center justify-between rounded-[8px] bg-[#f8f8f4] px-3 py-2 text-[12px]">
      <span className="font-semibold">{label}</span>
      <span className="max-w-[135px] truncate text-[#77766f]">
        {image ? "▧ " : ""}
        {value}
      </span>
    </div>
  )
}

export function ControlSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <div className="mb-3 grid grid-cols-[1fr_92px] items-center gap-3 rounded-[8px] bg-[#f8f8f4] px-3 py-2 text-sm">
      <span className="font-medium text-[#242421]">{label}</span>
      <SelectLike
        value={value}
        options={options}
        placement="bottom"
        onChange={onChange}
      />
    </div>
  )
}

export function ControlToggle({
  label,
  enabled,
  onClick,
}: {
  label: string
  enabled: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      className="mb-3 flex min-h-8 w-full items-center justify-between px-1 text-sm font-medium text-[#242421]"
      onClick={onClick}
      aria-pressed={enabled}
    >
      <span>{label}</span>
      <SwitchPill enabled={enabled} />
    </button>
  )
}

export function AutomationThumb({
  theme,
  index,
}: {
  theme: string
  index: number
}) {
  if (theme === "empty") {
    return (
      <div className="relative grid h-24 place-items-center overflow-hidden bg-[#c9c9c5] text-[12px] font-semibold text-white">
        Empty post
      </div>
    )
  }

  return (
    <div
      className={cn("relative h-24 overflow-hidden", thumbTone(theme, index))}
    >
      <div className="absolute inset-x-2 top-5 text-[9px] leading-tight font-bold text-white drop-shadow">
        {index % 2 === 0 ? "5 ways to lower cortisol" : "template preview"}
      </div>
      <div className="absolute right-2 bottom-2 left-2 h-1 rounded-full bg-white/40" />
    </div>
  )
}

export function SlideThumb({
  index,
  className,
}: {
  index: number
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-[#d9d8d0]",
        thumbTone("slide", index),
        className
      )}
    >
      <div className="absolute inset-x-2 top-2 h-1 rounded-full bg-white/45" />
      <div className="absolute right-2 bottom-2 left-2 h-8 rounded bg-black/15" />
    </div>
  )
}

export function AvatarDot({
  name,
  index,
  imageUrl,
  className,
}: {
  name: string
  index: number
  imageUrl?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "grid place-items-center overflow-hidden rounded-full bg-[#ddd] bg-cover bg-center text-[10px] font-bold text-white",
        !imageUrl && avatarTone(index),
        className
      )}
      style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
    >
      {!imageUrl && name.slice(0, 1).toUpperCase()}
    </span>
  )
}

export function FieldShell({ children }: { children: ReactNode }) {
  return <>{children}</>
}

function avatarTone(index: number) {
  const tones = [
    "bg-gradient-to-br from-[#d9c5b2] via-[#b88373] to-[#4d312b]",
    "bg-gradient-to-br from-[#efe1d5] via-[#d5a087] to-[#6c4b3e]",
    "bg-gradient-to-br from-[#e6e0d9] via-[#9fa6ad] to-[#343a40]",
    "bg-gradient-to-br from-[#f2d6c9] via-[#ca8e80] to-[#6f3d3d]",
    "bg-gradient-to-br from-[#d9e5ec] via-[#86a3b8] to-[#284257]",
  ]
  return tones[index % tones.length]
}

function phoneTone(tone: string) {
  const tones: Record<string, string> = {
    sunset: "bg-gradient-to-br from-[#f4b36e] via-[#d98d70] to-[#6b6b8f]",
    warm: "bg-gradient-to-br from-[#ead6bf] via-[#bf8d76] to-[#4b3930]",
    neutral: "bg-gradient-to-br from-[#d6d0c8] via-[#9c948d] to-[#393737]",
    dark: "bg-gradient-to-br from-[#2e3135] via-[#151719] to-[#08090a]",
    blue: "bg-gradient-to-br from-[#d9eaff] via-[#83b5df] to-[#445d88]",
    soft: "bg-gradient-to-br from-[#eee8df] via-[#dbc7bc] to-[#9c8576]",
  }
  return tones[tone] ?? tones.warm
}

export function thumbTone(theme: string, index: number) {
  const tones = [
    "bg-gradient-to-br from-[#dfd2c4] via-[#a37b68] to-[#3c3532]",
    "bg-gradient-to-br from-[#c9d7ca] via-[#70915f] to-[#1f3027]",
    "bg-gradient-to-br from-[#d8e2ed] via-[#7da2c9] to-[#293d63]",
    "bg-gradient-to-br from-[#e5d8b6] via-[#b99047] to-[#30281f]",
    "bg-gradient-to-br from-[#d7d6d2] via-[#77736a] to-[#171717]",
    "bg-gradient-to-br from-[#d5c5d9] via-[#9d718e] to-[#382c3b]",
  ]
  if (theme.includes("soccer"))
    return "bg-gradient-to-br from-[#6fb46a] via-[#245b2f] to-[#111b16]"
  if (theme.includes("nature"))
    return "bg-gradient-to-br from-[#b7d596] via-[#67863c] to-[#23331e]"
  if (theme.includes("space"))
    return "bg-gradient-to-br from-[#94b3c9] via-[#5a6d98] to-[#1d2039]"
  if (theme.includes("books"))
    return "bg-gradient-to-br from-[#d4c5a3] via-[#84684b] to-[#2a221a]"
  if (theme.includes("cinema"))
    return "bg-gradient-to-br from-[#cfc7b8] via-[#826552] to-[#171313]"
  return tones[index % tones.length]
}

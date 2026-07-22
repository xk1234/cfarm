import type { ReactNode } from "react"
import { IconDots, IconPhoto, IconPlayerPlayFilled } from "@tabler/icons-react"

import { MediaCardPreview } from "@/components/ui/media-card"
import { cn } from "@/lib/utils"

import type { NetworkPreviewProps } from "./preview-types"

export function PreviewCard({
  children,
  className,
  label,
}: {
  children: ReactNode
  className?: string
  label: string
}) {
  return (
    <article
      aria-label={`${label} post preview`}
      className={cn(
        "overflow-hidden rounded-card border border-brand-border bg-brand-surface text-brand-ink shadow-app-card",
        className
      )}
      data-preview-platform={label.toLowerCase()}
    >
      {children}
    </article>
  )
}

export function PreviewHeader({
  accountName = "LumenClip Studio",
  avatarUrl,
  handle = "@lumenclip",
  meta,
}: Pick<NetworkPreviewProps, "accountName" | "avatarUrl" | "handle"> & {
  meta?: string
}) {
  return (
    <header className="flex items-center gap-3 p-4">
      {avatarUrl ? (
        // Connected-account avatars may use arbitrary remote hosts.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className="size-10 rounded-full object-cover"
          src={avatarUrl}
        />
      ) : (
        <span
          aria-hidden
          className="grid size-10 place-items-center rounded-full bg-brand-accent text-label font-bold text-app-on-strong"
        >
          LC
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-label font-semibold">{accountName}</p>
        <p className="truncate text-caption text-brand-muted">
          {handle}
          {meta ? ` · ${meta}` : ""}
        </p>
      </div>
      <IconDots className="size-5 text-brand-muted" aria-hidden />
    </header>
  )
}

export function PreviewBody({ text }: { text: string }) {
  return (
    <p className="px-4 pb-4 text-label leading-relaxed whitespace-pre-wrap">
      {text || "Your post will appear here."}
    </p>
  )
}

export function PreviewMediaBlock({
  media,
  aspect = "wide",
}: Pick<NetworkPreviewProps, "media"> & {
  aspect?: "portrait" | "square" | "wide"
}) {
  const item = media?.[0]
  if (!item) {
    return (
      <div className="grid aspect-video place-items-center bg-brand-canvas text-brand-muted">
        <IconPhoto className="size-8" aria-hidden />
      </div>
    )
  }
  return (
    <MediaCardPreview
      alt={item.alt ?? "Post media"}
      aspect={aspect}
      imageSrc={item.kind === "image" ? item.url : undefined}
      state="ready"
      videoProps={{ muted: true, playsInline: true }}
      videoSrc={item.kind === "video" ? item.url : undefined}
    >
      {item.kind === "video" ? (
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-12 place-items-center rounded-full bg-app-overlay text-app-on-strong">
            <IconPlayerPlayFilled className="size-5" aria-hidden />
          </span>
        </span>
      ) : null}
    </MediaCardPreview>
  )
}

export function ActionRow({ children }: { children: ReactNode }) {
  return (
    <footer className="flex items-center justify-around border-t border-brand-border px-3 py-3 text-caption font-medium text-brand-muted">
      {children}
    </footer>
  )
}

export function PreviewAction({
  icon,
  label,
}: {
  icon: ReactNode
  label: string
}) {
  return (
    <span className="flex items-center gap-1.5">
      {icon}
      <span>{label}</span>
    </span>
  )
}

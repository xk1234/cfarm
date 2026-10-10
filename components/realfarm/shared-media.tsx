"use client"

import type { ReactNode } from "react"

import { MediaCard } from "@/components/ui/media-card"
import type { CreatedImageCollection } from "@/lib/realfarm-collections"
import type { PinterestSearchResult } from "@/lib/pinterest-search"
import { cn } from "@/lib/utils"

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
    <MediaCard tone={danger ? "danger" : "default"} className={className}>
      {children}
    </MediaCard>
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
        No images
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
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-app-media-empty",
        !image.imageUrl && thumbTone("collection", index),
        className
      )}
      style={
        image.imageUrl
          ? {
              backgroundImage: `url(${image.imageUrl})`,
              backgroundPosition: "center",
              backgroundSize: fit,
              backgroundRepeat: "no-repeat",
            }
          : undefined
      }
    />
  )
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

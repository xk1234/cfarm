"use client"

import type { SwipeDisplayModel } from "@/components/realfarm/swipe-display-model"
import { cn } from "@/lib/utils"

export function SwipeMedia({
  swipe,
  className,
  fit = "cover",
}: {
  swipe: Pick<SwipeDisplayModel, "format" | "mediaUrl" | "screenshotPath" | "title">
  className?: string
  fit?: "cover" | "contain"
}) {
  const src = swipe.mediaUrl || swipe.screenshotPath
  const isVideo = Boolean(src && /\.(mp4|webm|mov)(\?|#|$)/i.test(src))

  return (
    <div className={cn("relative overflow-hidden bg-[#eef0ff]", className)}>
      {src && isVideo ? (
        <video
          className={cn("h-full w-full bg-black", fit === "cover" ? "object-cover" : "object-contain")}
          src={src}
          controls
          playsInline
          preload="metadata"
        />
      ) : src ? (
        <img
          className={cn("h-full w-full", fit === "cover" ? "object-cover" : "object-contain")}
          src={src}
          alt={swipe.title}
          loading="lazy"
        />
      ) : (
        <div className="grid h-full min-h-40 place-items-center text-[13px] font-semibold text-[#9b99bd]">
          No media captured
        </div>
      )}
    </div>
  )
}

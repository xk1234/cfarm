"use client"

import { cn } from "@/lib/utils"

import { useVideoThumbnailFrame } from "./use-video-thumbnail-frame"

export function GeneratedVideoThumbnail({
  videoUrl,
  className,
  preload = "metadata",
}: {
  videoUrl: string
  className?: string
  preload?: "none" | "metadata" | "auto"
}) {
  const { videoRef, thumbnailReady } = useVideoThumbnailFrame(videoUrl)

  return (
    <>
      <video
        ref={videoRef}
        src={videoUrl}
        muted
        playsInline
        preload={preload}
        aria-hidden="true"
        className={cn("absolute inset-0 h-full w-full object-cover", className)}
      />
      {!thumbnailReady ? (
        <span className="app-media-poster-fallback pointer-events-none absolute inset-0" />
      ) : null}
    </>
  )
}

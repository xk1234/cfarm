"use client"

import { useEffect, useRef, useState } from "react"

const thumbnailTimeSeconds = 0.1

export function useVideoThumbnailFrame(videoUrl?: string) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [readyVideoUrl, setReadyVideoUrl] = useState<string>()
  const thumbnailReady = Boolean(videoUrl && readyVideoUrl === videoUrl)

  useEffect(() => {
    const video = videoRef.current

    if (!video || !videoUrl) {
      return
    }

    let stopped = false

    const revealFrame = () => {
      if (stopped || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        return
      }

      const duration = Number.isFinite(video.duration) ? video.duration : 0
      const targetTime =
        duration > 0 ? Math.min(thumbnailTimeSeconds, duration / 2) : 0

      if (Math.abs(video.currentTime - targetTime) < 0.01) {
        setReadyVideoUrl(videoUrl)
        return
      }

      try {
        video.currentTime = targetTime
      } catch {
        // A later media event retries the seek when the browser has more data.
      }
    }

    const markReady = () => {
      if (!stopped) {
        setReadyVideoUrl(videoUrl)
      }
    }

    video.addEventListener("loadeddata", revealFrame)
    video.addEventListener("canplay", revealFrame)
    video.addEventListener("seeked", markReady)
    video.load()

    return () => {
      stopped = true
      video.removeEventListener("loadeddata", revealFrame)
      video.removeEventListener("canplay", revealFrame)
      video.removeEventListener("seeked", markReady)
    }
  }, [videoUrl])

  return { videoRef, thumbnailReady }
}

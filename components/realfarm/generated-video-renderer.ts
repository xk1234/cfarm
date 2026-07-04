"use client"

import { fetchJsonWithTimeout } from "@/lib/client-api"

type TextPlacement = "top" | "middle" | "bottom"

type UploadedAssetPayload = {
  asset?: {
    fileUrl?: string
  }
}

export type RenderedVideoUpload = {
  videoUrl: string
  thumbnailUrl: string
}

type UGCAdRenderInput = {
  hook: string
  avatarVideoUrl: string | null
  textPlacement: TextPlacement
}

type GreenscreenRenderInput = {
  caption: string
  memeUrl: string | null
  backgroundImageUrl?: string
  backgroundColor?: string
  textPlacement: TextPlacement
}

const CANVAS_WIDTH = 720
const CANVAS_HEIGHT = 1280
const VIDEO_DURATION_MS = 3600
const VIDEO_FPS = 24

export async function renderAndUploadUgcAdVideo(input: UGCAdRenderInput) {
  const video = input.avatarVideoUrl ? await loadVideo(input.avatarVideoUrl) : null
  if (input.avatarVideoUrl && !video) {
    throw new Error("Selected UGC avatar video could not be loaded")
  }

  const recording = await recordCanvasVideo(async ({ context }) => {
    if (video) {
      video.currentTime = 0
      await video.play().catch(() => undefined)
    }

    return () => {
      drawVerticalBackdrop(context, "#b7b7b2", "#7f858f")
      if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        drawCoverImage(context, video, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
      } else {
        drawAvatarPlaceholder(context, "UGC")
      }
      drawVignette(context)
      drawWrappedText(context, input.hook, textY(input.textPlacement), 52, 64)
    }
  })

  video?.pause()
  return uploadGeneratedVideo(recording.videoBlob, recording.thumbnailBlob, "ugc-ad", "ugc_ad")
}

export async function renderAndUploadGreenscreenVideo(input: GreenscreenRenderInput) {
  const backgroundImage = await loadSafeImage(input.backgroundImageUrl)
  const video = input.memeUrl ? await loadVideo(input.memeUrl) : null
  if (input.memeUrl && !video) {
    throw new Error("Selected greenscreen video could not be loaded")
  }

  const scratch = document.createElement("canvas")
  scratch.width = 480
  scratch.height = 600
  const scratchContext = scratch.getContext("2d", { willReadFrequently: true })

  const recording = await recordCanvasVideo(async ({ context }) => {
    if (video) {
      video.currentTime = 0
      await video.play().catch(() => undefined)
    }

    return () => {
      if (backgroundImage) {
        drawCoverImage(context, backgroundImage, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
      } else {
        drawVerticalBackdrop(context, input.backgroundColor || "#6d8f6f", "#27322f")
      }
      context.fillStyle = "rgba(0, 0, 0, 0.18)"
      context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
      drawWrappedText(context, input.caption, textY(input.textPlacement), 42, 54)
      if (video && scratchContext) {
        drawKeyedVideo(context, scratch, scratchContext, video)
      } else {
        drawAvatarPlaceholder(context, "Meme")
      }
    }
  })

  video?.pause()
  return uploadGeneratedVideo(recording.videoBlob, recording.thumbnailBlob, "greenscreen", "greenscreen")
}

async function uploadGeneratedVideo(
  videoBlob: Blob,
  thumbnailBlob: Blob,
  prefix: string,
  scope: "ugc_ad" | "greenscreen",
): Promise<RenderedVideoUpload> {
  const timestamp = Date.now()
  const extension = videoBlob.type.includes("mp4") ? "mp4" : "webm"
  const [videoUrl, thumbnailUrl] = await Promise.all([
    uploadGeneratedAsset(videoBlob, `${prefix}-${timestamp}.${extension}`, scope, `${prefix} video`),
    uploadGeneratedAsset(thumbnailBlob, `${prefix}-${timestamp}-thumbnail.jpg`, scope, `${prefix} thumbnail`),
  ])

  return { videoUrl, thumbnailUrl }
}

async function uploadGeneratedAsset(blob: Blob, fileName: string, scope: "ugc_ad" | "greenscreen", name: string) {
  const formData = new FormData()
  formData.set("file", new File([blob], fileName, { type: blob.type || "application/octet-stream" }))
  formData.set("scope", scope)
  formData.set("category", "other")
  formData.set("name", name)

  const payload = await fetchJsonWithTimeout<UploadedAssetPayload>("/api/assets/upload", {
    method: "POST",
    body: formData,
    timeoutMs: 30_000,
    toastOnError: false,
  })

  if (!payload.asset?.fileUrl) {
    throw new Error("Generated media upload failed")
  }

  return payload.asset.fileUrl
}

async function recordCanvasVideo(
  makeDrawFrame: (input: { context: CanvasRenderingContext2D }) => Promise<(elapsedMs: number) => void>,
) {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("Video recording is not supported in this browser")
  }

  const canvas = document.createElement("canvas")
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT
  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("Video canvas is not supported in this browser")
  }

  const stream = canvas.captureStream(VIDEO_FPS)
  const mimeType = preferredRecordingMimeType()
  const chunks: BlobPart[] = []
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  let elapsedMs = 0
  const drawFrame = await makeDrawFrame({ context })
  drawFrame(0)
  const thumbnailBlobPromise = canvasToBlob(canvas, "image/jpeg", 0.88)

  return new Promise<{ videoBlob: Blob; thumbnailBlob: Blob }>((resolve, reject) => {
    let frame = 0
    const start = performance.now()

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data)
      }
    })
    recorder.addEventListener("error", () => reject(new Error("Generated video recording failed")))
    recorder.addEventListener("stop", () => {
      stream.getTracks().forEach((track) => track.stop())
      const videoBlob = new Blob(chunks, { type: recorder.mimeType || "video/webm" })
      void thumbnailBlobPromise
        .then((thumbnailBlob) => resolve({ videoBlob, thumbnailBlob }))
        .catch(reject)
    })

    function tick(now: number) {
      elapsedMs = now - start
      drawFrame(elapsedMs)
      if (elapsedMs >= VIDEO_DURATION_MS) {
        cancelAnimationFrame(frame)
        recorder.stop()
        return
      }
      frame = requestAnimationFrame(tick)
    }

    recorder.start()
    frame = requestAnimationFrame(tick)
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
        return
      }
      reject(new Error("Generated video thumbnail failed"))
    }, type, quality)
  })
}

function preferredRecordingMimeType() {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ]
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || ""
}

async function loadSafeImage(src?: string | null) {
  const imageSrc = safeCanvasImageSrc(src)
  if (!imageSrc) {
    return null
  }

  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = imageSrc
  })
}

function safeCanvasImageSrc(src?: string | null) {
  if (!src) {
    return ""
  }

  if (/^\/api\/local-assets\//.test(src) || /^\/api\/image-proxy\?/.test(src)) {
    return src
  }

  try {
    const url = new URL(src, window.location.origin)
    if (url.origin === window.location.origin && url.pathname.startsWith("/api/local-assets/")) {
      return `${url.pathname}${url.search}`
    }
    if (url.protocol === "http:" || url.protocol === "https:") {
      return `/api/image-proxy?url=${encodeURIComponent(url.toString())}`
    }
  } catch {
    return ""
  }

  return ""
}

async function loadVideo(src: string) {
  return new Promise<HTMLVideoElement | null>((resolve) => {
    const video = document.createElement("video")
    const timeout = window.setTimeout(() => resolve(null), 5000)
    video.muted = true
    video.loop = true
    video.playsInline = true
    video.preload = "auto"
    video.addEventListener("loadeddata", () => {
      window.clearTimeout(timeout)
      resolve(video)
    }, { once: true })
    video.addEventListener("error", () => {
      window.clearTimeout(timeout)
      resolve(null)
    }, { once: true })
    video.src = src
  })
}

function drawVerticalBackdrop(context: CanvasRenderingContext2D, from: string, to: string) {
  const gradient = context.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
  gradient.addColorStop(0, from)
  gradient.addColorStop(1, to)
  context.fillStyle = gradient
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
}

function drawCoverImage(context: CanvasRenderingContext2D, image: CanvasImageSource, x: number, y: number, width: number, height: number) {
  const imageWidth = image instanceof HTMLVideoElement ? image.videoWidth || CANVAS_WIDTH : "naturalWidth" in image ? image.naturalWidth : CANVAS_WIDTH
  const imageHeight = image instanceof HTMLVideoElement ? image.videoHeight || CANVAS_HEIGHT : "naturalHeight" in image ? image.naturalHeight : CANVAS_HEIGHT
  const scale = Math.max(width / imageWidth, height / imageHeight)
  const scaledWidth = imageWidth * scale
  const scaledHeight = imageHeight * scale
  context.drawImage(image, (width - scaledWidth) / 2 + x, (height - scaledHeight) / 2 + y, scaledWidth, scaledHeight)
}

function drawVignette(context: CanvasRenderingContext2D) {
  const gradient = context.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
  gradient.addColorStop(0, "rgba(0,0,0,0.08)")
  gradient.addColorStop(0.55, "rgba(0,0,0,0)")
  gradient.addColorStop(1, "rgba(0,0,0,0.42)")
  context.fillStyle = gradient
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
}

function drawAvatarPlaceholder(context: CanvasRenderingContext2D, label: string) {
  context.fillStyle = "rgba(255,255,255,0.16)"
  context.beginPath()
  context.arc(CANVAS_WIDTH / 2, 420, 130, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = "rgba(255,255,255,0.2)"
  context.fillRect(210, 575, 300, 420)
  context.fillStyle = "rgba(255,255,255,0.82)"
  context.font = "700 56px sans-serif"
  context.textAlign = "center"
  context.fillText((label || "Video").slice(0, 16), CANVAS_WIDTH / 2, 1120)
}

function drawKeyedVideo(
  context: CanvasRenderingContext2D,
  scratch: HTMLCanvasElement,
  scratchContext: CanvasRenderingContext2D,
  video: HTMLVideoElement,
) {
  const videoWidth = video.videoWidth || 480
  const videoHeight = video.videoHeight || 600
  const cropWidth = Math.min(videoWidth, videoHeight * 4 / 5)
  const sourceX = Math.max(0, (videoWidth - cropWidth) / 2)
  scratchContext.clearRect(0, 0, scratch.width, scratch.height)
  scratchContext.drawImage(video, sourceX, 0, cropWidth, videoHeight, 0, 0, scratch.width, scratch.height)
  const image = scratchContext.getImageData(0, 0, scratch.width, scratch.height)
  const pixels = image.data

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index]
    const green = pixels[index + 1]
    const blue = pixels[index + 2]
    const greenDominance = green - Math.max(red, blue)
    if (green > 90 && greenDominance > 28 && green > red * 1.18 && green > blue * 1.18) {
      pixels[index + 3] = greenDominance > 70 ? 0 : Math.max(0, 180 - greenDominance * 3)
    }
  }

  scratchContext.putImageData(image, 0, 0)
  context.drawImage(scratch, 190, 610, 340, 425)
}

function drawWrappedText(context: CanvasRenderingContext2D, text: string, y: number, fontSize: number, lineHeight: number) {
  const lines = wrapText(context, text || "Generated video", CANVAS_WIDTH - 108, `900 ${fontSize}px sans-serif`)
  context.font = `900 ${fontSize}px sans-serif`
  context.textAlign = "center"
  context.lineJoin = "round"
  lines.forEach((line, index) => {
    const lineY = y + index * lineHeight
    context.strokeStyle = "rgba(0,0,0,0.82)"
    context.lineWidth = 10
    context.strokeText(line, CANVAS_WIDTH / 2, lineY)
    context.fillStyle = "#fff"
    context.fillText(line, CANVAS_WIDTH / 2, lineY)
  })
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number, font: string) {
  context.font = font
  const words = text.trim().split(/\s+/)
  const lines: string[] = []
  let current = ""

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word
    if (context.measureText(next).width <= maxWidth || !current) {
      current = next
      return
    }
    lines.push(current)
    current = word
  })
  if (current) {
    lines.push(current)
  }
  return lines.slice(0, 5)
}

function textY(placement: TextPlacement) {
  switch (placement) {
    case "top":
      return 190
    case "bottom":
      return 930
    case "middle":
    default:
      return 430
  }
}

"use client"

import { fetchJsonWithTimeout } from "@/lib/client-api"
import {
  defaultSlideshowTextStyle,
  editorFontSizeToCanvasPx,
  textFillColor,
  textStrokeColor,
  textStyleUsesStroke,
  textStyleToEditorColor,
} from "@/lib/realfarm-slideshow-text-style-config"

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
  demoVideoUrl?: string | null
  soundUrl?: string | null
  textPlacement: TextPlacement
  textItems?: UGCAdTextItem[]
}

type UGCAdTextItem = {
  text?: string
  contentDirection?: string
  staticText?: string
  textMode?: "prompt" | "static"
  fontSize?: string
  textStyle?: string
  textPosition?: TextPlacement | "center"
  textItemWidth?: string
  textAlign?: "left" | "center" | "right"
  wordLengthMax?: number
}

type GreenscreenRenderInput = {
  caption: string
  memeUrl: string | null
  backgroundImageUrl?: string
  backgroundColor?: string
  soundUrl?: string | null
  textPlacement: TextPlacement
}

type SlideshowRenderSlide = {
  image?: {
    imageUrl?: string
    dominantColor?: string
  }
  text?: string
  duration?: number
  textElements?: {
    text: string
    x: number
    y: number
    size?: string
    color?: string
  }[]
}

type SlideshowRenderInput = {
  title: string
  slides: SlideshowRenderSlide[]
  transition: string
}

export type TemplateVideoText = UGCAdTextItem & { text: string }

export type TemplateVideoSegmentInput = {
  clips: { url: string; kind: "video" | "image"; texts?: TemplateVideoText[] }[]
  clipDurationMs: number
  playFullVideo?: boolean
  transition: "cut" | "fade"
  texts: TemplateVideoText[]
}

export type TemplateVideoRenderInput = {
  templateId: string
  segments: TemplateVideoSegmentInput[]
  globalTexts: TemplateVideoText[]
  soundUrl?: string | null
}

const CANVAS_WIDTH = 720
const CANVAS_HEIGHT = 1280
const VIDEO_DURATION_MS = 3600
const VIDEO_FPS = 24
const UGC_DEMO_MAX_DURATION_MS = 8000
const UGC_DEMO_MIN_DURATION_MS = 1600
const SLIDESHOW_MIN_DURATION_MS = 1000
const SLIDESHOW_FADE_MS = 420

export async function renderAndUploadUgcAdVideo(input: UGCAdRenderInput) {
  const video = input.avatarVideoUrl
    ? await loadVideo(input.avatarVideoUrl)
    : null
  const demoVideo = input.demoVideoUrl
    ? await loadVideo(input.demoVideoUrl)
    : null
  const sound = input.soundUrl ? await loadAudio(input.soundUrl) : null
  if (input.avatarVideoUrl && !video) {
    throw new Error("Selected UGC avatar video could not be loaded")
  }
  if (input.demoVideoUrl && !demoVideo) {
    throw new Error("Selected demo video could not be loaded")
  }

  const avatarDurationMs = VIDEO_DURATION_MS
  const demoDurationMs = demoVideo ? demoSegmentDurationMs(demoVideo) : 0
  let demoStarted = false

  const recording = await recordCanvasVideo(
    async ({ context }) => {
      if (video) {
        video.currentTime = 0
        await video.play().catch(() => undefined)
      }
      if (demoVideo) {
        demoVideo.currentTime = 0
        demoVideo.pause()
      }

      return (elapsedMs) => {
        if (demoVideo && elapsedMs >= avatarDurationMs) {
          if (!demoStarted) {
            demoStarted = true
            video?.pause()
            demoVideo.currentTime = 0
            void demoVideo.play().catch(() => undefined)
          }
          if (demoVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            drawCoverImage(
              context,
              demoVideo,
              0,
              0,
              CANVAS_WIDTH,
              CANVAS_HEIGHT
            )
          } else {
            drawVerticalBackdrop(context, "#b7b7b2", "#7f858f")
            drawAvatarPlaceholder(context, "Demo")
          }
          return
        }

        drawVerticalBackdrop(context, "#b7b7b2", "#7f858f")
        if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          drawCoverImage(context, video, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
        } else {
          drawAvatarPlaceholder(context, "UGC")
        }
        drawVignette(context)
        drawUgcAdTextItems(
          context,
          input.textItems,
          input.hook,
          input.textPlacement
        )
      }
    },
    avatarDurationMs + demoDurationMs,
    sound
  )

  video?.pause()
  demoVideo?.pause()
  sound?.pause()
  return uploadGeneratedVideo(
    recording.videoBlob,
    recording.thumbnailBlob,
    "ugc-ad",
    "ugc_ad"
  )
}

const TEMPLATE_MAX_DURATION_MS = 60_000
const TEMPLATE_FADE_MS = 380
const TEMPLATE_CLIP_LOAD_TIMEOUT_MS = 20_000

type TemplateTimelineClip = {
  media: HTMLVideoElement | HTMLImageElement | null
  kind: "video" | "image"
  startMs: number
  durationMs: number
  sourceOffsetMs: number
  fadeOut: boolean
  texts: TemplateVideoText[]
}

export async function renderAndUploadTemplateVideo(
  input: TemplateVideoRenderInput
) {
  if (input.templateId === "split_screen") {
    return renderSplitScreenTemplateVideo(input)
  }
  if (input.templateId === "fake_text") {
    return renderFakeTextTemplateVideo(input)
  }

  const sound = input.soundUrl ? await loadAudio(input.soundUrl) : null
  const pendingClips = input.segments.flatMap((segment) =>
    segment.clips.map((clip) => ({
      segment,
      clip,
      mediaPromise:
        clip.kind === "video"
          ? loadVideo(clip.url, TEMPLATE_CLIP_LOAD_TIMEOUT_MS)
          : loadSafeImage(clip.url),
    }))
  )
  const clips: TemplateTimelineClip[] = []
  let cursorMs = 0

  for (const pending of pendingClips) {
    if (cursorMs >= TEMPLATE_MAX_DURATION_MS) break
    const media = await pending.mediaPromise
    if (!media) {
      throw new Error(
        `A template clip could not be loaded (${pending.clip.kind}: ${pending.clip.url})`
      )
    }
    const sourceDurationMs =
      pending.segment.playFullVideo && media instanceof HTMLVideoElement
        ? Math.round(media.duration * 1000)
        : pending.segment.clipDurationMs
    const durationMs = Math.min(
      sourceDurationMs,
      TEMPLATE_MAX_DURATION_MS - cursorMs
    )
    clips.push({
      media,
      kind: pending.clip.kind,
      startMs: cursorMs,
      durationMs,
      sourceOffsetMs: pending.segment.playFullVideo
        ? 0
        : videoSourceOffsetMs(media, durationMs),
      fadeOut: pending.segment.transition === "fade",
      texts: pending.clip.texts ?? pending.segment.texts,
    })
    cursorMs += durationMs
  }

  if (clips.length === 0) {
    throw new Error("Add at least one clip before creating a video")
  }
  await primeVideoClip(clips[0])
  const totalDurationMs = cursorMs
  const startedVideos = new Set<HTMLVideoElement>()

  function ensurePlaying(clip: TemplateTimelineClip) {
    if (clip.kind !== "video") return
    const video = clip.media as HTMLVideoElement
    if (startedVideos.has(video)) return
    startedVideos.add(video)
    video.currentTime = clip.sourceOffsetMs / 1000
    void video.play().catch(() => undefined)
  }

  function drawClip(
    context: CanvasRenderingContext2D,
    clip: TemplateTimelineClip
  ) {
    if (
      clip.kind === "video" &&
      (clip.media as HTMLVideoElement).readyState <
        HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      drawVerticalBackdrop(context, "#b7b7b2", "#7f858f")
      return
    }
    drawCoverImage(
      context,
      clip.media as CanvasImageSource,
      0,
      0,
      CANVAS_WIDTH,
      CANVAS_HEIGHT
    )
  }

  const recording = await recordCanvasVideo(
    async ({ context }) => {
      ensurePlaying(clips[0])

      return (elapsedMs) => {
        const progressMs = Math.min(elapsedMs, totalDurationMs - 1)
        let index = clips.length - 1
        for (let i = 0; i < clips.length; i += 1) {
          if (progressMs < clips[i].startMs + clips[i].durationMs) {
            index = i
            break
          }
        }
        const clip = clips[index]
        const next = clips[index + 1]
        ensurePlaying(clip)

        drawClip(context, clip)
        const remainingMs = clip.startMs + clip.durationMs - progressMs
        if (clip.fadeOut && next && remainingMs < TEMPLATE_FADE_MS) {
          ensurePlaying(next)
          context.save()
          context.globalAlpha = 1 - remainingMs / TEMPLATE_FADE_MS
          drawClip(context, next)
          context.restore()
        } else if (next && remainingMs < 250) {
          // Pre-start the upcoming video so the cut lands on a live frame.
          ensurePlaying(next)
        }

        drawVignette(context)
        clip.texts.forEach((text) => drawUgcAdTextItem(context, text))
        input.globalTexts.forEach((text) => drawUgcAdTextItem(context, text))
      }
    },
    totalDurationMs,
    sound
  )

  clips.forEach((clip) => {
    if (clip.kind === "video") (clip.media as HTMLVideoElement).pause()
  })
  sound?.pause()
  const prefix = input.templateId.replace(/_/g, "-")
  return uploadGeneratedVideo(
    recording.videoBlob,
    recording.thumbnailBlob,
    prefix,
    "global"
  )
}

type TemplateVisual = {
  media: HTMLVideoElement | HTMLImageElement
  kind: "video" | "image"
}

async function renderSplitScreenTemplateVideo(input: TemplateVideoRenderInput) {
  const [primary, secondary, sound] = await Promise.all([
    loadTemplateVisual(input.segments[0]?.clips[0]),
    loadTemplateVisual(input.segments[1]?.clips[0]),
    input.soundUrl ? loadAudio(input.soundUrl) : null,
  ])
  if (!primary || !secondary) {
    throw new Error("Split Screen needs one top video and one bottom video")
  }

  const primaryDurationMs = templateVisualDurationMs(
    primary,
    input.segments[0]?.clipDurationMs ?? 9000
  )
  const durationMs = Math.min(
    TEMPLATE_MAX_DURATION_MS,
    Math.max(1200, primaryDurationMs)
  )
  const visuals = [primary, secondary]

  const recording = await recordCanvasVideo(
    async ({ context }) => {
      startTemplateVisuals(visuals)
      return () => {
        drawTemplateVisual(
          context,
          primary,
          0,
          0,
          CANVAS_WIDTH,
          CANVAS_HEIGHT / 2
        )
        drawTemplateVisual(
          context,
          secondary,
          0,
          CANVAS_HEIGHT / 2,
          CANVAS_WIDTH,
          CANVAS_HEIGHT / 2
        )
        context.fillStyle = "rgba(255,255,255,0.92)"
        context.fillRect(0, CANVAS_HEIGHT / 2 - 3, CANVAS_WIDTH, 6)
        drawVignette(context)
        input.globalTexts.forEach((text) => drawUgcAdTextItem(context, text))
      }
    },
    durationMs,
    sound
  )

  pauseTemplateVisuals(visuals)
  sound?.pause()
  return uploadGeneratedVideo(
    recording.videoBlob,
    recording.thumbnailBlob,
    "split-screen",
    "global"
  )
}

async function renderFakeTextTemplateVideo(input: TemplateVideoRenderInput) {
  const [background, sound] = await Promise.all([
    loadTemplateVisual(input.segments[0]?.clips[0]),
    input.soundUrl ? loadAudio(input.soundUrl) : null,
  ])
  if (!background) {
    throw new Error("Fake Text Story needs a background video")
  }

  const messages = input.globalTexts
    .map((item) => ({ ...item, text: ugcTextValue(item) }))
    .filter((item) => item.text.trim())
  if (messages.length === 0) {
    throw new Error("Fake Text Story needs at least one message")
  }

  const revealIntervalMs = 1250
  const durationMs = Math.min(
    TEMPLATE_MAX_DURATION_MS,
    Math.max(
      6500,
      messages.length * revealIntervalMs + 1600,
      templateVisualDurationMs(
        background,
        input.segments[0]?.clipDurationMs ?? 9000
      )
    )
  )

  const recording = await recordCanvasVideo(
    async ({ context }) => {
      startTemplateVisuals([background])
      return (elapsedMs) => {
        drawTemplateVisual(
          context,
          background,
          0,
          0,
          CANVAS_WIDTH,
          CANVAS_HEIGHT
        )
        context.fillStyle = "rgba(0,0,0,0.48)"
        context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
        drawChatHeader(context)
        const visibleCount = Math.min(
          messages.length,
          Math.max(1, Math.floor(elapsedMs / revealIntervalMs) + 1)
        )
        drawChatMessages(context, messages.slice(0, visibleCount))
      }
    },
    durationMs,
    sound
  )

  pauseTemplateVisuals([background])
  sound?.pause()
  return uploadGeneratedVideo(
    recording.videoBlob,
    recording.thumbnailBlob,
    "fake-text-story",
    "global"
  )
}

async function loadTemplateVisual(
  clip:
    | { url: string; kind: "video" | "image"; texts?: TemplateVideoText[] }
    | undefined
): Promise<TemplateVisual | null> {
  if (!clip?.url) return null
  const media =
    clip.kind === "video"
      ? await loadVideo(clip.url, TEMPLATE_CLIP_LOAD_TIMEOUT_MS)
      : await loadSafeImage(clip.url)
  return media ? { media, kind: clip.kind } : null
}

function templateVisualDurationMs(visual: TemplateVisual, fallbackMs: number) {
  if (visual.kind !== "video") return fallbackMs
  const duration = (visual.media as HTMLVideoElement).duration
  return Number.isFinite(duration) && duration > 0
    ? Math.round(duration * 1000)
    : fallbackMs
}

function startTemplateVisuals(visuals: TemplateVisual[]) {
  visuals.forEach((visual) => {
    if (visual.kind !== "video") return
    const video = visual.media as HTMLVideoElement
    video.currentTime = 0
    video.loop = true
    void video.play().catch(() => undefined)
  })
}

function pauseTemplateVisuals(visuals: TemplateVisual[]) {
  visuals.forEach((visual) => {
    if (visual.kind === "video") {
      ;(visual.media as HTMLVideoElement).pause()
    }
  })
}

function drawTemplateVisual(
  context: CanvasRenderingContext2D,
  visual: TemplateVisual,
  x: number,
  y: number,
  width: number,
  height: number
) {
  if (
    visual.kind === "video" &&
    (visual.media as HTMLVideoElement).readyState <
      HTMLMediaElement.HAVE_CURRENT_DATA
  ) {
    context.fillStyle = "#151515"
    context.fillRect(x, y, width, height)
    return
  }
  drawCoverImage(context, visual.media, x, y, width, height)
}

function drawChatHeader(context: CanvasRenderingContext2D) {
  context.fillStyle = "rgba(12,12,14,0.9)"
  context.fillRect(0, 0, CANVAS_WIDTH, 145)
  context.fillStyle = "#4f7df3"
  context.beginPath()
  context.arc(72, 76, 38, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = "white"
  context.font = "800 26px sans-serif"
  context.textAlign = "center"
  context.fillText("FT", 72, 85)
  context.font = "800 30px sans-serif"
  context.textAlign = "left"
  context.fillText("Messages", 126, 72)
  context.fillStyle = "rgba(255,255,255,0.62)"
  context.font = "500 21px sans-serif"
  context.fillText("online", 126, 104)
}

function drawChatMessages(
  context: CanvasRenderingContext2D,
  messages: TemplateVideoText[]
) {
  const visible = messages.slice(-6)
  let y = 188
  visible.forEach((message, index) => {
    const sender = (messages.length - visible.length + index) % 2 === 1
    const font = "700 29px sans-serif"
    const lines = wrapText(context, message.text, 430, font, 3)
    const lineHeight = 38
    const bubbleWidth = Math.min(
      500,
      Math.max(180, ...lines.map((line) => context.measureText(line).width)) +
        52
    )
    const bubbleHeight = lines.length * lineHeight + 34
    const x = sender ? CANVAS_WIDTH - bubbleWidth - 32 : 32

    drawRoundedRect(
      context,
      x,
      y,
      bubbleWidth,
      bubbleHeight,
      28,
      sender ? "#3978f6" : "rgba(42,42,47,0.96)"
    )
    context.font = font
    context.textAlign = "left"
    context.fillStyle = "white"
    lines.forEach((line, lineIndex) => {
      context.fillText(line, x + 26, y + 42 + lineIndex * lineHeight)
    })
    y += bubbleHeight + 22
  })
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string
) {
  const boundedRadius = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + boundedRadius, y)
  context.lineTo(x + width - boundedRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + boundedRadius)
  context.lineTo(x + width, y + height - boundedRadius)
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - boundedRadius,
    y + height
  )
  context.lineTo(x + boundedRadius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - boundedRadius)
  context.lineTo(x, y + boundedRadius)
  context.quadraticCurveTo(x, y, x + boundedRadius, y)
  context.closePath()
  context.fillStyle = fill
  context.fill()
}

export async function renderAndUploadGreenscreenVideo(
  input: GreenscreenRenderInput
) {
  const backgroundImage = await loadSafeImage(input.backgroundImageUrl)
  const video = input.memeUrl ? await loadVideo(input.memeUrl) : null
  const sound = input.soundUrl ? await loadAudio(input.soundUrl) : null
  if (input.memeUrl && !video) {
    throw new Error("Selected greenscreen video could not be loaded")
  }

  const scratch = document.createElement("canvas")
  scratch.width = 480
  scratch.height = 600
  const scratchContext = scratch.getContext("2d", { willReadFrequently: true })

  const recording = await recordCanvasVideo(
    async ({ context }) => {
      if (video) {
        video.currentTime = 0
        await video.play().catch(() => undefined)
      }

      return () => {
        if (backgroundImage) {
          drawCoverImage(
            context,
            backgroundImage,
            0,
            0,
            CANVAS_WIDTH,
            CANVAS_HEIGHT
          )
        } else {
          drawVerticalBackdrop(
            context,
            input.backgroundColor || "#6d8f6f",
            "#27322f"
          )
        }
        context.fillStyle = "rgba(0, 0, 0, 0.18)"
        context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
        drawWrappedText(
          context,
          input.caption,
          textY(input.textPlacement),
          42,
          54
        )
        if (video && scratchContext) {
          drawKeyedVideo(context, scratch, scratchContext, video)
        } else {
          drawAvatarPlaceholder(context, "Meme")
        }
      }
    },
    VIDEO_DURATION_MS,
    sound
  )

  video?.pause()
  sound?.pause()
  return uploadGeneratedVideo(
    recording.videoBlob,
    recording.thumbnailBlob,
    "greenscreen",
    "greenscreen"
  )
}

export async function renderAndUploadSlideshowVideo(
  input: SlideshowRenderInput
) {
  if (input.slides.length === 0) {
    throw new Error("Add at least one slide before exporting video")
  }

  const slides = await Promise.all(
    input.slides.map(async (slide) => ({
      ...slide,
      imageElement: await loadSafeImage(slide.image?.imageUrl),
      durationMs: Math.max(
        SLIDESHOW_MIN_DURATION_MS,
        Math.round((slide.duration ?? 3) * 1000)
      ),
    }))
  )
  const totalDurationMs = slides.reduce(
    (total, slide) => total + slide.durationMs,
    0
  )

  const recording = await recordCanvasVideo(
    async ({ context }) =>
      (elapsedMs) => {
        const progressMs = Math.min(elapsedMs, Math.max(0, totalDurationMs - 1))
        const current = slideshowFrameAt(slides, progressMs)
        const next = slides[current.index + 1]

        drawSlideshowSlide(context, current.slide, input.title)
        if (
          input.transition === "fade" &&
          next &&
          current.remainingMs < SLIDESHOW_FADE_MS
        ) {
          context.save()
          context.globalAlpha = 1 - current.remainingMs / SLIDESHOW_FADE_MS
          drawSlideshowSlide(context, next, input.title)
          context.restore()
        }
      },
    totalDurationMs
  )

  return uploadGeneratedVideo(
    recording.videoBlob,
    recording.thumbnailBlob,
    "slideshow",
    "global"
  )
}

async function uploadGeneratedVideo(
  videoBlob: Blob,
  thumbnailBlob: Blob,
  prefix: string,
  scope: "ugc_ad" | "greenscreen" | "global"
): Promise<RenderedVideoUpload> {
  const timestamp = Date.now()
  const extension = videoBlob.type.includes("mp4") ? "mp4" : "webm"
  const [videoUrl, thumbnailUrl] = await Promise.all([
    uploadGeneratedAsset(
      videoBlob,
      `${prefix}-${timestamp}.${extension}`,
      scope,
      `${prefix} video`
    ),
    uploadGeneratedAsset(
      thumbnailBlob,
      `${prefix}-${timestamp}-thumbnail.jpg`,
      scope,
      `${prefix} thumbnail`
    ),
  ])

  return { videoUrl, thumbnailUrl }
}

async function uploadGeneratedAsset(
  blob: Blob,
  fileName: string,
  scope: "ugc_ad" | "greenscreen" | "global",
  name: string
) {
  const formData = new FormData()
  formData.set(
    "file",
    new File([blob], fileName, {
      type: blob.type || "application/octet-stream",
    })
  )
  formData.set("scope", scope)
  formData.set("category", "other")
  formData.set("name", name)

  const payload = await fetchJsonWithTimeout<UploadedAssetPayload>(
    "/api/assets/upload",
    {
      method: "POST",
      body: formData,
      timeoutMs: 120_000,
      toastOnError: false,
    }
  )

  if (!payload.asset?.fileUrl) {
    throw new Error("Generated media upload failed")
  }

  return payload.asset.fileUrl
}

async function recordCanvasVideo(
  makeDrawFrame: (input: {
    context: CanvasRenderingContext2D
  }) => Promise<(elapsedMs: number) => void>,
  durationMs = VIDEO_DURATION_MS,
  audio?: HTMLAudioElement | null
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
  const audioStream = audio ? captureAudioStream(audio) : null
  audioStream?.getAudioTracks().forEach((track) => stream.addTrack(track))
  const mimeType = preferredRecordingMimeType()
  const chunks: BlobPart[] = []
  const recorder = new MediaRecorder(
    stream,
    mimeType ? { mimeType } : undefined
  )
  let elapsedMs = 0
  const drawFrame = await makeDrawFrame({ context })
  drawFrame(0)
  const thumbnailBlobPromise = canvasToBlob(canvas, "image/jpeg", 0.88)
  if (audio) {
    audio.currentTime = 0
    audio.loop = true
    audio.volume = 0.8
  }

  return new Promise<{ videoBlob: Blob; thumbnailBlob: Blob }>(
    (resolve, reject) => {
      let frame = 0
      const start = performance.now()

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      })
      recorder.addEventListener("error", () =>
        reject(new Error("Generated video recording failed"))
      )
      recorder.addEventListener("stop", () => {
        stream.getTracks().forEach((track) => track.stop())
        audio?.pause()
        const videoBlob = new Blob(chunks, {
          type: recorder.mimeType || "video/webm",
        })
        void thumbnailBlobPromise
          .then((thumbnailBlob) => resolve({ videoBlob, thumbnailBlob }))
          .catch(reject)
      })

      function tick(now: number) {
        elapsedMs = now - start
        drawFrame(elapsedMs)
        if (elapsedMs >= durationMs) {
          cancelAnimationFrame(frame)
          recorder.stop()
          return
        }
        frame = requestAnimationFrame(tick)
      }

      recorder.start()
      void audio?.play().catch(() => undefined)
      frame = requestAnimationFrame(tick)
    }
  )
}

function captureAudioStream(audio: HTMLAudioElement) {
  const audioWithCaptureStream = audio as HTMLAudioElement & {
    captureStream?: () => MediaStream
    mozCaptureStream?: () => MediaStream
  }
  return (
    audioWithCaptureStream.captureStream?.() ??
    audioWithCaptureStream.mozCaptureStream?.() ??
    null
  )
}

function slideshowFrameAt<T extends { durationMs: number }>(
  slides: T[],
  elapsedMs: number
) {
  let cursor = 0
  for (let index = 0; index < slides.length; index += 1) {
    const slide = slides[index]
    const nextCursor = cursor + slide.durationMs
    if (elapsedMs < nextCursor || index === slides.length - 1) {
      return {
        slide,
        index,
        remainingMs: Math.max(0, nextCursor - elapsedMs),
      }
    }
    cursor = nextCursor
  }

  return {
    slide: slides[0],
    index: 0,
    remainingMs: slides[0]?.durationMs ?? 0,
  }
}

function drawSlideshowSlide(
  context: CanvasRenderingContext2D,
  slide: SlideshowRenderSlide & {
    imageElement: HTMLImageElement | null
    durationMs: number
  },
  fallbackTitle: string
) {
  if (slide.imageElement) {
    drawCoverImage(
      context,
      slide.imageElement,
      0,
      0,
      CANVAS_WIDTH,
      CANVAS_HEIGHT
    )
  } else {
    drawVerticalBackdrop(
      context,
      slide.image?.dominantColor || "#d8d6ce",
      "#242421"
    )
  }

  drawVignette(context)
  const textElements = slide.textElements?.length
    ? slide.textElements
    : [
        {
          text: slide.text || fallbackTitle,
          x: 50,
          y: 45,
          size: defaultSlideshowTextStyle.size,
          color: "White Text",
        },
      ]

  textElements.forEach((item) => {
    drawPositionedText(context, item)
  })
}

function drawPositionedText(
  context: CanvasRenderingContext2D,
  item: NonNullable<SlideshowRenderSlide["textElements"]>[number]
) {
  const fontSize = editorFontSizeToCanvasPx(item.size)
  const lines = wrapText(
    context,
    item.text || "Slideshow",
    CANVAS_WIDTH * 0.78,
    `900 ${fontSize}px sans-serif`
  )
  const lineHeight = Math.round(fontSize * 1.16)
  const x = ((Number.isFinite(item.x) ? item.x : 50) / 100) * CANVAS_WIDTH
  const y = ((Number.isFinite(item.y) ? item.y : 45) / 100) * CANVAS_HEIGHT

  context.font = `900 ${fontSize}px sans-serif`
  context.textAlign = "center"
  context.lineJoin = "round"
  lines.forEach((line, index) => {
    const lineY = y + index * lineHeight
    if (textStyleUsesStroke(item.color)) {
      context.strokeStyle = textStrokeColor(item.color)
      context.lineWidth = Math.max(6, Math.round(fontSize * 0.16))
      context.strokeText(line, x, lineY)
    }
    context.fillStyle = textFillColor(item.color)
    context.fillText(line, x, lineY)
  })
}

function drawUgcAdTextItems(
  context: CanvasRenderingContext2D,
  textItems: UGCAdTextItem[] | undefined,
  hook: string,
  fallbackPlacement: TextPlacement
) {
  const items = textItems?.length
    ? textItems.map((item, index) => ({
        ...item,
        text: index === 0 ? hook : ugcTextValue(item),
      }))
    : [
        {
          text: hook,
          fontSize: "14px",
          textStyle: "outline",
          textPosition: fallbackPlacement,
          textItemWidth: "84%",
          textAlign: "center" as const,
        },
      ]

  items.forEach((item) => {
    drawUgcAdTextItem(context, item)
  })
}

function drawUgcAdTextItem(
  context: CanvasRenderingContext2D,
  item: UGCAdTextItem
) {
  const fontSize = Math.max(34, editorFontSizeToCanvasPx(item.fontSize) * 1.45)
  const maxWidth = CANVAS_WIDTH * textWidthRatio(item.textItemWidth)
  const lines = wrapText(
    context,
    item.text || "Generated video",
    maxWidth,
    `900 ${fontSize}px sans-serif`,
    (item.wordLengthMax ?? 10) > 30 ? 18 : 5
  )
  const lineHeight = Math.round(fontSize * 1.16)
  const x = textX(item.textAlign)
  const y = textY(normalizeTextPlacement(item.textPosition))
  const editorColor = textStyleToEditorColor(item.textStyle || "outline")

  context.font = `900 ${fontSize}px sans-serif`
  context.textAlign = item.textAlign || "center"
  context.lineJoin = "round"
  const backgroundFill = textBackgroundFill(editorColor)
  if (backgroundFill) {
    context.fillStyle = backgroundFill
    lines.forEach((line, index) => {
      const lineY = y + index * lineHeight
      const metrics = context.measureText(line)
      const paddingX = Math.round(fontSize * 0.18)
      const paddingY = Math.round(fontSize * 0.07)
      const lineWidth = metrics.width
      const ascent =
        metrics.actualBoundingBoxAscent || Math.round(fontSize * 0.8)
      const descent =
        metrics.actualBoundingBoxDescent || Math.round(fontSize * 0.2)
      const left =
        context.textAlign === "left"
          ? x - paddingX
          : context.textAlign === "right"
            ? x - lineWidth - paddingX
            : x - lineWidth / 2 - paddingX

      context.fillRect(
        left,
        lineY - ascent - paddingY,
        lineWidth + paddingX * 2,
        ascent + descent + paddingY * 2
      )
    })
  }
  lines.forEach((line, index) => {
    const lineY = y + index * lineHeight
    if (textStyleUsesStroke(editorColor)) {
      context.strokeStyle = textStrokeColor(editorColor)
      context.lineWidth = Math.max(7, Math.round(fontSize * 0.15))
      context.strokeText(line, x, lineY)
    }
    context.fillStyle = textFillColor(editorColor)
    context.fillText(line, x, lineY)
  })
}

// Start a clip somewhere inside its source footage (instead of always at 0)
// so stock clips land on motion rather than their slow fade-ins.
function videoSourceOffsetMs(
  media: HTMLVideoElement | HTMLImageElement,
  clipDurationMs: number
) {
  if (!(media instanceof HTMLVideoElement)) return 0
  const sourceMs = Number.isFinite(media.duration) ? media.duration * 1000 : 0
  const headroom = sourceMs - clipDurationMs - 250
  if (headroom <= 0) return 0
  return Math.round(Math.random() * headroom)
}

// Decode the first clip's opening frame before recording starts so the video
// (and its thumbnail) never open on an empty gray frame.
async function primeVideoClip(clip: TemplateTimelineClip | undefined) {
  if (!clip || clip.kind !== "video") return
  const video = clip.media as HTMLVideoElement
  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(() => resolve(), 1500)
    video.addEventListener(
      "seeked",
      () => {
        window.clearTimeout(timeout)
        resolve()
      },
      { once: true }
    )
    video.currentTime = clip.sourceOffsetMs / 1000
  })
}

function textBackgroundFill(editorColor: string) {
  switch (editorColor) {
    case "White Background":
      return "rgba(255,255,255,0.92)"
    case "White 50% Background":
      return "rgba(255,255,255,0.55)"
    case "Black Background":
      return "rgba(0,0,0,0.92)"
    case "Black 50% Background":
      return "rgba(0,0,0,0.55)"
    default:
      return ""
  }
}

function ugcTextValue(item: UGCAdTextItem) {
  return (
    (item.textMode === "static" ? item.staticText : item.text) ||
    item.staticText ||
    item.contentDirection ||
    item.text ||
    "text element"
  )
}

function textWidthRatio(value: string | undefined) {
  const parsed = Number(value?.replace("%", ""))
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(0.2, Math.min(1, parsed / 100))
    : 0.84
}

function textX(align: UGCAdTextItem["textAlign"]) {
  if (align === "left") return CANVAS_WIDTH * 0.12
  if (align === "right") return CANVAS_WIDTH * 0.88
  return CANVAS_WIDTH / 2
}

function normalizeTextPlacement(value: UGCAdTextItem["textPosition"]) {
  if (value === "top" || value === "bottom" || value === "middle") {
    return value
  }
  return "middle"
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
          return
        }
        reject(new Error("Generated video thumbnail failed"))
      },
      type,
      quality
    )
  })
}

function preferredRecordingMimeType() {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ]
  return (
    candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ||
    ""
  )
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
    if (
      url.origin === window.location.origin &&
      url.pathname.startsWith("/api/local-assets/")
    ) {
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

async function loadVideo(src: string, timeoutMs = 5000) {
  return new Promise<HTMLVideoElement | null>((resolve) => {
    const video = document.createElement("video")
    const timeout = window.setTimeout(() => resolve(null), timeoutMs)
    video.muted = true
    video.loop = true
    video.playsInline = true
    video.preload = "auto"
    video.addEventListener(
      "loadeddata",
      () => {
        window.clearTimeout(timeout)
        resolve(video)
      },
      { once: true }
    )
    video.addEventListener(
      "error",
      () => {
        window.clearTimeout(timeout)
        resolve(null)
      },
      { once: true }
    )
    video.src = src
  })
}

async function loadAudio(src: string) {
  return new Promise<HTMLAudioElement | null>((resolve) => {
    const audio = new Audio()
    const timeout = window.setTimeout(() => resolve(null), 5000)
    audio.preload = "auto"
    audio.addEventListener(
      "canplaythrough",
      () => {
        window.clearTimeout(timeout)
        resolve(audio)
      },
      { once: true }
    )
    audio.addEventListener(
      "error",
      () => {
        window.clearTimeout(timeout)
        resolve(null)
      },
      { once: true }
    )
    audio.src = src
  })
}

function drawVerticalBackdrop(
  context: CanvasRenderingContext2D,
  from: string,
  to: string
) {
  const gradient = context.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
  gradient.addColorStop(0, from)
  gradient.addColorStop(1, to)
  context.fillStyle = gradient
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
}

function drawCoverImage(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const imageWidth =
    image instanceof HTMLVideoElement
      ? image.videoWidth || CANVAS_WIDTH
      : "naturalWidth" in image
        ? image.naturalWidth
        : CANVAS_WIDTH
  const imageHeight =
    image instanceof HTMLVideoElement
      ? image.videoHeight || CANVAS_HEIGHT
      : "naturalHeight" in image
        ? image.naturalHeight
        : CANVAS_HEIGHT
  const scale = Math.max(width / imageWidth, height / imageHeight)
  const scaledWidth = imageWidth * scale
  const scaledHeight = imageHeight * scale
  context.drawImage(
    image,
    (width - scaledWidth) / 2 + x,
    (height - scaledHeight) / 2 + y,
    scaledWidth,
    scaledHeight
  )
}

function drawVignette(context: CanvasRenderingContext2D) {
  const gradient = context.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
  gradient.addColorStop(0, "rgba(0,0,0,0.08)")
  gradient.addColorStop(0.55, "rgba(0,0,0,0)")
  gradient.addColorStop(1, "rgba(0,0,0,0.42)")
  context.fillStyle = gradient
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
}

function demoSegmentDurationMs(video: HTMLVideoElement) {
  const durationMs = Number.isFinite(video.duration)
    ? video.duration * 1000
    : VIDEO_DURATION_MS
  return Math.min(
    UGC_DEMO_MAX_DURATION_MS,
    Math.max(UGC_DEMO_MIN_DURATION_MS, Math.round(durationMs))
  )
}

function drawAvatarPlaceholder(
  context: CanvasRenderingContext2D,
  label: string
) {
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
  video: HTMLVideoElement
) {
  const videoWidth = video.videoWidth || 480
  const videoHeight = video.videoHeight || 600
  const cropWidth = Math.min(videoWidth, (videoHeight * 4) / 5)
  const sourceX = Math.max(0, (videoWidth - cropWidth) / 2)
  scratchContext.clearRect(0, 0, scratch.width, scratch.height)
  scratchContext.drawImage(
    video,
    sourceX,
    0,
    cropWidth,
    videoHeight,
    0,
    0,
    scratch.width,
    scratch.height
  )
  const image = scratchContext.getImageData(0, 0, scratch.width, scratch.height)
  const pixels = image.data

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index]
    const green = pixels[index + 1]
    const blue = pixels[index + 2]
    const greenDominance = green - Math.max(red, blue)
    if (
      green > 90 &&
      greenDominance > 28 &&
      green > red * 1.18 &&
      green > blue * 1.18
    ) {
      pixels[index + 3] =
        greenDominance > 70 ? 0 : Math.max(0, 180 - greenDominance * 3)
    }
  }

  scratchContext.putImageData(image, 0, 0)
  context.drawImage(scratch, 190, 610, 340, 425)
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  y: number,
  fontSize: number,
  lineHeight: number
) {
  const lines = wrapText(
    context,
    text || "Generated video",
    CANVAS_WIDTH - 108,
    `900 ${fontSize}px sans-serif`
  )
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

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font: string,
  maxLines = 5
) {
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
  return lines.slice(0, maxLines)
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

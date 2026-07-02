"use client"

import { useEffect, useRef, useState } from "react"
import {
  IconChevronLeft,
  IconChevronRight,
  IconSwitch,
  IconVolume,
} from "@tabler/icons-react"

import {
  BuilderStep,
  CreatorBuilderPanel,
  CreatorPageShell,
} from "@/components/realfarm/creator-ui"
import { VideoGrid } from "@/components/realfarm/shared-media"
import { Button } from "@/components/ui/button"
import type { RealFarmData } from "@/lib/realfarm-data"
import type { PinterestSearchResult } from "@/lib/pinterest-search"
import { cn } from "@/lib/utils"

export function GreenscreenMemesView({
  data,
  backgrounds,
  onCreate,
}: {
  data: RealFarmData
  backgrounds: PinterestSearchResult[]
  onCreate: () => void
}) {
  const [caption, setCaption] = useState("oh man cutting those podcast clips later is gonna be a pain")
  const [selectedMeme, setSelectedMeme] = useState(3)
  const [selectedBackground, setSelectedBackground] = useState(2)
  const [textPlacement, setTextPlacement] = useState<"top" | "middle" | "bottom">("top")
  const memes = data.assets.greenscreenMemes
  const activeMeme = memes[selectedMeme] ?? memes[0] ?? null
  const activeBackground = backgrounds[selectedBackground] ?? backgrounds[0] ?? null
  const memePageSize = 32
  const backgroundPageSize = 10
  const memePage = Math.floor(selectedMeme / memePageSize)
  const backgroundPage = Math.floor(selectedBackground / backgroundPageSize)
  const memePageCount = Math.max(1, Math.ceil(memes.length / memePageSize))
  const backgroundPageCount = Math.max(1, Math.ceil(backgrounds.length / backgroundPageSize))
  const visibleMemes = memes.slice(memePage * memePageSize, memePage * memePageSize + memePageSize)
  const visibleBackgrounds = backgrounds.slice(backgroundPage * backgroundPageSize, backgroundPage * backgroundPageSize + backgroundPageSize)

  function randomizeMeme() {
    if (memes.length === 0) {
      return
    }
    setSelectedMeme(Math.floor(Math.random() * memes.length))
  }

  function randomizeBackground() {
    if (backgrounds.length === 0) {
      return
    }
    setSelectedBackground(Math.floor(Math.random() * backgrounds.length))
  }

  function moveMemePage(direction: -1 | 1) {
    const nextPage = clampPage(memePage + direction, memePageCount)
    setSelectedMeme(Math.min(nextPage * memePageSize, Math.max(0, memes.length - 1)))
  }

  function moveBackgroundPage(direction: -1 | 1) {
    const nextPage = clampPage(backgroundPage + direction, backgroundPageCount)
    setSelectedBackground(Math.min(nextPage * backgroundPageSize, Math.max(0, backgrounds.length - 1)))
  }

  return (
    <CreatorPageShell title="Create Greenscreen Memes">
      <CreatorBuilderPanel>
        <div className="min-w-0 space-y-7">
          <BuilderStep title="Text Caption" meta="Podcast Magic⌄" labelPrefix="1.">
            <div className="max-w-[430px]">
              <input
                className="h-14 w-full rounded-[13px] bg-white px-5 text-[13px] font-semibold shadow-sm outline-none"
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
              />
              <Button variant="blueAction" size="appDefault" className="mt-2 w-full text-[12px] font-semibold">
                Generate a text caption
              </Button>
            </div>
          </BuilderStep>
          <BuilderStep
            title="Greenscreen Meme"
            count={`${memePage + 1}/${memePageCount}`}
            labelPrefix="2."
            actions={
              <>
                <button onClick={randomizeMeme} aria-label="Randomize greenscreen meme">
                  <IconSwitch className="size-3.5" />
                </button>
                <button onClick={() => moveMemePage(-1)} aria-label="Previous greenscreen meme page">
                  <IconChevronLeft className="size-3.5" />
                </button>
                <button onClick={() => moveMemePage(1)} aria-label="Next greenscreen meme page">
                  <IconChevronRight className="size-3.5" />
                </button>
              </>
            }
          >
            <div className="grid w-full max-w-[430px] grid-cols-8 gap-2">
              {visibleMemes.map((meme, index) => {
                const absoluteIndex = memePage * memePageSize + index
                return (
                  <button
                    key={meme.id}
                    className={cn(
                      "aspect-[4/5] h-12 overflow-hidden rounded-[6px] border-2 bg-[#95f58a] p-0.5 transition",
                      selectedMeme === absoluteIndex ? "border-[#2f7df1]" : "border-transparent"
                    )}
                    onClick={() => setSelectedMeme(absoluteIndex)}
                    aria-label={`Select greenscreen meme ${absoluteIndex + 1}`}
                  >
                    <video className="h-full w-full rounded-[4px] object-cover object-center" src={meme.url} muted playsInline preload="metadata" />
                  </button>
                )
              })}
            </div>
          </BuilderStep>
          <BuilderStep
            title="Background Image"
            count={`${backgroundPage + 1}/${backgroundPageCount}`}
            labelPrefix="3."
            actions={
              <>
                <button onClick={randomizeBackground} aria-label="Randomize background image">
                  <IconSwitch className="size-3.5" />
                </button>
                <button onClick={() => moveBackgroundPage(-1)} aria-label="Previous background page">
                  <IconChevronLeft className="size-3.5" />
                </button>
                <button onClick={() => moveBackgroundPage(1)} aria-label="Next background page">
                  <IconChevronRight className="size-3.5" />
                </button>
              </>
            }
          >
            <div className="flex w-full max-w-[430px] gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {visibleBackgrounds.map((background, index) => {
                const absoluteIndex = backgroundPage * backgroundPageSize + index
                return (
                  <button
                    key={background.id}
                    className={cn(
                      "h-24 w-16 shrink-0 overflow-hidden rounded-[7px] border-2 bg-white transition",
                      selectedBackground === absoluteIndex ? "border-[#2f7df1]" : "border-transparent"
                    )}
                    onClick={() => setSelectedBackground(absoluteIndex)}
                    aria-label={`Select background ${absoluteIndex + 1}`}
                  >
                    <span
                      className="block h-full w-full rounded-[5px] bg-cover bg-center"
                      style={{ backgroundColor: background.dominantColor, backgroundImage: `url(${background.imageUrl})` }}
                    />
                  </button>
                )
              })}
            </div>
          </BuilderStep>
        </div>
        <div className="min-w-0 pt-6 lg:pt-0">
          <div className="relative rounded-[10px] bg-[#bebdb8] p-5">
            <button className="absolute right-7 top-7 z-10 grid size-8 place-items-center rounded-full bg-black/35 text-white">
              <IconVolume className="size-4" />
            </button>
            <div
              className="relative mx-auto h-[390px] w-[232px] overflow-hidden rounded-[2px] bg-[#07c80f] bg-cover bg-center"
              style={activeBackground ? { backgroundColor: activeBackground.dominantColor, backgroundImage: `url(${activeBackground.imageUrl})` } : undefined}
            >
              <div className="absolute inset-0 bg-black/10" />
              <div className={cn("absolute inset-x-4 z-10 text-center text-[12px] font-extrabold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.85)]", greenscreenTextPlacementClass(textPlacement))}>
                {caption}
              </div>
              {activeMeme ? (
                <ChromaKeyGreenscreenVideo
                  className="absolute bottom-14 left-1/2 aspect-[4/5] w-1/2 -translate-x-1/2"
                  src={activeMeme.url}
                />
              ) : (
                <GreenMemeFigure index={selectedMeme} className="absolute bottom-12 left-1/2 h-48 w-36 -translate-x-1/2" large />
              )}
              <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
                {(["top", "middle", "bottom"] as const).map((placement) => (
                  <button
                    key={placement}
                    className={cn(
                      "grid size-8 place-items-center rounded-[5px] text-[#242421] shadow-sm",
                      textPlacement === placement ? "bg-white" : "bg-white/55"
                    )}
                    onClick={() => setTextPlacement(placement)}
                    aria-label={`Place text ${placement}`}
                  >
                    <TextPlacementIcon placement={placement} />
                  </button>
                ))}
              </div>
            </div>
          </div>
          <Button variant="action" size="appDefault" className="mt-4 h-11 w-full text-[14px]" onClick={onCreate}>
            Create
          </Button>
        </div>
      </CreatorBuilderPanel>
      <section className="mt-6">
        <h2 className="mb-3 text-[22px] font-semibold">My Videos <span className="text-[#a9a8a1]">(99)</span></h2>
        <VideoGrid videos={data.videos} avatarUrl={data.generatedAssets.higgsfieldCharacter.url} />
      </section>
    </CreatorPageShell>
  )
}

function ChromaKeyGreenscreenVideo({ src, className }: { src: string; className?: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) {
      return
    }

    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) {
      return
    }

    const previewCanvas = canvas
    const previewContext = context
    let frame = 0
    let stopped = false

    function sizeCanvas() {
      previewCanvas.width = 480
      previewCanvas.height = 600
    }

    function drawFrame() {
      if (stopped || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        frame = requestAnimationFrame(drawFrame)
        return
      }

      const videoWidth = video.videoWidth || 360
      const videoHeight = video.videoHeight || 640
      const cropWidth = Math.min(videoWidth, videoHeight * 4 / 5)
      const sourceX = Math.max(0, (videoWidth - cropWidth) / 2)

      previewContext.clearRect(0, 0, previewCanvas.width, previewCanvas.height)
      previewContext.drawImage(video, sourceX, 0, cropWidth, videoHeight, 0, 0, previewCanvas.width, previewCanvas.height)

      const image = previewContext.getImageData(0, 0, previewCanvas.width, previewCanvas.height)
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

      previewContext.putImageData(image, 0, 0)
      frame = requestAnimationFrame(drawFrame)
    }

    sizeCanvas()
    video.currentTime = 0
    void video.play()
    frame = requestAnimationFrame(drawFrame)

    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      video.pause()
    }
  }, [src])

  return (
    <div className={cn("overflow-hidden", className)}>
      <video ref={videoRef} className="hidden" src={src} muted playsInline autoPlay loop preload="auto" />
      <canvas ref={canvasRef} className="h-full w-full object-cover" aria-label="Greenscreen meme preview" />
    </div>
  )
}

function clampPage(page: number, pageCount: number) {
  return Math.max(0, Math.min(page, Math.max(1, pageCount) - 1))
}

function greenscreenTextPlacementClass(placement: "top" | "middle" | "bottom") {
  switch (placement) {
    case "middle":
      return "top-1/2 -translate-y-1/2"
    case "bottom":
      return "bottom-20"
    case "top":
    default:
      return "top-12"
  }
}

function TextPlacementIcon({ placement }: { placement: "top" | "middle" | "bottom" }) {
  const centerY = placement === "top" ? 9 : placement === "middle" ? 16 : 23

  return (
    <svg viewBox="0 0 28 28" className="size-5" aria-hidden="true">
      <path d="M7 5.5h14M7 22.5h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity="0.8" />
      <rect x="10" y={centerY - 3.5} width="8" height="7" rx="1.8" fill="none" stroke="currentColor" strokeWidth="2.4" />
    </svg>
  )
}

function GreenMemeFigure({ index, className, large }: { index: number; className?: string; large?: boolean }) {
  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div className={cn("absolute left-1/2 top-[18%] -translate-x-1/2 rounded-full", memeSkinTone(index), large ? "size-20" : "size-5")} />
      {index % 4 === 3 && (
        <div
          className={cn(
            "absolute left-1/2 top-0 -translate-x-1/2 rotate-[-16deg] bg-gradient-to-br from-[#e8e8e8] to-[#878787]",
            large ? "h-20 w-16" : "h-6 w-5"
          )}
          style={{ clipPath: "polygon(50% 0, 100% 100%, 0 100%)" }}
        />
      )}
      <div className={cn("absolute left-1/2 -translate-x-1/2 rounded-t-full", memeSkinTone(index), large ? "bottom-0 h-24 w-28" : "bottom-0 h-7 w-9")} />
      <div className={cn("absolute left-1/2 -translate-x-1/2 rounded-full bg-black/20", large ? "top-[34%] h-1.5 w-12" : "top-[34%] h-0.5 w-4")} />
    </div>
  )
}

function memeSkinTone(index: number) {
  const tones = [
    "bg-[#e2b69b]",
    "bg-[#c98668]",
    "bg-[#a46d56]",
    "bg-[#efc4aa]",
    "bg-[#b77a61]",
  ]
  return tones[index % tones.length]
}

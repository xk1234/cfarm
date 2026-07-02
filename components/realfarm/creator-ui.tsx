"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { IconPlayerPlay, IconUpload, IconVolume, IconX } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import type { LocalAsset } from "@/lib/realfarm-data"
import { cn } from "@/lib/utils"

export function BuilderStep({
  title,
  meta,
  count,
  labelPrefix,
  actions,
  children,
}: {
  title: string
  meta?: string
  count?: string
  labelPrefix?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div>
      <div className="mb-3 flex max-w-[430px] items-center justify-between text-[12px] font-semibold">
        <div>
          {labelPrefix && <span className="mr-1">{labelPrefix}</span>}
          <span>{title}</span>
          {meta && <span className="ml-2 text-[11px] text-[#77766f]">{meta}</span>}
        </div>
        <div className="flex items-center gap-2 text-[#8f8e87]">
          {actions}
          {count && <span>{count}</span>}
        </div>
      </div>
      {children}
    </div>
  )
}

export function CreatorPageShell({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("mx-auto max-w-[1160px]", className)}>
      <h1 className="mb-4 text-[22px] font-semibold tracking-normal text-[#30302e]">{title}</h1>
      {children}
    </div>
  )
}

export function CreatorBuilderPanel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "grid overflow-hidden rounded-[12px] border border-[#d8d7d0] bg-[#efefea] p-4 shadow-[0_1px_2px_rgba(30,30,25,0.05)] sm:p-7 lg:grid-cols-[minmax(0,1fr)_520px] lg:gap-5",
        className
      )}
    >
      {children}
    </section>
  )
}

export function SoundSelector({
  selectedSound,
  music,
  onSelect,
  compact = false,
  variant = "default",
}: {
  selectedSound: LocalAsset | null
  music: LocalAsset[]
  onSelect: (id: string) => void
  compact?: boolean
  variant?: "default" | "ugc" | "sound"
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<"templates" | "uploaded">("templates")
  const [playingSoundId, setPlayingSoundId] = useState<string | null>(null)
  const [uploadedSounds, setUploadedSounds] = useState<LocalAsset[]>([])
  const [localSelectedSound, setLocalSelectedSound] = useState<LocalAsset | null>(null)
  const [uploading, setUploading] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const currentSound = selectedSound ?? localSelectedSound
  const currentLabel = currentSound?.name ?? "No Sound"
  const templateSounds = music.slice(0, 72)

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
    }
  }, [])

  function closeModal() {
    audioRef.current?.pause()
    setPlayingSoundId(null)
    setOpen(false)
  }

  async function previewSound(sound: LocalAsset) {
    if (!audioRef.current) {
      audioRef.current = new Audio()
      audioRef.current.addEventListener("ended", () => setPlayingSoundId(null))
    }

    if (playingSoundId === sound.id) {
      audioRef.current.pause()
      setPlayingSoundId(null)
      return
    }

    audioRef.current.pause()
    audioRef.current.src = sound.url
    audioRef.current.currentTime = 0
    setPlayingSoundId(sound.id)
    await audioRef.current.play().catch(() => setPlayingSoundId(null))
  }

  async function uploadAudio(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file) {
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.set("file", file)
      const response = await fetch("/api/local-assets/upload", {
        method: "POST",
        body: formData,
      })
      const payload = (await response.json()) as { asset?: LocalAsset; error?: string }
      if (!response.ok || !payload.asset) {
        throw new Error(payload.error ?? "Upload failed")
      }
      setUploadedSounds((current) => [payload.asset!, ...current])
      setLocalSelectedSound(payload.asset)
      onSelect(payload.asset.id)
      setTab("uploaded")
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      {variant === "ugc" ? (
        <Button
          variant="softControl"
          className="h-11 w-[130px] justify-start gap-2 rounded-[9px] px-3 text-[14px] font-bold text-[#111] hover:bg-app-control-bg"
          onClick={() => setOpen(true)}
        >
          <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-[5px] bg-[#ddd]">
            {selectedSound ? <IconPlayerPlay className="size-4" /> : <IconVolume className="size-4" />}
          </span>
          Sound
        </Button>
      ) : variant === "sound" ? (
        <Button
          variant="softControl"
          className="h-12 min-w-[116px] justify-center gap-2 rounded-[10px] px-4 text-[18px] font-semibold text-[#111] hover:bg-app-control-bg"
          onClick={() => setOpen(true)}
        >
          <IconX className="size-4" />
          Sound
        </Button>
      ) : (
        <Button
          variant="softControl"
          className={cn("w-full max-w-[240px] justify-start rounded-[9px] px-3 text-[13px] font-semibold", compact ? "h-10" : "h-11")}
          onClick={() => setOpen(true)}
        >
          <IconVolume className="size-4" />
          <span className="truncate">Background music: {currentLabel}</span>
        </Button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#24251f]/35 p-4">
          <section className="w-full max-w-[760px] overflow-hidden rounded-[6px] bg-white p-3 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[19px] font-semibold">Choose background music</h2>
              <button
                className="grid size-8 place-items-center rounded-full text-[#55544f] hover:bg-[#f1f0eb]"
                onClick={closeModal}
                aria-label="Close background music picker"
              >
                <IconX className="size-6" />
              </button>
            </div>
            <div className="mb-3 grid grid-cols-2 rounded-[7px] bg-[#f1f1f1] p-1">
              <button
                className={cn("h-8 rounded-[6px] text-[14px] font-semibold", tab === "templates" ? "border border-[#dfdfdf] bg-white shadow-sm" : "text-[#6d6c67]")}
                onClick={() => setTab("templates")}
              >
                Templates
              </button>
              <button
                className={cn("h-8 rounded-[6px] text-[14px] font-semibold", tab === "uploaded" ? "border-2 border-[#111] bg-white" : "text-[#6d6c67]")}
                onClick={() => setTab("uploaded")}
              >
                Uploaded Sounds
              </button>
            </div>

            {tab === "templates" ? (
              <div className="max-h-[430px] overflow-y-auto border-2 border-[#242421] px-5 py-4">
                <div className="grid gap-x-6 gap-y-4 md:grid-cols-3">
                  <MusicOption
                    sound={null}
                    selected={!currentSound}
                    index={0}
                    onSelect={() => {
                      onSelect("")
                      closeModal()
                    }}
                  />
                  {templateSounds.map((sound, index) => (
                    <MusicOption
                      key={`${sound.id}-${index}`}
                      sound={sound}
                      selected={currentSound?.id === sound.id}
                      playing={playingSoundId === sound.id}
                      index={index + 1}
                      onPreview={() => void previewSound(sound)}
                      onSelect={() => {
                        onSelect(sound.id)
                        closeModal()
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-[#f8f8f8] px-4 py-4">
                <input
                  ref={uploadInputRef}
                  className="hidden"
                  type="file"
                  accept="audio/mpeg,audio/wav,.mp3,.wav"
                  onChange={(event) => {
                    void uploadAudio(event.currentTarget.files)
                    event.currentTarget.value = ""
                  }}
                />
                <Button
                  variant="blueAction"
                  size="appDefault"
                  className="rounded-[6px] px-4 text-[14px] font-semibold"
                  onClick={() => uploadInputRef.current?.click()}
                  disabled={uploading}
                >
                  <IconUpload className="size-4" />
                  {uploading ? "Uploading..." : "Upload audio"}
                </Button>
                {uploadedSounds.length === 0 ? (
                  <div className="grid h-28 place-items-center text-[18px] font-medium text-[#667085]">
                    No uploaded sounds yet
                  </div>
                ) : (
                  <div className="mt-4 grid max-h-[250px] gap-x-6 gap-y-4 overflow-y-auto md:grid-cols-3">
                    {uploadedSounds.map((sound, index) => (
                      <MusicOption
                        key={sound.id}
                        sound={sound}
                        selected={currentSound?.id === sound.id}
                        playing={playingSoundId === sound.id}
                        index={index}
                        onPreview={() => void previewSound(sound)}
                        onSelect={() => {
                          setLocalSelectedSound(sound)
                          onSelect(sound.id)
                          closeModal()
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  )
}

function MusicOption({
  sound,
  selected,
  playing = false,
  index,
  onPreview,
  onSelect,
}: {
  sound: LocalAsset | null
  selected: boolean
  playing?: boolean
  index: number
  onPreview?: () => void
  onSelect: () => void
}) {
  return (
    <div
      className={cn(
        "flex h-[58px] items-center gap-3 rounded-[7px] px-2 text-left transition",
        selected ? "bg-[#68a9f4] text-white" : "hover:bg-[#f1f1f1]"
      )}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onSelect()
        }
      }}
    >
      <button
        type="button"
        className={cn(
          "relative grid size-[42px] shrink-0 place-items-center overflow-hidden rounded-[9px] text-white",
          sound ? musicThumbTone(index) : "bg-[#e6ebe9] text-[#77766f]"
        )}
        onClick={(event) => {
          event.stopPropagation()
          onPreview?.()
        }}
        disabled={!sound}
        aria-label={sound ? `${playing ? "Pause" : "Play"} ${sound.name}` : "No sound"}
      >
        {sound ? (
          playing ? <span className="text-[16px] font-black leading-none">II</span> : <IconPlayerPlay className="size-5 fill-current drop-shadow" />
        ) : (
          <IconX className="size-5" />
        )}
      </button>
      <span className={cn("line-clamp-2 text-[15px] font-bold leading-[19px]", selected ? "text-white" : "text-[#111]")}>
        {sound?.name ?? "No Sound"}
      </span>
    </div>
  )
}

function musicThumbTone(index: number) {
  const tones = [
    "bg-gradient-to-br from-[#a67c5f] via-[#27221e] to-[#0f0f11]",
    "bg-gradient-to-br from-[#e85f97] via-[#3d1630] to-[#08080b]",
    "bg-gradient-to-br from-[#43dc72] via-[#0a8d4b] to-[#07110c]",
    "bg-gradient-to-br from-[#dbe2e8] via-[#697780] to-[#111316]",
    "bg-gradient-to-br from-[#5bd4e8] via-[#0d6684] to-[#03151d]",
    "bg-gradient-to-br from-[#ff2119] via-[#f0b42c] to-[#111]",
    "bg-gradient-to-br from-[#ececec] via-[#101010] to-[#cfcfcf]",
    "bg-gradient-to-br from-[#101010] via-[#222] to-[#555]",
  ]

  return tones[index % tones.length]
}

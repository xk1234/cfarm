"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  IconChevronRight,
  IconPlayerPlay,
  IconUpload,
  IconVolume,
  IconX,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import { UploadDropzone } from "@/components/ui/upload-dropzone"
import { fetchJsonWithTimeout } from "@/lib/client-api"
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
          {meta && <span className="ml-2 text-[11px] text-app-muted-text">{meta}</span>}
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
        "grid overflow-hidden rounded-[12px] border border-app-panel-border bg-[#efefea] p-4 shadow-[0_1px_2px_rgba(30,30,25,0.05)] sm:p-7 lg:grid-cols-[minmax(0,1fr)_520px] lg:gap-5",
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
  variant = "default",
  emptyLabel = "No Sound",
}: {
  selectedSound: LocalAsset | null
  music: LocalAsset[]
  onSelect: (id: string, sound?: LocalAsset | null) => void
  compact?: boolean
  variant?: "default" | "ugc" | "sound" | "settingsSound"
  emptyLabel?: string
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
  const currentLabel = currentSound?.name ?? emptyLabel
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
      const payload = await fetchJsonWithTimeout<{ asset?: LocalAsset }>("/api/local-assets/upload", {
        method: "POST",
        body: formData,
      })
      if (!payload.asset) {
        throw new Error("Upload failed")
      }
      setUploadedSounds((current) => [payload.asset!, ...current])
      setLocalSelectedSound(payload.asset)
      onSelect(payload.asset.id, payload.asset)
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
          className="w-[130px] justify-start gap-2"
          onClick={() => setOpen(true)}
        >
          <span className={cn(
            "grid size-7 shrink-0 place-items-center overflow-hidden rounded-[5px] text-white",
            currentSound ? musicThumbTone(music.findIndex((s) => s.id === currentSound.id)) : "bg-[#ddd] text-app-muted-text"
          )}>
            {currentSound ? <IconPlayerPlay className="size-4" /> : <IconVolume className="size-4" />}
          </span>
          {currentSound ? (currentSound.name.length > 8 ? currentSound.name.slice(0, 8) + "..." : currentSound.name) : emptyLabel}
        </Button>
      ) : variant === "settingsSound" ? (
        <Button
          type="button"
          variant="softControl"
          size="settingsRow"
          className="justify-between"
          onClick={() => setOpen(true)}
        >
          <span className="flex min-w-0 items-center gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-app-action/65 text-white">
              <IconVolume className="size-8" />
            </span>
            <span className="min-w-0">
              <span className="block text-[16px] font-semibold text-app-muted-text">
                TikTok Sounds
              </span>
              <span className="mt-1 block truncate text-[14px] font-medium text-app-text-faint">
                {currentSound?.name ||
                  "All sounds - a random song will be selected"}
              </span>
            </span>
          </span>
          <IconChevronRight className="size-5 shrink-0 text-[#b0afa8]" />
        </Button>
      ) : variant === "sound" ? (
        <Button
          variant="softControl"
          className="min-w-[116px] justify-center gap-2"
          onClick={() => setOpen(true)}
        >
          <IconX className="size-4" />
          Sound
        </Button>
      ) : (
        <Button
          variant="softControl"
          className="w-full max-w-[240px] justify-start"
          onClick={() => setOpen(true)}
        >
          <IconVolume className="size-4" />
          <span className="truncate">Background music: {currentLabel}</span>
        </Button>
      )}
      {open && (
        <AppModal className="bg-[#24251f]/35" onClose={closeModal}>
          <AppModalPanel className="max-w-[760px] p-3">
            <AppModalHeader title="Choose background music" closeLabel="Close background music picker" onClose={closeModal} />
            <div className="mb-3 grid grid-cols-2 rounded-[7px] bg-[#f1f1f1] p-1">
              <button
                className={cn("h-8 rounded-[6px] text-[14px] font-semibold", tab === "templates" ? "border border-[#dfdfdf] bg-app-surface shadow-sm" : "text-[#6d6c67]")}
                onClick={() => setTab("templates")}
              >
                Templates
              </button>
              <button
                className={cn("h-8 rounded-[6px] text-[14px] font-semibold", tab === "uploaded" ? "border-2 border-[#111] bg-app-surface" : "text-[#6d6c67]")}
                onClick={() => setTab("uploaded")}
              >
                Uploaded Sounds
              </button>
            </div>

            {tab === "templates" ? (
              <div className="max-h-[430px] overflow-y-auto border-2 border-app-strong px-5 py-4">
                <div className="grid gap-x-6 gap-y-4 md:grid-cols-3">
                  <MusicOption
                    sound={null}
                    selected={!currentSound}
                    index={0}
                    emptyLabel={emptyLabel}
                    onSelect={() => {
                      onSelect("", null)
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
                        onSelect(sound.id, sound)
                        closeModal()
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-[#f8f8f8] px-4 py-4">
                <UploadDropzone
                  inputRef={uploadInputRef}
                  accept="audio/mpeg,audio/wav,.mp3,.wav"
                  className="min-h-20"
                  onFiles={(files) => void uploadAudio(files)}
                >
                  <IconUpload className="size-4" />
                  <span className="text-[15px] font-bold text-app-text">{uploading ? "Uploading..." : "Upload audio"}</span>
                </UploadDropzone>
                {uploadedSounds.length === 0 ? (
                  <div className="grid h-28 place-items-center text-[18px] font-medium text-app-muted-text">
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
                          onSelect(sound.id, sound)
                          closeModal()
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </AppModalPanel>
        </AppModal>
      )}
    </>
  )
}

function MusicOption({
  sound,
  selected,
  playing = false,
  index,
  emptyLabel = "No Sound",
  onPreview,
  onSelect,
}: {
  sound: LocalAsset | null
  selected: boolean
  playing?: boolean
  index: number
  emptyLabel?: string
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
          sound ? musicThumbTone(index) : "bg-[#e6ebe9] text-app-muted-text"
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
      <span className={cn("line-clamp-2 text-[15px] font-bold leading-[19px]", selected ? "text-white" : "text-app-text")}>
        {sound?.name ?? emptyLabel}
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

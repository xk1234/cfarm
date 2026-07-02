"use client"

import { useState } from "react"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"

import {
  BuilderStep,
  CreatorBuilderPanel,
  CreatorPageShell,
  SoundSelector,
} from "@/components/realfarm/creator-ui"
import { Button } from "@/components/ui/button"
import type { LocalAsset, RealFarmData } from "@/lib/realfarm-data"
import { cn } from "@/lib/utils"

export function UGCAdsView({
  data,
  selectedSound,
  music,
  onSoundSelect,
  onCreate,
}: {
  data: RealFarmData
  selectedSound: LocalAsset | null
  music: LocalAsset[]
  onSoundSelect: (id: string) => void
  onCreate: () => void
}) {
  const avatars: string[] = []
  const demos = ["None", "Add"]
  const [hooks, setHooks] = useState(data.ugcAds.hooks)
  const [selectedHook, setSelectedHook] = useState(data.ugcAds.selectedHook)
  const [selectedAvatar, setSelectedAvatar] = useState<number | null>(null)
  const [avatarPage, setAvatarPage] = useState(0)
  const [selectedDemo, setSelectedDemo] = useState(0)
  const [textPlacement, setTextPlacement] = useState<"top" | "middle" | "bottom">("middle")
  const activeHook = hooks[selectedHook] ?? hooks[0] ?? "wait so i just found out most remote workers are burning out because they never actually log off"
  const avatarPageSize = 24
  const avatarPageCount = Math.ceil(avatars.length / avatarPageSize)
  const visibleAvatars = avatars.slice(avatarPage * avatarPageSize, avatarPage * avatarPageSize + avatarPageSize)

  function moveHook(direction: -1 | 1) {
    if (hooks.length === 0) {
      return
    }
    setSelectedHook((current) => (current + direction + hooks.length) % hooks.length)
  }

  function updateActiveHook(value: string) {
    setHooks((current) => {
      if (current.length === 0) {
        return [value]
      }

      return current.map((hook, index) => index === selectedHook ? value : hook)
    })
  }

  function moveAvatarPage(direction: -1 | 1) {
    if (avatarPageCount === 0) {
      return
    }
    const nextPage = clampPage(avatarPage + direction, avatarPageCount)
    setAvatarPage(nextPage)
    setSelectedAvatar(Math.min(nextPage * avatarPageSize, Math.max(0, avatars.length - 1)))
  }

  return (
    <CreatorPageShell title="Create UGC ads">
      <CreatorBuilderPanel>
        <div className="min-w-0 space-y-7">
          <BuilderStep title="Hook" count={`${Math.min(selectedHook + 1, Math.max(1, hooks.length))}/${Math.max(1, hooks.length)}`} labelPrefix="1.">
            <div className="flex h-20 max-w-[430px] items-center gap-3 rounded-[16px] bg-white px-4 text-center shadow-sm">
              <button className="grid size-7 shrink-0 place-items-center text-[#6f7888]" onClick={() => moveHook(-1)} aria-label="Previous hook">
                <IconChevronLeft className="size-5" />
              </button>
              <textarea
                className="font-tiktok min-w-0 flex-1 resize-none bg-transparent text-center text-[15px] font-bold leading-snug text-[#111] outline-none"
                value={activeHook}
                onChange={(event) => updateActiveHook(event.target.value)}
                aria-label="Edit UGC ad hook"
              />
              <button className="grid size-7 shrink-0 place-items-center text-[#6f7888]" onClick={() => moveHook(1)} aria-label="Next hook">
                <IconChevronRight className="size-5" />
              </button>
            </div>
          </BuilderStep>

          <BuilderStep
            title="AI avatar"
            labelPrefix="2."
            actions={
              <>
                <div className="mr-1 flex gap-2 text-[12px] font-bold text-[#242421]">
                  <button>Default</button>
                  <button className="text-[#8f8e87]">My UGC</button>
                </div>
                {avatarPageCount > 0 && (
                  <>
                    <button className="disabled:opacity-35" onClick={() => moveAvatarPage(-1)} disabled={avatarPage === 0} aria-label="Previous avatar page"><IconChevronLeft className="size-3.5" /></button>
                    <span>{avatarPage + 1}/{avatarPageCount}</span>
                    <button className="disabled:opacity-35" onClick={() => moveAvatarPage(1)} disabled={avatarPage === avatarPageCount - 1} aria-label="Next avatar page"><IconChevronRight className="size-3.5" /></button>
                  </>
                )}
              </>
            }
          >
            {visibleAvatars.length > 0 ? (
              <div className="grid max-w-[430px] grid-cols-8 gap-2">
                {visibleAvatars.map((avatar, index) => {
                  const absoluteIndex = avatarPage * avatarPageSize + index
                  return (
                    <button
                      key={`${avatar}-${absoluteIndex}`}
                      className={cn(
                        "grid aspect-square place-items-center overflow-hidden rounded-[7px] border-2 bg-white transition",
                        selectedAvatar === absoluteIndex ? "border-[#2f7df1]" : "border-transparent opacity-80 hover:opacity-100"
                      )}
                      onClick={() => setSelectedAvatar(absoluteIndex)}
                      aria-label={`Select avatar ${avatar}`}
                    >
                      <span className="grid h-full w-full place-items-center rounded-[5px] bg-[#deded7] text-[10px] font-semibold text-[#77766f]">{avatar}</span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="grid h-24 max-w-[430px] place-items-center rounded-[10px] border border-dashed border-[#c9c8c0] bg-[#f3f3ee] text-center text-[13px] font-semibold text-[#77766f]">
                No AI avatars yet
              </div>
            )}
          </BuilderStep>

          <BuilderStep title="Demos" labelPrefix="3.">
            <div className="flex gap-2">
              {demos.slice(0, 2).map((demo, index) => (
                <button
                  key={demo}
                  className={cn(
                    "grid h-24 w-16 place-items-center rounded-[8px] border-2 bg-[#deded7] text-[13px] font-semibold text-[#77766f]",
                    selectedDemo === index ? "border-[#2f7df1]" : "border-transparent"
                  )}
                  onClick={() => setSelectedDemo(index)}
                >
                  <span className="text-center">
                    <span className="block text-[24px] font-normal">{index === 0 ? "×" : "+"}</span>
                    {index === 0 && <span className="text-[13px]">{demo}</span>}
                  </span>
                </button>
              ))}
            </div>
          </BuilderStep>
        </div>

        <div className="min-w-0 pt-6 lg:pt-0">
          <div className="relative rounded-[10px] bg-[#bebdb8] p-5">
            <div className="relative mx-auto h-[390px] w-[220px] overflow-hidden bg-[#b7b7b2]">
              {selectedAvatar === null && (
                <div className="absolute inset-0 grid place-items-center px-6 text-center text-[13px] font-semibold text-[#77766f]">
                  Select or create an AI avatar to preview the ad.
                </div>
              )}
              <div className={cn("font-tiktok absolute inset-x-[14%] z-10 text-center text-[18px] font-black leading-tight text-white drop-shadow-[0_2px_2px_rgba(0,0,0,.9)]", ugcTextPlacementClass(textPlacement))}>
                {activeHook}
              </div>
              <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
                {(["top", "middle", "bottom"] as const).map((placement) => (
                  <button
                    key={placement}
                    className={cn("grid size-8 place-items-center rounded-[5px] shadow-sm", textPlacement === placement ? "bg-white text-[#111]" : "bg-white/55 text-[#555]")}
                    onClick={() => setTextPlacement(placement)}
                    aria-label={`Place UGC ad text ${placement}`}
                  >
                    <TextPlacementIcon placement={placement} />
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <SoundSelector
              selectedSound={selectedSound}
              music={music}
              onSelect={onSoundSelect}
              compact
              variant="ugc"
            />
            <Button variant="action" size="appDefault" className="h-11 flex-1 rounded-[9px] text-[14px] font-semibold" onClick={onCreate}>
              Create
            </Button>
          </div>
        </div>
      </CreatorBuilderPanel>
    </CreatorPageShell>
  )
}

function ugcTextPlacementClass(placement: "top" | "middle" | "bottom") {
  switch (placement) {
    case "top":
      return "top-[18%]"
    case "bottom":
      return "bottom-[20%]"
    case "middle":
    default:
      return "top-[31%]"
  }
}

function TextPlacementIcon({ placement }: { placement: "top" | "middle" | "bottom" }) {
  return (
    <span className={cn("relative block h-5 w-5", placement === "top" && "pt-0", placement === "middle" && "pt-1.5", placement === "bottom" && "pt-3")}>
      <span className="mx-auto block h-0.5 w-4 rounded-full bg-current" />
      <span className="mx-auto mt-1 block h-1.5 w-2 rounded-sm border-2 border-current" />
      <span className="mx-auto mt-1 block h-0.5 w-4 rounded-full bg-current" />
    </span>
  )
}

function clampPage(page: number, pageCount: number) {
  return Math.min(Math.max(page, 0), Math.max(0, pageCount - 1))
}

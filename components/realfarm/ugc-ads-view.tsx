"use client"

import { useEffect, useRef, useState } from "react"
import { IconChevronLeft, IconChevronRight, IconPlus, IconUpload } from "@tabler/icons-react"
import { toast } from "sonner"

import { GeneratedVideoExports } from "@/components/realfarm/generated-video-exports"
import { renderAndUploadUgcAdVideo } from "@/components/realfarm/generated-video-renderer"
import {
  createGeneratedVideoExportRecord,
  updateGeneratedVideoExportRecord,
  useGeneratedVideoExports,
} from "@/components/realfarm/generated-video-workflow"
import {
  BuilderStep,
  CreatorBuilderPanel,
  CreatorPageShell,
  SoundSelector,
} from "@/components/realfarm/creator-ui"
import { Button } from "@/components/ui/button"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import { UploadDropzone } from "@/components/ui/upload-dropzone"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import type { AssetRecord } from "@/lib/assets"
import type { GeneratedVideoExport } from "@/lib/generated-video-types"
import type { LocalAsset, RealFarmData } from "@/lib/realfarm-data"
import { getOrderedUgcAvatarVideos } from "@/lib/ugc-avatar-videos"
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
  onCreate?: () => void
}) {
  const avatars = getOrderedUgcAvatarVideos(data)
  const demos = data.ugcAds.demos
  const [hooks, setHooks] = useState(data.ugcAds.hooks)
  const [selectedHook, setSelectedHook] = useState(data.ugcAds.selectedHook)
  const [selectedAvatar, setSelectedAvatar] = useState<number | null>(avatars.length > 0 ? Math.min(data.ugcAds.selectedAvatar, avatars.length - 1) : null)
  const [avatarPage, setAvatarPage] = useState(0)
  const [selectedDemoAssetId, setSelectedDemoAssetId] = useState<string | null>(null)
  const [demoAssets, setDemoAssets] = useState<AssetRecord[]>([])
  const [demoAssetsLoading, setDemoAssetsLoading] = useState(true)
  const [demoAssetsError, setDemoAssetsError] = useState("")
  const [demoPickerOpen, setDemoPickerOpen] = useState(false)
  const [textPlacement, setTextPlacement] = useState<"top" | "middle" | "bottom">("middle")
  const [exports, setExports] = useGeneratedVideoExports("ugc_ad", "Failed to load AI UGC exports")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")
  const activeHook = hooks[selectedHook] ?? hooks[0] ?? "wait so i just found out most remote workers are burning out because they never actually log off"
  const activeAvatar = selectedAvatar === null ? null : avatars[selectedAvatar] ?? null
  const activeDemoAsset = demoAssets.find((asset) => asset.id === selectedDemoAssetId) ?? null
  const activeDemo = activeDemoAsset?.name ?? demos[0] ?? "None"
  const avatarPageSize = 24
  const avatarPageCount = Math.ceil(avatars.length / avatarPageSize)
  const visibleAvatars = avatars.slice(avatarPage * avatarPageSize, avatarPage * avatarPageSize + avatarPageSize)

  useEffect(() => {
    let active = true

    void fetchJsonWithTimeout<{ assets?: AssetRecord[] }>("/api/assets?scope=ugc_demo&kind=video", {
      cache: "no-store",
      timeoutMs: 12_000,
      toastOnError: false,
    })
      .then((payload) => {
        if (active) {
          setDemoAssets(payload.assets ?? [])
        }
      })
      .catch((loadError) => {
        if (active) {
          const message = getApiErrorMessage(loadError, "Failed to load demo videos")
          setDemoAssets([])
          setDemoAssetsError(message)
          toast.error(message)
        }
      })
      .finally(() => {
        if (active) {
          setDemoAssetsLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

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

  async function createUgcAdExport() {
    if (!activeAvatar) {
      setError("Select an AI avatar before creating a UGC ad export")
      return
    }

    setCreating(true)
    setError("")
    let exportRecord: GeneratedVideoExport | null = null

    try {
      exportRecord = await createGeneratedVideoExportRecord({
        type: "ugc_ad",
        status: "processing",
        title: activeHook,
        caption: activeHook,
        sourceConfig: {
          hook: activeHook,
          selectedHook,
          avatar: activeAvatar,
          selectedAvatar,
          demo: activeDemo,
          demoAsset: activeDemoAsset,
          selectedDemo: selectedDemoAssetId ?? "none",
          sound: selectedSound,
          textPlacement,
        },
        previewUrl: undefined,
      }, "Failed to create AI UGC ad export")
      setExports((current) => [exportRecord!, ...current.filter((item) => item.id !== exportRecord!.id)])

      const renderedVideo = await renderAndUploadUgcAdVideo({
        hook: activeHook,
        avatarVideoUrl: activeAvatar.url,
        textPlacement,
      })
      const payload = await updateGeneratedVideoExportRecord(exportRecord.id, {
        status: "ready",
        previewUrl: renderedVideo.thumbnailUrl,
        videoUrl: renderedVideo.videoUrl,
      }, "Failed to update AI UGC ad export")

      setExports((current) => current.map((item) => item.id === payload.id ? payload : item))
      onCreate?.()
    } catch (caught) {
      const message = getApiErrorMessage(caught, "Failed to create AI UGC ad export")
      setError(message)
      if (exportRecord) {
        const failedExport = await updateGeneratedVideoExportRecord(exportRecord.id, {
          status: "failed",
          error: message,
        }, "Failed to update AI UGC ad export").catch(() => null)

        if (failedExport) {
          setExports((current) => current.map((item) => item.id === failedExport.id ? failedExport : item))
        }
      }
    } finally {
      setCreating(false)
    }
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
                        selectedAvatar === absoluteIndex ? "border-app-action" : "border-transparent opacity-80 hover:opacity-100"
                      )}
                      onClick={() => setSelectedAvatar(absoluteIndex)}
                      aria-label={`Select avatar ${absoluteIndex + 1}`}
                    >
                      <AvatarTile avatar={avatar} label={`${absoluteIndex + 1}`} />
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
              <button
                type="button"
                className={cn(
                  "grid h-24 w-16 place-items-center rounded-[8px] border-2 bg-[#deded7] text-[13px] font-semibold text-[#77766f]",
                  selectedDemoAssetId === null ? "border-app-action" : "border-transparent"
                )}
                onClick={() => setSelectedDemoAssetId(null)}
                aria-label="Use no demo"
              >
                <span className="text-center">
                  <span className="block text-[24px] font-normal">×</span>
                  <span className="text-[13px]">{demos[0] ?? "None"}</span>
                </span>
              </button>
              <button
                type="button"
                className={cn(
                  "grid h-24 w-20 place-items-center overflow-hidden rounded-[8px] border-2 bg-[#deded7] text-[12px] font-semibold text-[#77766f]",
                  selectedDemoAssetId ? "border-app-action" : "border-transparent"
                )}
                onClick={() => setDemoPickerOpen(true)}
                aria-label="Add demo"
              >
                {activeDemoAsset?.fileUrl ? (
                  <span className="relative block h-full w-full">
                    <video src={activeDemoAsset.fileUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                    <span className="absolute inset-x-1 bottom-1 rounded-[5px] bg-black/55 px-1 py-0.5 text-[10px] font-bold text-white">
                      {activeDemoAsset.name}
                    </span>
                  </span>
                ) : (
                  <span className="text-center">
                    <IconPlus className="mx-auto size-5" />
                    <span className="mt-1 block">Demo</span>
                  </span>
                )}
              </button>
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
              {activeAvatar && (
                <AvatarPreview avatar={activeAvatar} />
              )}
              <div className={cn("font-tiktok absolute inset-x-[14%] z-10 text-center text-[18px] font-black leading-tight text-white drop-shadow-[0_2px_2px_rgba(0,0,0,.9)]", ugcTextPlacementClass(textPlacement))}>
                {activeHook}
              </div>
              <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
                {(["top", "middle", "bottom"] as const).map((placement) => (
                  <button
                    key={placement}
                    type="button"
                    className={cn("flex size-8 items-center justify-center rounded-[5px] leading-none shadow-sm", textPlacement === placement ? "bg-white text-[#111]" : "bg-white/55 text-[#555]")}
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
            <Button variant="action" size="appDefault" className="flex-1" onClick={createUgcAdExport} disabled={creating || !activeAvatar}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </div>
          {error && <p className="mt-2 text-[12px] font-semibold text-[#d94444]">{error}</p>}
        </div>
      </CreatorBuilderPanel>
      <GeneratedVideoExports
        title="Generated Videos"
        exports={exports}
        emptyMessage="No AI UGC ad exports yet."
        onDeleted={(id) => setExports((current) => current.filter((item) => item.id !== id))}
      />
      {demoPickerOpen && (
        <DemoPickerModal
          assets={demoAssets}
          loading={demoAssetsLoading}
          error={demoAssetsError}
          selectedAssetId={selectedDemoAssetId}
          onClose={() => setDemoPickerOpen(false)}
          onSelect={(asset) => {
            setSelectedDemoAssetId(asset.id)
            setDemoPickerOpen(false)
          }}
          onUploaded={(asset) => {
            setDemoAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)])
            setSelectedDemoAssetId(asset.id)
            setDemoPickerOpen(false)
          }}
        />
      )}
    </CreatorPageShell>
  )
}

function DemoPickerModal({
  assets,
  loading,
  error,
  selectedAssetId,
  onClose,
  onSelect,
  onUploaded,
}: {
  assets: AssetRecord[]
  loading: boolean
  error: string
  selectedAssetId: string | null
  onClose: () => void
  onSelect: (asset: AssetRecord) => void
  onUploaded: (asset: AssetRecord) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [activeTab, setActiveTab] = useState<"my-demos" | "upload">("my-demos")
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState("")
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  function chooseFile(files: FileList | null) {
    const nextFile = files?.[0]
    if (!nextFile) {
      return
    }
    if (!nextFile.type.startsWith("video/")) {
      setUploadError("Upload a video file.")
      return
    }
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    setFile(nextFile)
    setPreviewUrl(URL.createObjectURL(nextFile))
    setUploadError("")
  }

  async function uploadDemo() {
    if (!file) {
      setUploadError("Choose a video to upload.")
      return
    }
    setUploading(true)
    setUploadError("")
    try {
      const formData = new FormData()
      formData.set("file", file)
      formData.set("scope", "ugc_demo")
      formData.set("category", "other")

      const payload = await toast.promise(
        fetchJsonWithTimeout<{ asset?: AssetRecord }>("/api/assets/upload", {
          method: "POST",
          body: formData,
          timeoutMs: 45_000,
          toastOnError: false,
        }),
        {
          loading: "Uploading demo...",
          success: "Demo uploaded",
          error: (caught) => getApiErrorMessage(caught, "Failed to upload demo"),
        },
      ).unwrap()

      if (!payload.asset) {
        throw new Error("Failed to upload demo")
      }
      onUploaded(payload.asset)
    } catch (caught) {
      setUploadError(getApiErrorMessage(caught, "Failed to upload demo"))
    } finally {
      setUploading(false)
    }
  }

  return (
    <AppModal className="z-[80] bg-[#24251f]/35" onClose={onClose}>
      <AppModalPanel className="max-w-[760px]">
        <AppModalHeader
          title="Add demo"
          description="Choose a saved project demo or upload a new video."
          closeLabel="Close demo picker"
          onClose={onClose}
        />
        <div className="grid border-b border-[#ededed] bg-[#f7f7f3] p-2 sm:grid-cols-2">
          {[
            ["my-demos", "My Demos"],
            ["upload", "Upload"],
          ].map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              className={cn(
                "h-10 rounded-[8px] text-[13px] font-bold text-[#666] hover:bg-white",
                activeTab === tab && "bg-white text-[#111] shadow-sm"
              )}
              onClick={() => setActiveTab(tab as "my-demos" | "upload")}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-[360px] p-5">
          {activeTab === "my-demos" ? (
            <div className="h-full">
              {loading ? (
                <div className="grid min-h-[300px] place-items-center text-[14px] font-bold text-[#77766f]">Loading demos...</div>
              ) : error ? (
                <div className="rounded-[8px] bg-[#fff0f0] p-3 text-[13px] font-semibold text-[#c63d4a]">{error}</div>
              ) : assets.length === 0 ? (
                <div className="grid min-h-[300px] place-items-center text-center">
                  <div>
                    <div className="mx-auto grid size-12 place-items-center rounded-[8px] bg-[#ededed] text-[#77766f]">
                      <IconUpload className="size-6" />
                    </div>
                    <div className="mt-3 text-[16px] font-bold text-[#333]">No demos yet</div>
                    <div className="mt-1 text-[13px] font-semibold text-[#8b8b86]">Upload a video to store it in project demos.</div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {assets.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      className={cn(
                        "overflow-hidden rounded-[8px] border bg-white text-left shadow-sm transition hover:shadow-md",
                        selectedAssetId === asset.id ? "border-app-action ring-2 ring-app-action/20" : "border-[#e4e4df]"
                      )}
                      onClick={() => onSelect(asset)}
                    >
                      <span className="block aspect-video bg-[#d8d8d2]">
                        {asset.fileUrl ? <video src={asset.fileUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" /> : null}
                      </span>
                      <span className="block min-w-0 p-3">
                        <span className="block truncate text-[13px] font-bold text-[#252525]">{asset.name}</span>
                        <span className="mt-1 line-clamp-2 block text-[11px] font-semibold leading-4 text-[#667085]">{asset.caption || "Saved project demo"}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <UploadDropzone
                inputRef={inputRef}
                accept="video/*"
                onFiles={chooseFile}
                className="min-h-[260px] w-full max-w-[480px] rounded-[10px]"
              >
                {previewUrl ? (
                  <span className="block w-full">
                    <video src={previewUrl} className="mx-auto aspect-video max-h-56 w-full rounded-[8px] object-cover" muted playsInline controls />
                    <span className="mt-3 block text-[13px] font-bold text-[#333]">{file?.name}</span>
                  </span>
                ) : (
                  <span>
                    <IconUpload className="mx-auto mb-3 size-8 text-[#8b8b86]" />
                    <span className="block text-[15px] font-bold text-[#333]">Upload video</span>
                    <span className="mt-2 block text-[12px] font-semibold text-[#8b8b86]">MP4, MOV, or WEBM</span>
                  </span>
                )}
              </UploadDropzone>
              {uploadError && <div className="rounded-[8px] bg-[#fff0f0] px-4 py-2 text-[13px] font-semibold text-[#c63d4a]">{uploadError}</div>}
              <Button variant="action" size="appDefault" className="w-full max-w-[480px] justify-center" onClick={uploadDemo} disabled={uploading || !file}>
                {uploading ? "Uploading..." : "Upload demo"}
              </Button>
            </div>
          )}
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

function AvatarTile({ avatar, label }: { avatar: LocalAsset; label: string }) {
  return (
    <span className="block h-full w-full overflow-hidden rounded-[5px] bg-[#deded7]">
      <video src={avatar.url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
      <span className="sr-only">{avatar.name || label}</span>
    </span>
  )
}

function AvatarPreview({ avatar }: { avatar: LocalAsset }) {
  return (
    <div className="absolute inset-0 bg-[#b7b7b2]">
      <video src={avatar.url} className="h-full w-full object-cover" muted playsInline autoPlay loop preload="auto" />
    </div>
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
  const centerY = placement === "top" ? 9 : placement === "middle" ? 16 : 23

  return (
    <svg viewBox="0 0 28 28" className="size-5" aria-hidden="true">
      <path d="M7 5.5h14M7 22.5h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity="0.8" />
      <rect x="10" y={centerY - 3.5} width="8" height="7" rx="1.8" fill="none" stroke="currentColor" strokeWidth="2.4" />
    </svg>
  )
}

function clampPage(page: number, pageCount: number) {
  return Math.min(Math.max(page, 0), Math.max(0, pageCount - 1))
}

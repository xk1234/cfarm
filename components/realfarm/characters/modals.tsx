"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  IconChevronLeft,
  IconChevronRight,
  IconPhoto,
  IconPlus,
  IconUpload,
  IconX,
} from "@tabler/icons-react"
import { Folder } from "lucide-react"
import { toast } from "sonner"

import { AttachmentSquareRow } from "@/components/realfarm/characters/shared-components"
import { InfoRow } from "@/components/realfarm/characters/workflow-panels"
import { ratioToCss, referenceAssetReady } from "@/components/realfarm/characters/workflow-helpers"
import { Button } from "@/components/ui/button"
import { SelectControl } from "@/components/ui/form-controls"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import { Spinner } from "@/components/ui/spinner"
import { UploadDropzone } from "@/components/ui/upload-dropzone"
import type { AssetCategory, AssetKind, AssetRecord } from "@/lib/assets"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import {
  assetCategoryByTab,
  assetTabs,
  type AssetTab,
} from "@/lib/realfarm-asset-ui-config"
import {
  characterGenerationPrimaryMedia,
  characterGenerationModels,
  characterImageToVideoModels,
  defaultImageActionModel,
  defaultImageGenerationModel,
  defaultImageToVideoModel,
  imageActionModels,
  type CharacterImageGenerationRecord,
  type CharacterPromptAttachment,
} from "@/lib/realfarm-character-ui"
import { cn } from "@/lib/utils"

// Legacy modal editor kept temporarily; generation cards now select edit sources instead.
export function CharacterImageEditorModal({
  generation,
  title,
  index,
  total,
  onCaptionChange,
  onImageReplace,
  onVideoUpdate,
  onPrevious,
  onNext,
  onClose,
}: {
  generation: CharacterImageGenerationRecord & { imageUrl: string }
  title: string
  index: number
  total: number
  onCaptionChange: (caption: string) => void
  onImageReplace: (imageUrl: string) => void
  onVideoUpdate: (update: Partial<CharacterImageGenerationRecord>) => void
  onPrevious: () => void
  onNext: () => void
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<"image" | "video">("image")
  const [activeImageTool, setActiveImageTool] = useState<"edit" | "upscale">(
    "edit"
  )
  const [imagePrompt, setImagePrompt] = useState("")
  const [imageModel, setImageModel] = useState(defaultImageActionModel)
  const [upscaleFactor, setUpscaleFactor] = useState("2")
  const [imageWorking, setImageWorking] = useState(false)
  const [imageError, setImageError] = useState("")
  const [videoPrompt, setVideoPrompt] = useState(
    "Animate this generated character image with natural camera movement."
  )
  const [videoModel, setVideoModel] = useState(
    generation.videoModel || defaultImageToVideoModel
  )
  const [videoDuration, setVideoDuration] = useState("5")
  const [videoSound, setVideoSound] = useState(false)
  const [videoWorking, setVideoWorking] = useState(false)
  const [videoError, setVideoError] = useState("")

  async function runImageAction() {
    setImageWorking(true)
    setImageError("")
    const toastId = toast.loading(
      activeImageTool === "edit"
        ? "Generating image edit..."
        : "Upscaling image..."
    )
    try {
      const payload = await fetchJsonWithTimeout<{ imageUrl?: string }>(
        "/api/image-collections/image-actions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          timeoutMs: 480_000,
          toastOnError: false,
          body: JSON.stringify({
            mode: activeImageTool,
            imageUrl: generation.imageUrl,
            prompt: imagePrompt,
            upscaleFactor,
            model: imageModel,
          }),
        }
      )
      if (!payload.imageUrl) {
        throw new Error("Image action failed")
      }
      onImageReplace(payload.imageUrl)
      toast.success(
        activeImageTool === "edit"
          ? "Image edit ready"
          : "Upscaled image ready",
        { id: toastId }
      )
    } catch (error) {
      const message = getApiErrorMessage(error, "Image action failed")
      setImageError(message)
      toast.error(message, { id: toastId })
    } finally {
      setImageWorking(false)
    }
  }

  async function runVideoGeneration() {
    setVideoWorking(true)
    setVideoError("")
    onVideoUpdate({
      videoModel,
      videoStatus: "processing",
      videoError: undefined,
      videoProgress: 20,
    })
    const toastId = toast.loading("Generating character video...")
    try {
      const payload = await fetchJsonWithTimeout<{
        videoUrl?: string
        taskId?: string
        error?: string
      }>("/api/characters/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeoutMs: 720_000,
        toastOnError: false,
        body: JSON.stringify({
          imageUrl: generation.imageUrl,
          prompt: videoPrompt,
          model: videoModel,
          duration: videoDuration,
          aspectRatio: generation.aspectRatio,
          sound: videoSound,
        }),
      })
      if (!payload.videoUrl) {
        throw new Error(payload.error || "Video generation failed")
      }
      onVideoUpdate({
        videoUrl: payload.videoUrl,
        videoModel,
        videoStatus: "ready",
        videoProgress: 100,
      })
      toast.success("Character video ready", { id: toastId })
    } catch (error) {
      const message = getApiErrorMessage(error, "Video generation failed")
      setVideoError(message)
      onVideoUpdate({
        videoStatus: "failed",
        videoError: message,
        videoProgress: 100,
      })
      toast.error(message, { id: toastId })
    } finally {
      setVideoWorking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/86 text-white">
      <button
        className="absolute top-5 right-6 z-10 grid size-9 place-items-center rounded-full hover:bg-white/10"
        onClick={onClose}
        aria-label="Close image editor"
      >
        <IconX className="size-8" />
      </button>
      <button
        className="absolute top-1/2 left-8 z-10 grid size-12 -translate-y-1/2 place-items-center rounded-full hover:bg-white/10 disabled:opacity-30"
        onClick={onPrevious}
        disabled={index === 0}
        aria-label="Previous image"
      >
        <IconChevronLeft className="size-10" />
      </button>
      <button
        className="absolute top-1/2 right-8 z-10 grid size-12 -translate-y-1/2 place-items-center rounded-full hover:bg-white/10 disabled:opacity-30"
        onClick={onNext}
        disabled={index === total - 1}
        aria-label="Next image"
      >
        <IconChevronRight className="size-10" />
      </button>
      <div className="flex flex-1 items-center justify-center px-6 pt-14 pb-6 md:px-20">
        <div className="flex min-h-0 w-full max-w-[980px] flex-col items-center">
          <div
            className="h-[52vh] min-h-[260px] w-full bg-contain bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${generation.imageUrl})` }}
            role="img"
            aria-label={title}
          />
          <textarea
            className="mt-2 min-h-[44px] w-full max-w-[860px] resize-none bg-transparent text-center text-[15px] leading-6 font-semibold text-white outline-none placeholder:text-white/55"
            value={generation.prompt || "Character generation"}
            placeholder="Add image caption..."
            onChange={(event) => onCaptionChange(event.target.value)}
          />
          <div className="mt-1 rounded-[3px] bg-black/55 px-4 py-1.5 text-[15px] font-bold">
            {index + 1} / {total}
          </div>
          <div className="mt-2 w-full max-w-[860px] rounded-[8px] bg-white p-3 text-[#242421] shadow-xl">
            <div className="mb-2 grid h-8 w-[180px] grid-cols-2 rounded-[6px] bg-[#ecebe4] p-0.5 text-[12px] font-semibold">
              {(["image", "video"] as const).map((tab) => (
                <button
                  key={tab}
                  className={cn(
                    "rounded-[5px] px-3 leading-none text-[#595852] capitalize",
                    activeTab === tab && "bg-white text-[#242421] shadow-sm"
                  )}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
            {activeTab === "image" ? (
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="grid h-8 grid-cols-2 rounded-[6px] bg-[#ecebe4] p-0.5 text-[12px] font-semibold">
                    {(["edit", "upscale"] as const).map((tool) => (
                      <button
                        key={tool}
                        className={cn(
                          "rounded-[5px] px-3 leading-none text-[#595852] capitalize",
                          activeImageTool === tool &&
                            "bg-white text-[#242421] shadow-sm"
                        )}
                        onClick={() => setActiveImageTool(tool)}
                      >
                        {tool}
                      </button>
                    ))}
                  </div>
                  <SelectControl
                    aria-label="Image action model"
                    className="h-8 min-w-[132px] rounded-[6px] border border-[#deddd5] bg-white px-2 text-[12px] font-semibold"
                    value={imageModel}
                    onChange={(event) => setImageModel(event.target.value)}
                  >
                    {imageActionModels.map((model) => (
                      <option key={model.model} value={model.model}>
                        {model.label}
                      </option>
                    ))}
                  </SelectControl>
                  {activeImageTool === "upscale" && (
                    <SelectControl
                      aria-label="Upscale factor"
                      className="h-8 w-[78px] rounded-[6px] border border-[#deddd5] bg-white px-2 text-[12px] font-semibold"
                      value={upscaleFactor}
                      onChange={(event) => setUpscaleFactor(event.target.value)}
                    >
                      <option value="2">2x</option>
                      <option value="4">4x</option>
                    </SelectControl>
                  )}
                  <div className="min-w-2 flex-1" />
                  <Button
                    className="h-8 rounded-[6px] px-4 text-[12px]"
                    disabled={
                      imageWorking ||
                      (activeImageTool === "edit" && !imagePrompt.trim())
                    }
                    onClick={() => void runImageAction()}
                  >
                    {imageWorking
                      ? "Generating..."
                      : activeImageTool === "edit"
                        ? "Generate"
                        : "Upscale"}
                  </Button>
                </div>
                {activeImageTool === "edit" && (
                  <textarea
                    className="mt-2 min-h-[44px] w-full resize-none rounded-[6px] border border-[#deddd5] px-3 py-2 text-[13px] leading-5 font-medium outline-none placeholder:text-[#aaa]"
                    value={imagePrompt}
                    onChange={(event) => setImagePrompt(event.target.value)}
                    placeholder="Describe the edit you want to make..."
                  />
                )}
                {imageError && (
                  <div className="mt-2 rounded-[6px] bg-[#fff3f0] px-3 py-2 text-[12px] font-semibold text-[#b44d38]">
                    {imageError}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid gap-3">
                {generation.videoUrl && (
                  <video
                    className="max-h-[220px] w-full rounded-[8px] bg-black object-contain"
                    src={generation.videoUrl}
                    controls
                    playsInline
                  />
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <SelectControl
                    aria-label="Image to video model"
                    className="h-8 min-w-[190px] rounded-[6px] border border-[#deddd5] bg-white px-2 text-[12px] font-semibold"
                    value={videoModel}
                    onChange={(event) => setVideoModel(event.target.value)}
                  >
                    {characterImageToVideoModels.map((model) => (
                      <option key={model.label} value={model.label}>
                        {model.label}
                      </option>
                    ))}
                  </SelectControl>
                  <SelectControl
                    aria-label="Video duration"
                    className="h-8 w-[92px] rounded-[6px] border border-[#deddd5] bg-white px-2 text-[12px] font-semibold"
                    value={videoDuration}
                    onChange={(event) => setVideoDuration(event.target.value)}
                  >
                    <option value="5">5 sec</option>
                    <option value="10">10 sec</option>
                    <option value="15">15 sec</option>
                  </SelectControl>
                  <label className="flex h-8 items-center gap-2 rounded-[6px] border border-[#deddd5] px-3 text-[12px] font-semibold">
                    <input
                      type="checkbox"
                      checked={videoSound}
                      onChange={(event) => setVideoSound(event.target.checked)}
                    />
                    Sound
                  </label>
                  <div className="min-w-2 flex-1" />
                  <Button
                    className="h-8 rounded-[6px] px-4 text-[12px]"
                    disabled={videoWorking || !videoPrompt.trim()}
                    onClick={() => void runVideoGeneration()}
                  >
                    {videoWorking ? "Generating..." : "Generate video"}
                  </Button>
                </div>
                <textarea
                  className="min-h-[58px] w-full resize-none rounded-[6px] border border-[#deddd5] px-3 py-2 text-[13px] leading-5 font-medium outline-none placeholder:text-[#aaa]"
                  aria-label="Video generation prompt"
                  value={videoPrompt}
                  onChange={(event) => setVideoPrompt(event.target.value)}
                  placeholder="Describe the motion, camera movement, and action..."
                />
                {(videoError || generation.videoError) && (
                  <div className="rounded-[6px] bg-[#fff3f0] px-3 py-2 text-[12px] font-semibold text-[#b44d38]">
                    {videoError || generation.videoError}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function CharacterAssetsPanel({
  selectedAssetIds,
  onToggleAsset,
  onClose,
}: {
  selectedAssetIds: string[]
  onToggleAsset: (asset: AssetRecord) => void
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<AssetTab>("outfits")
  const [assets, setAssets] = useState<AssetRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const activeCategory = assetCategoryByTab[activeTab]
  const showImageOnlyGrid =
    activeTab === "outfits" || activeTab === "background"

  useEffect(() => {
    let active = true
    void fetchJsonWithTimeout<{ assets?: AssetRecord[] }>(
      `/api/assets?scope=ugc_avatar&category=${encodeURIComponent(activeCategory)}`,
      {
        cache: "no-store",
        timeoutMs: 12_000,
        toastOnError: false,
      }
    )
      .then((payload) => {
        if (active) {
          setAssets(payload.assets ?? [])
        }
      })
      .catch((loadError) => {
        if (active) {
          const message = getApiErrorMessage(loadError, "Failed to load assets")
          setError(message)
          setAssets([])
          toast.error(message)
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [activeCategory])

  function addAsset(asset: AssetRecord) {
    if (asset.category === activeCategory) {
      setAssets((current) => [
        asset,
        ...current.filter((item) => item.id !== asset.id),
      ])
    }
    setCreateOpen(false)
  }

  return (
    <div className="fixed inset-y-0 right-0 z-[60] w-full max-w-[360px] border-l border-[#e4e4df] bg-white shadow-2xl">
      <div className="flex h-16 items-center justify-between border-b border-[#ededed] px-4">
        <h2 className="text-[20px] font-bold text-[#202020]">Assets</h2>
        <button
          className="grid size-9 place-items-center rounded-[8px] text-[#667085] hover:bg-[#f4f4f2]"
          onClick={onClose}
          aria-label="Close assets"
        >
          <IconX className="size-5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 border-b border-[#ededed] p-3">
        {assetTabs.map((tab) => (
          <button
            key={tab}
            className={cn(
              "h-10 rounded-[9px] text-[13px] font-bold text-[#666] capitalize hover:bg-[#f5f5f1]",
              activeTab === tab && "bg-[#111] text-white hover:bg-[#111]"
            )}
            onClick={() => {
              if (activeTab !== tab) {
                setLoading(true)
                setError("")
                setActiveTab(tab)
              }
            }}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="flex h-[calc(100%-128px)] flex-col">
        <div className="border-b border-[#ededed] p-3">
          <Button
            variant="action"
            size="appDefault"
            className="w-full justify-center"
            onClick={() => setCreateOpen(true)}
          >
            <IconPlus className="size-4" />
            Create asset
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <Spinner size={26} aria-label="Loading assets" />
              <div className="text-[14px] font-bold text-[#737373]">
                Loading assets...
              </div>
            </div>
          ) : error ? (
            <div className="rounded-[10px] bg-[#fff0f0] p-3 text-[13px] font-semibold text-[#c63d4a]">
              {error}
            </div>
          ) : assets.length === 0 ? (
            <div className="grid h-full place-items-center text-center">
              <div>
                <Folder
                  className="mx-auto size-10 text-[#b7bcc5]"
                  strokeWidth={1.5}
                />
                <div className="mt-4 text-[16px] font-bold text-[#333]">
                  No {activeTab} yet
                </div>
                <div className="mt-2 text-[13px] font-semibold text-[#8b8b86]">
                  Upload or generate one to use it in prompts.
                </div>
              </div>
            </div>
          ) : showImageOnlyGrid ? (
            <AssetImageGrid
              assets={assets}
              selectedAssetIds={selectedAssetIds}
              onToggleAsset={onToggleAsset}
            />
          ) : (
            <div className="space-y-3">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  className={cn(
                    "flex w-full gap-3 rounded-[12px] border bg-white p-2 text-left shadow-sm transition hover:shadow-md",
                    selectedAssetIds.includes(asset.id)
                      ? "border-[#ff4f28] ring-2 ring-[#ff4f28]/20"
                      : "border-[#e4e4df]"
                  )}
                  onClick={() => onToggleAsset(asset)}
                >
                  <AssetThumb asset={asset} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-[#252525]">
                      {asset.name}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-[11px] leading-4 font-semibold text-[#667085]">
                      {asset.caption || asset.prompt || "No caption yet"}
                    </span>
                    <span className="mt-2 inline-flex rounded-full bg-[#f2f4f7] px-2 py-0.5 text-[10px] font-bold text-[#667085] uppercase">
                      {asset.source.replace("_", " ")}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {createOpen && (
        <AssetCreateModal
          category={activeCategory}
          onCancel={() => setCreateOpen(false)}
          onCreated={addAsset}
        />
      )}
    </div>
  )
}

function AssetImageGrid({
  assets,
  selectedAssetIds,
  onToggleAsset,
}: {
  assets: AssetRecord[]
  selectedAssetIds: string[]
  onToggleAsset: (asset: AssetRecord) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {assets.map((asset) => (
        <AssetImageTile
          key={asset.id}
          asset={asset}
          selected={selectedAssetIds.includes(asset.id)}
          onToggleAsset={onToggleAsset}
        />
      ))}
    </div>
  )
}

function AssetImageTile({
  asset,
  selected,
  onToggleAsset,
}: {
  asset: AssetRecord
  selected: boolean
  onToggleAsset: (asset: AssetRecord) => void
}) {
  const caption =
    asset.caption || asset.prompt || asset.name || "No caption yet"

  return (
    <button
      className={cn(
        "group relative aspect-square overflow-hidden rounded-[8px] border bg-[#f1f1ed] text-left transition focus-visible:ring-2 focus-visible:ring-[#ff4f28] focus-visible:outline-none",
        selected
          ? "border-[#ff4f28] ring-2 ring-[#ff4f28]/30"
          : "border-[#e4e4df] hover:border-[#c9c9c3]"
      )}
      type="button"
      aria-label={`Select ${asset.name}`}
      aria-pressed={selected}
      title={caption}
      onClick={() => onToggleAsset(asset)}
    >
      {asset.kind === "image" && asset.fileUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- User-created local assets are served from the local asset API. */}
          <img
            src={asset.fileUrl}
            alt={asset.name}
            className="h-full w-full object-cover"
          />
        </>
      ) : (
        <span className="grid h-full w-full place-items-center text-[#a3a8b1]">
          <IconPhoto className="size-8" stroke={1.5} />
        </span>
      )}
      <span className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/85 via-black/25 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100 group-focus-visible:opacity-100">
        <span className="line-clamp-4 text-[11px] leading-4 font-semibold text-white">
          {caption}
        </span>
      </span>
    </button>
  )
}

function AssetThumb({ asset }: { asset: AssetRecord }) {
  if (asset.kind === "image" && asset.fileUrl) {
    return (
      <span className="block size-16 shrink-0 overflow-hidden rounded-[10px] bg-[#f1f1ed]">
        {/* eslint-disable-next-line @next/next/no-img-element -- User-created local assets are served from the local asset API. */}
        <img
          src={asset.fileUrl}
          alt={asset.name}
          className="h-full w-full object-cover"
        />
      </span>
    )
  }

  return (
    <span className="grid size-16 shrink-0 place-items-center rounded-[10px] bg-[#f1f1ed] text-[#a3a8b1]">
      <IconPhoto className="size-7" stroke={1.5} />
    </span>
  )
}

function AssetCreateModal({
  category,
  onCancel,
  onCreated,
}: {
  category: AssetCategory
  onCancel: () => void
  onCreated: (asset: AssetRecord) => void
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [mode, setMode] = useState<"upload" | "generate">("upload")
  const [kind, setKind] = useState<AssetKind>("image")
  const [name, setName] = useState("")
  const [prompt, setPrompt] = useState("")
  const [model, setModel] = useState(defaultImageGenerationModel)
  const [file, setFile] = useState<File | null>(null)
  const [filePreviewUrl, setFilePreviewUrl] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    return () => {
      if (filePreviewUrl) {
        URL.revokeObjectURL(filePreviewUrl)
      }
    }
  }, [filePreviewUrl])

  function chooseFile(nextFile: File | undefined) {
    if (!nextFile) {
      return
    }
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl)
    }
    setFile(nextFile)
    setName((current) => current || nextFile.name.replace(/\.[^.]+$/, ""))
    setFilePreviewUrl(
      nextFile.type.startsWith("image/") ? URL.createObjectURL(nextFile) : ""
    )
    setError("")
  }

  async function submit() {
    setSubmitting(true)
    setError("")
    try {
      const asset = await toast
        .promise(mode === "upload" ? uploadAsset() : generateAsset(), {
          loading:
            mode === "upload" ? "Uploading asset..." : "Generating asset...",
          success: "Asset created",
          error: (error) => getApiErrorMessage(error, "Failed to create asset"),
        })
        .unwrap()
      onCreated(asset)
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, "Failed to create asset"))
    } finally {
      setSubmitting(false)
    }
  }

  async function uploadAsset() {
    if (!file) {
      throw new Error("Choose a file to upload")
    }
    const formData = new FormData()
    formData.set("file", file)
    formData.set("scope", "ugc_avatar")
    formData.set("category", category)
    formData.set("name", name.trim() || file.name.replace(/\.[^.]+$/, ""))
    const payload = await fetchJsonWithTimeout<{ asset?: AssetRecord }>(
      "/api/assets/upload",
      {
        method: "POST",
        body: formData,
        timeoutMs: 30_000,
        toastOnError: false,
      }
    )
    if (!payload.asset) {
      throw new Error("Failed to create asset")
    }
    return payload.asset
  }

  async function generateAsset() {
    if (!prompt.trim()) {
      throw new Error("Enter a prompt to generate an asset")
    }
    const payload = await fetchJsonWithTimeout<{ asset?: AssetRecord }>(
      "/api/assets/generate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeoutMs: 60_000,
        toastOnError: false,
        body: JSON.stringify({
          kind,
          scope: "ugc_avatar",
          category,
          name,
          prompt,
          model,
        }),
      }
    )
    if (!payload.asset) {
      throw new Error("Failed to create asset")
    }
    return payload.asset
  }

  return (
    <AppModal className="z-[80]" onClose={onCancel}>
      <AppModalPanel className="max-w-[560px]">
        <AppModalHeader
          title="Create asset"
          description={category}
          closeLabel="Close create asset modal"
          onClose={onCancel}
        />

        <div className="space-y-4 p-5">
          <div className="grid rounded-[10px] bg-[#f2f1ef] p-1 sm:grid-cols-2">
            {(["upload", "generate"] as const).map((item) => (
              <button
                key={item}
                className={cn(
                  "h-10 rounded-[8px] text-[14px] font-bold capitalize",
                  mode === item
                    ? "bg-white text-[#111827] shadow-sm"
                    : "text-[#777] hover:bg-white/60"
                )}
                onClick={() => {
                  setMode(item)
                  setError("")
                }}
              >
                {item}
              </button>
            ))}
          </div>

          <label className="block text-[13px] font-bold text-[#667085]">
            Name
            <input
              className="mt-2 h-10 w-full rounded-[10px] border border-[#dde1e7] px-3 text-[14px] font-semibold text-[#111827] outline-none"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Asset name"
            />
          </label>

          {mode === "upload" ? (
            <div>
              <UploadDropzone
                inputRef={fileInputRef}
                accept="image/*,video/*,audio/*,.txt"
                onFiles={(files) => chooseFile(files?.[0])}
              >
                {filePreviewUrl ? (
                  <span>
                    {/* eslint-disable-next-line @next/next/no-img-element -- Local file preview from user-selected upload. */}
                    <img
                      src={filePreviewUrl}
                      alt={file?.name ?? "Selected asset"}
                      className="mx-auto h-28 w-28 rounded-[12px] object-cover shadow-sm"
                    />
                    <span className="mt-3 block text-[13px] font-bold text-[#333]">
                      {file?.name}
                    </span>
                  </span>
                ) : (
                  <span>
                    <IconUpload className="mx-auto mb-3 size-8 text-[#9ca3af]" />
                    <span className="block text-[15px] font-bold text-[#333]">
                      {file ? file.name : "Choose file"}
                    </span>
                    <span className="mt-1 block text-[13px] font-semibold text-[#85857f]">
                      Images, videos, audio, or text
                    </span>
                  </span>
                )}
              </UploadDropzone>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-[13px] font-bold text-[#667085]">
                  Kind
                  <SelectControl
                    className="mt-2 w-full"
                    value={kind}
                    onChange={(event) =>
                      setKind(event.target.value as AssetKind)
                    }
                  >
                    {(["image", "video", "audio", "text"] as AssetKind[]).map(
                      (item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      )
                    )}
                  </SelectControl>
                </label>
                <label className="block text-[13px] font-bold text-[#667085]">
                  Model
                  <SelectControl
                    className="mt-2 w-full"
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                  >
                    {characterGenerationModels.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </SelectControl>
                </label>
              </div>
              <label className="block text-[13px] font-bold text-[#667085]">
                Prompt
                <textarea
                  className="mt-2 h-28 w-full resize-none rounded-[12px] border border-[#dde1e7] p-3 text-[14px] leading-6 font-semibold outline-none"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Describe the asset to generate..."
                />
              </label>
            </div>
          )}

          {error && (
            <div className="rounded-[10px] bg-[#fff0f0] p-3 text-[13px] font-semibold text-[#c63d4a]">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-[#eceff3] px-5 py-4">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="action"
            disabled={
              submitting || (mode === "upload" ? !file : !prompt.trim())
            }
            onClick={() => void submit()}
          >
            {submitting ? "Creating..." : "Create asset"}
          </Button>
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

export function PromptDebugModal({
  prompt,
  attachments,
  onClose,
}: {
  prompt: string
  attachments: CharacterPromptAttachment[]
  onClose: () => void
}) {
  return (
    <AppModal className="z-[80]" onClose={onClose}>
      <AppModalPanel className="max-w-[760px] rounded-[14px]">
        <div className="flex items-start justify-between border-b border-[#eceff3] px-5 py-4">
          <div>
            <h2 className="text-[22px] font-bold text-[#252525]">
              Final prompt debug
            </h2>
            <p className="mt-1 text-[13px] font-semibold text-[#85857f]">
              Prompt and attachments that will be sent to the image model.
            </p>
          </div>
          <button
            className="grid size-9 place-items-center rounded-[8px] text-[#667085] hover:bg-[#f4f4f2]"
            onClick={onClose}
            aria-label="Close prompt debug"
          >
            <IconX className="size-5" />
          </button>
        </div>
        <div className="space-y-5 p-5">
          <div>
            <div className="text-[13px] font-bold tracking-wide text-[#9a9a93] uppercase">
              Prompt
            </div>
            <pre className="mt-2 max-h-[360px] overflow-auto rounded-[10px] bg-[#f7f7f3] p-4 text-[12px] leading-5 font-semibold whitespace-pre-wrap text-[#333]">
              {prompt}
            </pre>
          </div>
        </div>
        <div
          data-testid="debug-attachments-bottom"
          className="border-t border-[#eceff3] px-5 py-4"
        >
          <AttachmentSquareRow
            attachments={attachments}
            ariaLabel="Debug attachments"
          />
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

export function GenerationDebugModal({
  generation,
  onClose,
}: {
  generation: CharacterImageGenerationRecord
  onClose: () => void
}) {
  const debugPayload = {
    id: generation.id,
    status: generation.status,
    progress: generation.progress,
    model: generation.model,
    aspectRatio: generation.aspectRatio,
    workflow: generation.workflow,
    workflowLabel: generation.workflowLabel,
    workflowMetadata: generation.workflowMetadata,
    imageUrl: generation.imageUrl,
    videoUrl: generation.videoUrl,
    videoStatus: generation.videoStatus,
    videoModel: generation.videoModel,
    error: generation.error,
    videoError: generation.videoError,
    createdAt: generation.createdAt,
  }

  return (
    <AppModal className="z-[85]" onClose={onClose}>
      <AppModalPanel className="max-w-[900px] rounded-[14px]">
        <div className="flex items-start justify-between border-b border-[#eceff3] px-5 py-4">
          <div>
            <h2 className="text-[22px] font-bold text-[#252525]">
              Generation debug
            </h2>
            <p className="mt-1 text-[13px] font-semibold text-[#85857f]">
              Inspect the exact prompt, output files, status, and workflow
              metadata for this generation.
            </p>
          </div>
          <button
            className="grid size-9 place-items-center rounded-[8px] text-[#667085] hover:bg-[#f4f4f2]"
            onClick={onClose}
            aria-label="Close generation debug"
          >
            <IconX className="size-5" />
          </button>
        </div>
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="space-y-3">
            <div
              className="overflow-hidden rounded-[12px] bg-[#ecece8]"
              style={{ aspectRatio: ratioToCss(generation.aspectRatio) }}
            >
              {generation.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- Generated local image URL is returned by the app API.
                <img
                  src={generation.imageUrl}
                  alt={generation.prompt || "Generated image debug preview"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="grid h-full place-items-center px-4 text-center text-[13px] font-bold text-[#667085]">
                  No image URL
                </div>
              )}
            </div>
            {generation.videoUrl && (
              <video
                className="w-full rounded-[12px] bg-black"
                src={generation.videoUrl}
                controls
              />
            )}
          </div>
          <div className="min-w-0 space-y-4">
            <DebugSection title="Prompt">
              <pre className="max-h-[220px] overflow-auto rounded-[10px] bg-[#f7f7f3] p-4 text-[12px] leading-5 font-semibold whitespace-pre-wrap text-[#333]">
                {generation.prompt || "No prompt stored"}
              </pre>
            </DebugSection>
            <DebugSection title="Files">
              <dl className="space-y-2 text-[12px] font-semibold text-[#555]">
                <InfoRow label="Image" value={generation.imageUrl || "None"} />
                <InfoRow label="Video" value={generation.videoUrl || "None"} />
              </dl>
            </DebugSection>
            <DebugSection title="Raw generation object">
              <pre className="max-h-[260px] overflow-auto rounded-[10px] bg-[#101828] p-4 text-[12px] leading-5 whitespace-pre-wrap text-white">
                {JSON.stringify(debugPayload, null, 2)}
              </pre>
            </DebugSection>
          </div>
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

function DebugSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-2 text-[13px] font-bold tracking-wide text-[#9a9a93] uppercase">
        {title}
      </div>
      {children}
    </section>
  )
}

export function GenerationImagePreviewModal({
  generation,
  onClose,
}: {
  generation: CharacterImageGenerationRecord
  onClose: () => void
}) {
  const primaryMedia = characterGenerationPrimaryMedia(generation)

  return (
    <AppModal className="z-[84] bg-[#12130f]/70" onClose={onClose}>
      <AppModalPanel className="max-h-[92svh] max-w-[min(92vw,860px)] rounded-[14px]">
        <AppModalHeader
          title="Image preview"
          description={generation.model}
          onClose={onClose}
        />
        <div className="grid max-h-[calc(92svh-82px)] place-items-center bg-[#111] p-3">
          {primaryMedia?.type === "video" ? (
            <video
              src={primaryMedia.url}
              className="max-h-[calc(92svh-110px)] max-w-full rounded-[10px]"
              controls
              autoPlay
              playsInline
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- Generated local image URL is returned by the app API.
            <img
              src={primaryMedia?.url || ""}
              alt={generation.prompt || "Generated character image preview"}
              className="max-h-[calc(92svh-110px)] max-w-full rounded-[10px] object-contain"
            />
          )}
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

export function ReferenceImageModal({
  selectedAssetId,
  onSelect,
  onClose,
}: {
  selectedAssetId?: string
  onSelect: (asset: AssetRecord) => void
  onClose: () => void
}) {
  const [assets, setAssets] = useState<AssetRecord[]>([])
  const [source, setSource] = useState<"upload" | "url">("upload")
  const [imageUrl, setImageUrl] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState("")
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let active = true
    void loadReferenceAssets().then((loadedAssets) => {
      if (active) {
        setAssets(loadedAssets)
      }
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  function chooseReferenceFile(fileList: FileList | null) {
    const nextFile = Array.from(fileList ?? []).find((item) =>
      item.type.startsWith("image/")
    )
    if (!nextFile) {
      return
    }
    setFile(nextFile)
    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current)
      }
      return URL.createObjectURL(nextFile)
    })
  }

  async function importReference(source: "url" | "upload") {
    const url = imageUrl.trim()
    if (source === "url" && !url) {
      toast.error("Paste a reference image URL")
      return
    }
    if (source === "upload" && !file) {
      toast.error("Choose a reference image")
      return
    }
    setImporting(true)
    const pendingId = `pending-${Date.now()}`
    const pendingAsset: AssetRecord = {
      id: pendingId,
      kind: "image",
      source: "upload",
      status: "processing",
      scope: "ugc_avatar",
      category: "reference",
      name: "Analyzing reference",
      caption: "",
      fileUrl: source === "upload" ? previewUrl : url,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { analysisStatus: "processing" },
    }
    setAssets((current) => [pendingAsset, ...current])
    const toastId = toast.loading("Analyzing reference image...")
    try {
      const request =
        source === "upload"
          ? (() => {
              const formData = new FormData()
              formData.set("file", file!)
              formData.set("name", file!.name.replace(/\.[^.]+$/, ""))
              return {
                method: "POST",
                body: formData,
                timeoutMs: 180_000,
                toastOnError: false,
              } as const
            })()
          : ({
              method: "POST",
              headers: { "Content-Type": "application/json" },
              timeoutMs: 180_000,
              toastOnError: false,
              body: JSON.stringify({ imageUrl: url }),
            } as const)
      const payload = await fetchJsonWithTimeout<{ asset?: AssetRecord }>(
        "/api/assets/reference-import",
        request
      )
      if (!payload.asset) {
        throw new Error("Reference import failed")
      }
      setAssets((current) => [
        payload.asset!,
        ...current.filter(
          (asset) => asset.id !== payload.asset!.id && asset.id !== pendingId
        ),
      ])
      setImageUrl("")
      setFile(null)
      setPreviewUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current)
        }
        return ""
      })
      toast.success("Reference analyzed", { id: toastId })
    } catch (error) {
      setAssets((current) =>
        current.map((asset) =>
          asset.id === pendingId
            ? {
                ...asset,
                status: "failed",
                name: "Reference analysis failed",
                metadata: { analysisStatus: "failed" },
              }
            : asset
        )
      )
      toast.error(getApiErrorMessage(error, "Reference analysis failed"), {
        id: toastId,
      })
    } finally {
      setImporting(false)
    }
  }

  return (
    <AppModal className="z-[60] bg-[#24251f]/35" onClose={onClose}>
      <AppModalPanel className="max-w-[820px]">
        <AppModalHeader
          title="Add a reference image"
          closeLabel="Close reference image modal"
          onClose={onClose}
        />
        <div
          className={cn(
            "min-h-[270px] p-6",
            assets.length === 0 && "grid place-items-center"
          )}
        >
          {assets.length === 0 ? (
            <div className="text-center">
              <IconPhoto
                className="mx-auto size-10 text-app-text-faint"
                stroke={1.5}
              />
              <div className="mt-4 text-[16px] font-semibold text-app-text">
                No reference images yet
              </div>
              <p className="mt-1 text-[13px] text-app-muted-text">
                Upload a screenshot or paste an image URL below.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {assets.map((asset) => {
                const ready = referenceAssetReady(asset)
                return (
                  <button
                    key={asset.id}
                    disabled={!ready}
                    className={cn(
                      "overflow-hidden rounded-xl border-2 bg-app-surface text-left transition",
                      ready
                        ? "border-emerald-500 hover:border-emerald-600"
                        : "border-app-danger opacity-70",
                      selectedAssetId === asset.id && "ring-2 ring-emerald-500"
                    )}
                    onClick={() => ready && onSelect(asset)}
                    title={
                      ready
                        ? "Use this analyzed reference"
                        : "Reference analysis is not ready"
                    }
                  >
                    {asset.fileUrl && (
                      <span className="grid aspect-[3/4] w-full place-items-center bg-app-media-empty">
                        {/* eslint-disable-next-line @next/next/no-img-element -- Asset image is served by local app API. */}
                        <img
                          src={asset.fileUrl}
                          alt={asset.name}
                          className="max-h-full max-w-full object-contain"
                        />
                      </span>
                    )}
                    <div className="flex items-center justify-between gap-2 px-3 py-2 text-[12px] font-medium text-app-text-soft">
                      <span className="truncate">{asset.name}</span>
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          ready ? "bg-emerald-500" : "bg-app-danger"
                        )}
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="border-t border-app-panel-border p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <ModalSourceTabs value={source} onChange={setSource} />
            <p className="text-[12px] text-app-muted-text">
              {source === "upload"
                ? "Upload a screenshot to analyze."
                : "Paste an image URL to analyze."}
            </p>
          </div>
          {source === "upload" ? (
            <div>
              <UploadDropzone
                inputRef={fileInputRef}
                accept="image/*"
                onFiles={chooseReferenceFile}
                className="min-h-32 rounded-xl"
              >
                {previewUrl ? (
                  <span className="block w-full">
                    {/* eslint-disable-next-line @next/next/no-img-element -- Local file preview from user-selected upload. */}
                    <img
                      src={previewUrl}
                      alt={file?.name || "Reference upload preview"}
                      className="mx-auto max-h-32 rounded-lg object-contain"
                    />
                    <span className="mt-2 block text-[12px] font-medium text-app-text">
                      {file?.name}
                    </span>
                  </span>
                ) : (
                  <span>
                    <IconUpload className="mx-auto mb-2 size-7 text-app-muted-text" />
                    <span className="block text-[14px] font-semibold text-app-text">
                      Upload reference image
                    </span>
                    <span className="mt-1 block text-[12px] text-app-muted-text">
                      JPG, PNG, WEBP, or GIF
                    </span>
                  </span>
                )}
              </UploadDropzone>
              <Button
                variant="action"
                className="mt-2 w-full justify-center"
                disabled={importing || !file}
                onClick={() => void importReference("upload")}
              >
                {importing ? "Analyzing…" : "Upload and analyze"}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                className="h-11 min-w-0 flex-1 rounded-lg border border-app-panel-border bg-app-control-bg px-3 text-[14px] font-medium text-app-text outline-none focus:border-app-action"
                placeholder="Paste image URL"
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
              />
              <Button
                variant="action"
                disabled={importing || !imageUrl.trim()}
                onClick={() => void importReference("url")}
              >
                {importing ? "Analyzing…" : "Analyze"}
              </Button>
            </div>
          )}
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

function ModalSourceTabs({
  value,
  onChange,
  urlLabel = "Paste URL",
}: {
  value: "upload" | "url"
  onChange: (value: "upload" | "url") => void
  urlLabel?: string
}) {
  const tabs: Array<{ key: "upload" | "url"; label: string }> = [
    { key: "upload", label: "Upload" },
    { key: "url", label: urlLabel },
  ]
  return (
    <div className="inline-grid grid-cols-2 gap-1 rounded-lg bg-app-surface-subtle p-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          aria-pressed={value === tab.key}
          className={cn(
            "h-8 rounded-md px-4 text-[13px] font-medium text-app-muted-text transition",
            value === tab.key && "bg-app-surface text-app-text shadow-sm"
          )}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

async function loadReferenceAssets() {
  const payload = await fetchJsonWithTimeout<{ assets?: AssetRecord[] }>(
    "/api/assets?scope=ugc_avatar&category=reference&kind=image",
    {
      cache: "no-store",
      timeoutMs: 12_000,
      toastOnError: false,
    }
  )
  return payload.assets ?? []
}

export function MotionReferenceModal({
  selectedUrl,
  onSelect,
  onClose,
}: {
  selectedUrl: string
  onSelect: (url: string) => void
  onClose: () => void
}) {
  const [assets, setAssets] = useState<AssetRecord[]>([])
  const [source, setSource] = useState<"upload" | "url">("upload")
  const [url, setUrl] = useState(selectedUrl)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState("")
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let active = true
    void fetchJsonWithTimeout<{ assets?: AssetRecord[] }>(
      "/api/assets?scope=ugc_avatar&kind=video",
      { cache: "no-store", timeoutMs: 12_000, toastOnError: false }
    ).then((payload) => {
      if (active) {
        setAssets(payload.assets ?? [])
      }
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  function chooseFile(fileList: FileList | null) {
    const nextFile = Array.from(fileList ?? []).find((item) =>
      item.type.startsWith("video/")
    )
    if (!nextFile) {
      return
    }
    setUploadError("")
    setFile(nextFile)
    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current)
      }
      return URL.createObjectURL(nextFile)
    })
  }

  async function uploadMotionReference() {
    if (!file) {
      setUploadError("Choose a video to upload.")
      return
    }
    setUploading(true)
    setUploadError("")
    try {
      const formData = new FormData()
      formData.set("file", file)
      formData.set("scope", "ugc_avatar")
      formData.set("category", "reference")
      formData.set("name", file.name.replace(/\.[^.]+$/, ""))
      const payload = await fetchJsonWithTimeout<{ asset?: AssetRecord }>(
        "/api/assets/upload",
        {
          method: "POST",
          body: formData,
          timeoutMs: 60_000,
          toastOnError: false,
        }
      )
      if (!payload.asset?.fileUrl) {
        throw new Error("Motion reference upload failed")
      }
      setAssets((current) => [payload.asset!, ...current])
      onSelect(payload.asset.fileUrl)
      toast.success("Motion reference uploaded")
    } catch (error) {
      setUploadError(
        getApiErrorMessage(error, "Failed to upload motion reference")
      )
    } finally {
      setUploading(false)
    }
  }

  return (
    <AppModal className="z-[60] bg-[#24251f]/35" onClose={onClose}>
      <AppModalPanel className="max-w-[760px]">
        <AppModalHeader
          title="Motion reference"
          closeLabel="Close motion reference modal"
          onClose={onClose}
        />
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ModalSourceTabs value={source} onChange={setSource} />
            <p className="text-[12px] text-app-muted-text">
              {source === "upload"
                ? "Upload a video to drive the motion."
                : "Paste a video URL to drive the motion."}
            </p>
          </div>

          {source === "upload" ? (
            <>
              <UploadDropzone
                inputRef={inputRef}
                accept="video/*"
                onFiles={chooseFile}
                className="min-h-36 rounded-xl"
              >
                {previewUrl ? (
                  <span className="block w-full">
                    <video
                      src={previewUrl}
                      className="mx-auto aspect-video max-h-36 w-full rounded-lg object-cover"
                      muted
                      playsInline
                      controls
                    />
                    <span className="mt-2 block text-[12px] font-medium text-app-text">
                      {file?.name}
                    </span>
                  </span>
                ) : (
                  <span>
                    <IconUpload className="mx-auto mb-2 size-7 text-app-muted-text" />
                    <span className="block text-[14px] font-semibold text-app-text">
                      Upload motion reference video
                    </span>
                    <span className="mt-1 block text-[12px] text-app-muted-text">
                      MP4, MOV, or WEBM
                    </span>
                  </span>
                )}
              </UploadDropzone>
              {uploadError && (
                <div className="rounded-lg bg-app-danger-surface px-4 py-2 text-[13px] font-medium text-app-danger-muted">
                  {uploadError}
                </div>
              )}
              <Button
                variant="action"
                className="w-full justify-center"
                disabled={uploading || !file}
                onClick={() => void uploadMotionReference()}
              >
                {uploading ? "Uploading…" : "Upload and use"}
              </Button>
            </>
          ) : (
            <div className="flex gap-2">
              <input
                className="h-11 min-w-0 flex-1 rounded-lg border border-app-panel-border bg-app-control-bg px-3 text-[14px] font-medium text-app-text outline-none focus:border-app-action"
                placeholder="Paste video URL"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
              <Button
                variant="action"
                disabled={!url.trim()}
                onClick={() => {
                  if (url.trim()) {
                    onSelect(url.trim())
                  }
                }}
              >
                Use URL
              </Button>
            </div>
          )}

          {assets.length > 0 && (
            <div>
              <div className="mb-2 text-[11px] font-medium tracking-wide text-app-text-faint uppercase">
                Your motion references
              </div>
              <div className="grid max-h-[360px] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
                {assets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    className={cn(
                      "group overflow-hidden rounded-xl border bg-app-surface text-left transition",
                      selectedUrl === asset.fileUrl
                        ? "border-app-action ring-2 ring-app-action/30"
                        : "border-app-panel-border hover:border-app-muted-text/40"
                    )}
                    onClick={() => asset.fileUrl && onSelect(asset.fileUrl)}
                    disabled={!asset.fileUrl}
                    title={asset.name}
                  >
                    <span className="grid aspect-video w-full place-items-center bg-app-media-empty">
                      {asset.fileUrl ? (
                        <video
                          src={asset.fileUrl}
                          className="h-full w-full object-cover"
                          muted
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <IconPhoto
                          className="size-7 text-app-text-faint"
                          stroke={1.5}
                        />
                      )}
                    </span>
                    <span className="block truncate px-3 py-2 text-[12px] font-medium text-app-text-soft">
                      {asset.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

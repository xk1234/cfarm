"use client"

import { useState } from "react"
import { IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { SelectControl } from "@/components/ui/form-controls"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import {
  characterImageActionModelOptions,
  defaultCharacterImageActionModel,
} from "@/lib/realfarm-generation-model-registry"
import { cn } from "@/lib/utils"

export type ViewerImage = {
  imageUrl: string
  title: string
}

export function ImageViewerModal({
  image,
  caption,
  index,
  total,
  onCaptionChange,
  onImageReplace,
  onPrevious,
  onNext,
  onClose,
}: {
  image: ViewerImage
  caption: string
  index: number
  total: number
  onCaptionChange?: (caption: string) => void
  onImageReplace: (imageUrl: string) => void
  onPrevious: () => void
  onNext: () => void
  onClose: () => void
}) {
  const [activeTool, setActiveTool] = useState<"edit" | "upscale">("edit")
  const [prompt, setPrompt] = useState("")
  const [upscaleFactor, setUpscaleFactor] = useState("2")
  const [model, setModel] = useState(defaultCharacterImageActionModel)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState("")

  async function runImageAction() {
    setWorking(true)
    setError("")
    const toastId = toast.loading(
      activeTool === "edit" ? "Generating image edit..." : "Upscaling image..."
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
            mode: activeTool,
            imageUrl: image.imageUrl,
            prompt,
            upscaleFactor,
            model,
          }),
        }
      )
      if (!payload.imageUrl) {
        throw new Error("Image action failed")
      }
      onImageReplace(payload.imageUrl)
      toast.success(
        activeTool === "edit" ? "Image edit ready" : "Upscaled image ready",
        { id: toastId }
      )
    } catch (actionError) {
      const message = getApiErrorMessage(actionError, "Image action failed")
      setError(message)
      toast.error(message, { id: toastId })
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/86 text-white">
      <button
        className="absolute top-5 right-6 z-10 grid size-9 place-items-center rounded-full hover:bg-white/10"
        onClick={onClose}
        aria-label="Close image viewer"
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
            className="h-[54vh] min-h-[280px] w-full bg-contain bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${image.imageUrl})` }}
            role="img"
            aria-label={image.title}
          />
          <textarea
            className="mt-2 min-h-[44px] w-full max-w-[860px] resize-none bg-transparent text-center text-[15px] leading-6 font-semibold text-white outline-none placeholder:text-white/55"
            value={caption}
            readOnly={!onCaptionChange}
            placeholder="Add image caption..."
            onChange={(event) => onCaptionChange?.(event.target.value)}
          />
          <div className="mt-1 rounded-[3px] bg-black/55 px-4 py-1.5 text-[15px] font-bold">
            {index + 1} / {total}
          </div>
          <CollectionImageActionEditor
            activeTool={activeTool}
            prompt={prompt}
            upscaleFactor={upscaleFactor}
            model={model}
            working={working}
            error={error}
            onToolChange={setActiveTool}
            onPromptChange={setPrompt}
            onUpscaleFactorChange={setUpscaleFactor}
            onModelChange={setModel}
            onSubmit={() => void runImageAction()}
          />
        </div>
      </div>
    </div>
  )
}

function CollectionImageActionEditor({
  activeTool,
  prompt,
  upscaleFactor,
  model,
  working,
  error,
  onToolChange,
  onPromptChange,
  onUpscaleFactorChange,
  onModelChange,
  onSubmit,
}: {
  activeTool: "edit" | "upscale"
  prompt: string
  upscaleFactor: string
  model: string
  working: boolean
  error: string
  onToolChange: (tool: "edit" | "upscale") => void
  onPromptChange: (prompt: string) => void
  onUpscaleFactorChange: (factor: string) => void
  onModelChange: (model: string) => void
  onSubmit: () => void
}) {
  return (
    <div className="mt-2 w-full max-w-[860px] rounded-[8px] bg-white p-3 text-[#242421] shadow-xl">
      <div className="flex flex-wrap items-center gap-2">
        <div className="grid h-8 grid-cols-2 rounded-[6px] bg-[#ecebe4] p-0.5 text-[12px] font-semibold">
          {(["edit", "upscale"] as const).map((tool) => (
            <button
              key={tool}
              className={cn(
                "rounded-[5px] px-3 leading-none text-[#595852] capitalize",
                activeTool === tool && "bg-white text-[#242421] shadow-sm"
              )}
              onClick={() => onToolChange(tool)}
            >
              {tool}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="image-action-model">
          Image action model
        </label>
        <SelectControl
          id="image-action-model"
          aria-label="Image action model"
          className="h-8 min-w-[132px] rounded-[6px] border border-[#deddd5] bg-white px-2 text-[12px] font-semibold"
          value={model}
          onChange={(event) => onModelChange(event.target.value)}
        >
          {characterImageActionModelOptions.map((model) => (
            <option key={model.model} value={model.model}>
              {model.label}
            </option>
          ))}
        </SelectControl>
        {activeTool === "upscale" && (
          <SelectControl
            aria-label="Upscale factor"
            className="h-8 w-[78px] rounded-[6px] border border-[#deddd5] bg-white px-2 text-[12px] font-semibold"
            value={upscaleFactor}
            onChange={(event) => onUpscaleFactorChange(event.target.value)}
          >
            <option value="2">2x</option>
            <option value="4">4x</option>
          </SelectControl>
        )}
        <div className="min-w-2 flex-1" />
        <Button
          className="h-8 rounded-[6px] px-4 text-[12px]"
          disabled={working || (activeTool === "edit" && !prompt.trim())}
          onClick={onSubmit}
        >
          {working
            ? "Generating..."
            : activeTool === "edit"
              ? "Generate"
              : "Upscale"}
        </Button>
      </div>
      {activeTool === "edit" && (
        <textarea
          className="mt-2 min-h-[44px] w-full resize-none rounded-[6px] border border-[#deddd5] px-3 py-2 text-[13px] leading-5 font-medium outline-none placeholder:text-[#aaa]"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder="Describe the edit you want to make..."
        />
      )}
      {error && (
        <div className="mt-2 rounded-[6px] bg-[#fff3f0] px-3 py-2 text-[12px] font-semibold text-[#b44d38]">
          {error}
        </div>
      )}
    </div>
  )
}

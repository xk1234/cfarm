"use client"

import { useEffect, useRef, useState } from "react"
import {
  IconBug,
  IconPlus,
  IconSparkles,
  IconUpload,
} from "@tabler/icons-react"
import { Folder, Pencil, Trash2 } from "lucide-react"
import { Select } from "radix-ui"
import { useDropzone } from "react-dropzone"
import { toast } from "sonner"

import {
  CharacterAssetsPanel,
  GenerationDebugModal,
  GenerationImagePreviewModal,
  MotionReferenceModal,
  PromptDebugModal,
  ReferenceImageModal,
} from "@/components/realfarm/characters/modals"
import {
  CharacterAvatar,
  GenerationPreview,
  PromptInputRow,
  type PromptInputItem,
} from "@/components/realfarm/characters/shared-components"
import {
  BottomWorkflowControls,
  CharacterWorkflowEmptyState,
} from "@/components/realfarm/characters/workflow-panels"
import {
  buildWorkflowMetadata,
  compileWorkflowUserPrompt,
  createPendingGenerationId,
  generationCountForWorkflow,
} from "@/components/realfarm/characters/workflow-helpers"
import { Button } from "@/components/ui/button"
import { CardGridSkeleton } from "@/components/ui/loading-skeleton"
import { SelectControl } from "@/components/ui/form-controls"
import { UploadDropzone } from "@/components/ui/upload-dropzone"
import type { AssetRecord } from "@/lib/assets"
import type { CharacterRecord } from "@/lib/characters"
import {
  fetchJsonWithTimeout,
  getApiErrorMessage,
  toastApiError,
} from "@/lib/client-api"
import {
  buildCharacterPromptPackage,
  characterImageAspectRatios,
  characterWorkflowOptions,
  createCharacterImageGenerationRecord,
  defaultCharacterPreviewUrl,
  getCharacterWorkflowMode,
  type CharacterGenerationView,
  type CharacterPromptAttachment,
  type CharacterWorkflowKey,
  type CharacterWorkflowMetadata,
  characterGenerationModels,
  defaultImageGenerationModel,
  formatCharacterValue,
  visibleCharacterWorkflowOptions,
} from "@/lib/realfarm-character-ui"
import { cn } from "@/lib/utils"

export function CharactersView({
  characters,
  selectedCharacter,
  onSelect,
  onNew,
  onEdit,
  onDelete,
  onRename,
}: {
  characters: CharacterRecord[]
  selectedCharacter: CharacterRecord
  onSelect: (id: string) => void
  onNew: () => void
  onEdit: (character: CharacterRecord) => void
  onDelete: (id: string) => void | Promise<void>
  onRename: (character: CharacterRecord, name: string) => void | Promise<void>
}) {
  const [prompt, setPrompt] = useState("")
  const [activeWorkflow, setActiveWorkflow] =
    useState<CharacterWorkflowKey>("free_generate")
  const [recreateMode] = useState("Full style recreation")
  const [referenceImageUrl, setReferenceImageUrl] = useState("")
  const [selectedReferenceAsset, setSelectedReferenceAsset] =
    useState<AssetRecord | null>(null)
  const [motionVideoUrl, setMotionVideoUrl] = useState("")
  const [motionReferenceOpen, setMotionReferenceOpen] = useState(false)
  const [selfieTemplate, setSelfieTemplate] = useState(
    "barely_awake_oversized_tee"
  )
  const [breastSize, setBreastSize] = useState("d cup")
  const [clothingImageUrl] = useState("")
  const [imageGenerateCount, setImageGenerateCount] = useState(1)
  const [photoDumpCount, setPhotoDumpCount] = useState(8)
  const [slideshowSlides, setSlideshowSlides] = useState(6)
  const [productName, setProductName] = useState("")
  const [productAudience, setProductAudience] = useState("")
  const [productAngle, setProductAngle] = useState("")
  const [moduleRecipe, setModuleRecipe] = useState<Record<string, string>>({
    action: "Mirror selfie",
    pose: "Standing mirror selfie",
    expression: "Soft pout",
    hair: "Long loose waves",
    top: "Cropped tee",
    bottom: "Denim skirt",
    device: "Clear phone case",
    photography: "Casual smartphone mirror selfie",
    background: "Minimal bedroom",
  })
  const [referenceOpen, setReferenceOpen] = useState(false)
  const [assetsOpen, setAssetsOpen] = useState(false)
  const [selectedAssets, setSelectedAssets] = useState<AssetRecord[]>([])
  const [debugOpen, setDebugOpen] = useState(false)
  const sourceImageInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedModel, setSelectedModel] = useState(
    defaultImageGenerationModel
  )
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<
    (typeof characterImageAspectRatios)[number]
  >(characterImageAspectRatios[0])
  const [generations, setGenerations] = useState<CharacterGenerationView[]>([])
  const [loadedGenerationsCharacterId, setLoadedGenerationsCharacterId] =
    useState<string | null>(null)
  const generationsLoading =
    loadedGenerationsCharacterId !== selectedCharacter.id
  const [selectedGeneration, setSelectedGeneration] =
    useState<CharacterGenerationView | null>(null)
  const {
    getRootProps: getGenerationDropRootProps,
    isDragActive: generationDropActive,
  } = useDropzone({
    accept: { "image/*": [] },
    multiple: true,
    noClick: true,
    noKeyboard: true,
    onDropAccepted: (files) => void uploadDroppedGenerationImages(files),
  })
  const [debugGeneration, setDebugGeneration] =
    useState<CharacterGenerationView | null>(null)
  const [previewGeneration, setPreviewGeneration] =
    useState<CharacterGenerationView | null>(null)
  const [nameEdit, setNameEdit] = useState({
    id: selectedCharacter.id,
    draft: selectedCharacter.name,
    editing: false,
  })
  const renamingName = nameEdit.id === selectedCharacter.id && nameEdit.editing
  const nameDraft =
    nameEdit.id === selectedCharacter.id
      ? nameEdit.draft
      : selectedCharacter.name
  const hasEditSource = Boolean(selectedGeneration?.imageUrl)
  const currentWorkflow =
    getCharacterWorkflowMode(activeWorkflow) === "edit" && !hasEditSource
      ? "free_generate"
      : activeWorkflow
  const isEditWorkflow = getCharacterWorkflowMode(currentWorkflow) === "edit"
  const workflowOptions = visibleCharacterWorkflowOptions(hasEditSource)
  const currentReferenceImageUrl =
    selectedReferenceAsset?.fileUrl || referenceImageUrl
  const selectedOutfitAsset = selectedAssets.find(
    (asset) => asset.category === "outfit" && asset.fileUrl
  )
  const promptPackage = buildCharacterPromptPackage({
    userPrompt: compileWorkflowUserPrompt({
      workflow: currentWorkflow,
      prompt: isEditWorkflow ? "" : prompt,
      characterName: selectedCharacter.name,
      moduleRecipe,
      recreateMode,
      referenceImageUrl: currentReferenceImageUrl,
      motionVideoUrl,
      selfieTemplate,
      breastSize,
      clothingImageUrl: selectedOutfitAsset?.fileUrl || clothingImageUrl,
      photoDumpCount,
      slideshowSlides,
      productName,
      productAudience,
      productAngle,
    }),
    character: selectedCharacter,
    assets: selectedAssets,
  })
  const activeWorkflowOption =
    characterWorkflowOptions.find((option) => option.key === currentWorkflow) ??
    characterWorkflowOptions[0]
  const workflowMetadata = buildWorkflowMetadata({
    workflow: currentWorkflow,
    workflowLabel: activeWorkflowOption.label,
    moduleRecipe,
    recreateMode,
    referenceImageUrl: currentReferenceImageUrl,
    motionVideoUrl,
    selfieTemplate,
    breastSize,
    clothingImageUrl: selectedOutfitAsset?.fileUrl || clothingImageUrl,
    photoDumpCount,
    slideshowSlides,
    productName,
    productAudience,
    productAngle,
  })
  const workflowGenerateCount = generationCountForWorkflow({
    workflow: currentWorkflow,
    imageGenerateCount,
    photoDumpCount,
    slideshowSlides,
  })
  const promptInputs: PromptInputItem[] = []
  if (selectedGeneration?.imageUrl) {
    promptInputs.push({
      id: "source",
      url: selectedGeneration.imageUrl,
      label: "Source",
      accent: true,
      onRemove: () => setSelectedGeneration(null),
    })
  }
  promptInputs.push({
    id: "character",
    url: selectedCharacter.preview_url || defaultCharacterPreviewUrl,
    label: "Character",
  })
  if (currentWorkflow === "recreate_reference" && currentReferenceImageUrl) {
    promptInputs.push({
      id: "reference",
      url: currentReferenceImageUrl,
      label: "Reference",
      onRemove: () => {
        setSelectedReferenceAsset(null)
        setReferenceImageUrl("")
      },
    })
  }
  for (const asset of selectedAssets) {
    if (!asset.fileUrl) {
      continue
    }
    promptInputs.push({
      id: asset.id,
      url: asset.fileUrl,
      label: asset.category === "outfit" ? "Outfit" : asset.name,
      onRemove: () =>
        setSelectedAssets((current) =>
          current.filter((item) => item.id !== asset.id)
        ),
    })
  }
  const generateBlockReason =
    isEditWorkflow && !selectedGeneration?.imageUrl
      ? "Select a source image first"
      : currentWorkflow === "recreate_reference" && !currentReferenceImageUrl
        ? "Add a reference image"
        : currentWorkflow === "outfit_transfer" && !selectedOutfitAsset?.fileUrl
          ? "Choose an outfit asset"
          : currentWorkflow === "motion_control" && !motionVideoUrl
            ? "Add a motion reference"
            : ""
  useEffect(() => {
    let active = true
    void fetchJsonWithTimeout<{
      generations?: CharacterGenerationView[]
    }>(`/api/characters/images?characterId=${selectedCharacter.id}`, {
      cache: "no-store",
      timeoutMs: 12_000,
      toastOnError: false,
    })
      .then((payload) => {
        if (active) {
          setGenerations(payload.generations ?? [])
          setSelectedGeneration(null)
        }
      })
      .catch((error) => {
        if (active) {
          toastApiError(error, "Failed to load generated character images")
          setGenerations([])
          setSelectedGeneration(null)
        }
      })
      .finally(() => {
        if (active) {
          setLoadedGenerationsCharacterId(selectedCharacter.id)
        }
      })

    return () => {
      active = false
    }
  }, [selectedCharacter.id])

  async function commitNameEdit() {
    const nextName = nameDraft.trim()
    if (nextName && nextName !== selectedCharacter.name) {
      await onRename(selectedCharacter, nextName)
    }
    setNameEdit({
      id: selectedCharacter.id,
      draft: nextName || selectedCharacter.name,
      editing: false,
    })
  }

  async function generateCharacterImage() {
    for (let index = 0; index < workflowGenerateCount; index += 1) {
      await generateSingleCharacterImage(index)
    }
  }

  async function deleteGeneration(generation: CharacterGenerationView) {
    setGenerations((current) =>
      current.filter((item) => item.id !== generation.id)
    )
    setSelectedGeneration((current) =>
      current?.id === generation.id ? null : current
    )
    setDebugGeneration((current) =>
      current?.id === generation.id ? null : current
    )

    if (generation.status === "processing") {
      toast.success("Generation removed")
      return
    }

    try {
      const result = await fetchJsonWithTimeout<{
        deleted?: boolean
        deletedFiles?: number
        error?: string
      }>(`/api/characters/images/${encodeURIComponent(generation.id)}`, {
        method: "DELETE",
        timeoutMs: 20_000,
        toastOnError: false,
      })
      if (result.error) {
        throw new Error(result.error)
      }
      toast.success(
        result.deletedFiles
          ? "Generation deleted from disk"
          : "Generation deleted"
      )
    } catch (error) {
      setGenerations((current) => [generation, ...current])
      toastApiError(error, "Failed to delete generation")
    }
  }

  async function uploadDroppedGenerationImages(
    files: FileList | File[] | null
  ) {
    const imageFiles = Array.from(files ?? []).filter((file) =>
      file.type.startsWith("image/")
    )
    if (imageFiles.length === 0) {
      toast.error("Drop image files into the generated images area")
      return
    }

    const toastId = toast.loading(
      imageFiles.length === 1
        ? "Adding source image..."
        : "Adding source images..."
    )
    try {
      const uploaded: CharacterGenerationView[] = []
      for (const file of imageFiles) {
        const formData = new FormData()
        formData.set("file", file)
        formData.set("characterId", String(selectedCharacter.id))
        formData.set("aspectRatio", selectedAspectRatio)
        formData.set("prompt", `Dropped source image: ${file.name}`)
        const payload = await fetchJsonWithTimeout<{
          generation?: CharacterGenerationView
          error?: string
        }>("/api/characters/images", {
          method: "POST",
          body: formData,
          timeoutMs: 60_000,
          toastOnError: false,
        })
        if (!payload.generation) {
          throw new Error(payload.error || "Failed to add source image")
        }
        uploaded.push(payload.generation)
      }
      setGenerations((current) => [
        ...uploaded,
        ...current.filter(
          (generation) => !uploaded.some((item) => item.id === generation.id)
        ),
      ])
      setSelectedGeneration(uploaded[0] ?? null)
      toast.success(
        uploaded.length === 1
          ? "Source image added"
          : `${uploaded.length} source images added`,
        { id: toastId }
      )
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to add source image"), {
        id: toastId,
      })
    }
  }

  async function generateSingleCharacterImage(batchIndex: number) {
    if (isEditWorkflow && !selectedGeneration?.imageUrl) {
      toast.error("Select a generated image before using edit workflows")
      return
    }
    if (currentWorkflow === "recreate_reference" && !currentReferenceImageUrl) {
      toast.error("Select an analyzed reference image first")
      return
    }
    if (
      currentWorkflow === "outfit_transfer" &&
      !selectedOutfitAsset?.fileUrl
    ) {
      toast.error("Select an outfit asset first")
      return
    }
    if (currentWorkflow === "motion_control" && !motionVideoUrl) {
      toast.error("Select a motion reference video first")
      return
    }

    const generationId = createPendingGenerationId(batchIndex)
    const indexedMetadata =
      workflowGenerateCount > 1
        ? {
            ...workflowMetadata,
            recipe: {
              ...workflowMetadata.recipe,
              batchIndex: batchIndex + 1,
              batchCount: workflowGenerateCount,
            },
          }
        : workflowMetadata
    const pending = createCharacterImageGenerationRecord({
      id: generationId,
      prompt: promptPackage.prompt,
      model: selectedModel,
      aspectRatio: selectedAspectRatio,
      attachments: promptPackage.attachments,
      status: "processing",
      progress: 12,
      workflow: currentWorkflow,
      workflowLabel: activeWorkflowOption.label,
      workflowMetadata: indexedMetadata,
    })
    setGenerations((current) => [pending, ...current])

    try {
      setGenerations((current) =>
        current.map((generation) =>
          generation.id === generationId
            ? { ...generation, progress: 42 }
            : generation
        )
      )
      const result = await runCharacterWorkflowOrImageGeneration({
        workflow: currentWorkflow,
        selectedCharacter,
        prompt: promptPackage.prompt,
        userPrompt: isEditWorkflow ? "" : prompt,
        selectedModel,
        selectedAspectRatio,
        attachments: promptPackage.attachments,
        workflowLabel: activeWorkflowOption.label,
        workflowMetadata: indexedMetadata,
        sourceGenerationImageUrl: selectedGeneration?.imageUrl || "",
        referenceImageUrl: currentReferenceImageUrl,
        referenceAnalysis: selectedReferenceAsset?.metadata?.analysis,
        motionVideoUrl,
        selfieTemplate,
        breastSize,
        clothingImageUrl: selectedOutfitAsset?.fileUrl || clothingImageUrl,
      })
      if (
        !result.imageUrl &&
        !result.videoUrl &&
        !result.generation?.imageUrl &&
        !result.generation?.videoUrl
      ) {
        throw new Error(result.error || "Generation failed")
      }
      setGenerations((current) =>
        current.map((generation) =>
          generation.id === generationId
            ? {
                ...(result.generation ?? generation),
                status: "ready",
                imageUrl: result.imageUrl ?? result.generation?.imageUrl,
                videoUrl: result.videoUrl ?? result.generation?.videoUrl,
                videoStatus:
                  result.videoUrl || result.generation?.videoUrl
                    ? "ready"
                    : result.generation?.videoStatus,
                videoProgress:
                  result.videoUrl || result.generation?.videoUrl
                    ? 100
                    : result.generation?.videoProgress,
                progress: 100,
              }
            : generation
        )
      )
      toast.success(
        workflowGenerateCount > 1
          ? `${activeWorkflowOption.label} image ${batchIndex + 1}/${workflowGenerateCount} ready`
          : isEditWorkflow
            ? "Edit workflow ready"
            : "Character image ready"
      )
    } catch (error) {
      const message = getApiErrorMessage(error, "Image generation failed")
      setGenerations((current) =>
        current.map((generation) =>
          generation.id === generationId
            ? {
                ...generation,
                status: "failed",
                error: message,
                progress: 100,
              }
            : generation
        )
      )
      toast.error(message)
    }
  }

  return (
    <div className="grid min-h-[calc(100svh-72px)] overflow-hidden rounded-[8px] bg-app-surface-subtle lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="border-r border-app-panel-border bg-app-surface-subtle px-2 py-4">
        <h1 className="px-3 text-[20px] font-semibold tracking-tight text-app-text">
          AI Characters
        </h1>
        <Button
          variant="action"
          size="largeAction"
          className="mt-6 w-full"
          onClick={onNew}
        >
          <IconPlus className="mr-2 size-5" />
          New Character
        </Button>
        <div className="mt-4 space-y-1.5">
          {characters.map((character) => (
            <div
              key={character.id}
              role="button"
              tabIndex={0}
              className={cn(
                "group relative flex h-[68px] w-full cursor-pointer items-center gap-3 rounded-xl border border-transparent bg-app-surface px-3 text-left transition hover:border-app-panel-border",
                selectedCharacter.id === character.id &&
                  "border-app-action ring-1 ring-app-action"
              )}
              onClick={() => onSelect(character.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  onSelect(character.id)
                }
              }}
            >
              <CharacterAvatar character={character} sizeClassName="size-11" />
              <span className="min-w-0 flex-1 pr-14">
                <span className="block truncate text-[15px] font-semibold text-app-text">
                  {character.name}
                </span>
                <span className="mt-0.5 flex items-center gap-3 text-[13px] text-app-muted-text">
                  <span>
                    {formatCharacterValue(character.attributes.gender)}
                  </span>
                  <span>{character.attributes.age || "None"}</span>
                </span>
              </span>
              <span className="absolute top-1/2 right-2 hidden -translate-y-1/2 items-center gap-1 group-hover:flex">
                <button
                  className="grid size-8 place-items-center rounded-lg border border-app-panel-border bg-app-surface text-app-muted-text hover:bg-app-control-hover hover:text-app-text"
                  aria-label={`Edit ${character.name}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onEdit(character)
                  }}
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  className="grid size-8 place-items-center rounded-lg border border-app-panel-border bg-app-surface text-app-danger hover:bg-app-danger-surface"
                  aria-label={`Delete ${character.name}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    void onDelete(character.id)
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              </span>
            </div>
          ))}
        </div>
      </aside>

      <main className="relative h-[calc(100svh-72px)] overflow-hidden bg-app-surface-subtle px-7 py-6">
        <div className="relative z-20 flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <CharacterAvatar
              character={selectedCharacter}
              sizeClassName="size-14"
            />
            <div className="min-w-0">
              {renamingName ? (
                <input
                  className="h-10 min-w-[260px] rounded-lg border border-app-panel-border bg-app-surface px-3 text-[24px] font-semibold text-app-text shadow-sm outline-none focus:border-app-action"
                  value={nameDraft}
                  onChange={(event) =>
                    setNameEdit({
                      id: selectedCharacter.id,
                      draft: event.target.value,
                      editing: true,
                    })
                  }
                  onBlur={() => void commitNameEdit()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void commitNameEdit()
                    }
                    if (event.key === "Escape") {
                      setNameEdit({
                        id: selectedCharacter.id,
                        draft: selectedCharacter.name,
                        editing: false,
                      })
                    }
                  }}
                  aria-label="Character name"
                  autoFocus
                />
              ) : (
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[26px] font-semibold tracking-tight text-app-text">
                    {selectedCharacter.name}
                  </span>
                  <button
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-app-text-faint hover:bg-app-control-hover hover:text-app-text"
                    onClick={() => {
                      setNameEdit({
                        id: selectedCharacter.id,
                        draft: selectedCharacter.name,
                        editing: true,
                      })
                    }}
                    aria-label="Rename character"
                  >
                    <Pencil className="size-5" />
                  </button>
                </div>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-app-muted-text">
                <span>
                  {formatCharacterValue(selectedCharacter.attributes.gender)}
                </span>
                <span aria-hidden className="text-app-text-faint">
                  ·
                </span>
                <span>{selectedCharacter.attributes.age || "No age"}</span>
                <span aria-hidden className="text-app-text-faint">
                  ·
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-app-control-hover px-2 py-0.5 text-[12px] font-medium text-app-text-soft">
                  Headshot locked
                </span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              className="grid w-10 place-items-center"
              aria-label="Debug prompt"
              onClick={() => setDebugOpen(true)}
            >
              <IconBug className="size-5" />
            </Button>
            <UploadDropzone
              inputRef={sourceImageInputRef}
              accept="image/*"
              multiple
              onFiles={(files) => void uploadDroppedGenerationImages(files)}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => sourceImageInputRef.current?.click()}
            >
              <IconUpload className="mr-2 size-4" />
              Upload image
            </Button>
            <Button variant="outline" onClick={() => onEdit(selectedCharacter)}>
              <Pencil className="mr-2 size-4" />
              Edit character
            </Button>
          </div>
        </div>

        <div
          {...getGenerationDropRootProps({
            className: cn(
              "absolute inset-x-0 top-[104px] bottom-0 overflow-y-auto px-7 pt-8 pb-64",
              !generationsLoading &&
                generations.length === 0 &&
                "grid place-items-center text-center"
            ),
          })}
        >
          {generationDropActive && (
            <div className="pointer-events-none absolute inset-4 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-app-action bg-app-surface/85 text-center shadow-[0_12px_32px_rgba(30,30,25,0.12)] backdrop-blur-sm">
              <div>
                <IconUpload className="mx-auto size-10 text-app-action" />
                <div className="mt-3 text-[18px] font-semibold text-app-text">
                  Drop images to add source cards
                </div>
                <div className="mt-1 text-[13px] text-app-muted-text">
                  They will appear in this grid and can be selected for edit
                  workflows.
                </div>
              </div>
            </div>
          )}
          {generationsLoading ? (
            <CardGridSkeleton
              count={6}
              className="md:grid-cols-2 xl:grid-cols-3"
            />
          ) : generations.length === 0 ? (
            <CharacterWorkflowEmptyState
              characterName={selectedCharacter.name}
              onSelectWorkflow={(workflow) => {
                setActiveWorkflow(workflow)
                if (workflow === "recreate_reference") {
                  setReferenceOpen(true)
                }
              }}
            />
          ) : (
            <div className="mx-auto grid max-w-[760px] grid-cols-2 gap-4 md:grid-cols-3">
              {generations.map((generation) => (
                <div
                  key={generation.id}
                  role="button"
                  tabIndex={0}
                  className="group relative block overflow-hidden rounded-[10px] bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-app-action"
                  onClick={() => {
                    if (generation.imageUrl) {
                      setPreviewGeneration(generation)
                    }
                  }}
                  onKeyDown={(event) => {
                    if (
                      (event.key === "Enter" || event.key === " ") &&
                      generation.imageUrl
                    ) {
                      event.preventDefault()
                      setPreviewGeneration(generation)
                    }
                  }}
                >
                  <GenerationPreview
                    generation={generation}
                    selectedCharacter={selectedCharacter}
                    selected={selectedGeneration?.id === generation.id}
                  />
                  {generation.imageUrl && (
                    <button
                      type="button"
                      className="absolute top-2 left-2 z-10 rounded-full border border-white/70 bg-white/90 px-3 py-1 text-[12px] font-semibold text-[#252520] shadow-sm backdrop-blur hover:bg-white"
                      aria-label="Use as source image"
                      title="Use as source"
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelectedGeneration(generation)
                        if (
                          getCharacterWorkflowMode(currentWorkflow) !== "edit"
                        ) {
                          toast.success("Selected as edit source")
                        }
                      }}
                    >
                      Use
                    </button>
                  )}
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    <button
                      type="button"
                      className="grid size-8 place-items-center rounded-full border border-white/70 bg-black/55 text-white shadow-sm backdrop-blur hover:bg-black/75"
                      aria-label="Debug generation"
                      title="Debug generation"
                      onClick={(event) => {
                        event.stopPropagation()
                        setDebugGeneration(generation)
                      }}
                    >
                      <IconBug className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="grid size-8 place-items-center rounded-full border border-white/70 bg-black/55 text-white shadow-sm backdrop-blur hover:bg-app-danger"
                      aria-label="Delete generation"
                      title="Delete generation"
                      onClick={(event) => {
                        event.stopPropagation()
                        void deleteGeneration(generation)
                      }}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <section className="absolute inset-x-8 bottom-6 z-30 mx-auto max-w-[760px] overflow-hidden rounded-2xl border border-app-panel-border bg-app-surface shadow-[0_12px_32px_rgba(30,30,25,0.12)]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-app-panel-border bg-app-surface-subtle px-4 py-2.5">
            <label className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-app-text-faint uppercase">
              Mode
              <SelectControl
                aria-label="Character generation workflow"
                value={currentWorkflow}
                onChange={(event) =>
                  setActiveWorkflow(event.target.value as CharacterWorkflowKey)
                }
              >
                <optgroup label="Create">
                  {workflowOptions
                    .filter(
                      (workflow) =>
                        getCharacterWorkflowMode(workflow.key) === "create"
                    )
                    .map((workflow) => (
                      <option key={workflow.key} value={workflow.key}>
                        {workflow.label}
                      </option>
                    ))}
                </optgroup>
                {hasEditSource && (
                  <optgroup label="Edit selected image">
                    {workflowOptions
                      .filter(
                        (workflow) =>
                          getCharacterWorkflowMode(workflow.key) === "edit"
                      )
                      .map((workflow) => (
                        <option key={workflow.key} value={workflow.key}>
                          {workflow.label}
                        </option>
                      ))}
                  </optgroup>
                )}
              </SelectControl>
            </label>
            <p className="min-w-0 flex-1 truncate text-[13px] text-app-muted-text">
              {activeWorkflowOption.description}
            </p>
          </div>

          <div className="px-4 pt-3 pb-2">
            {!isEditWorkflow && (
              <textarea
                className="h-20 w-full resize-none bg-transparent text-[15px] leading-relaxed text-app-text outline-none placeholder:text-app-text-faint"
                placeholder={activeWorkflowOption.placeholder}
                aria-label="Edit AI UGC character prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
            )}
            <BottomWorkflowControls
              workflow={currentWorkflow}
              selectedReferenceAsset={selectedReferenceAsset}
              selectedOutfitAsset={selectedOutfitAsset}
              motionVideoUrl={motionVideoUrl}
              selfieTemplate={selfieTemplate}
              onSelfieTemplateChange={setSelfieTemplate}
              breastSize={breastSize}
              onBreastSizeChange={setBreastSize}
              imageGenerateCount={imageGenerateCount}
              onImageGenerateCountChange={setImageGenerateCount}
              photoDumpCount={photoDumpCount}
              onPhotoDumpCountChange={setPhotoDumpCount}
              slideshowSlides={slideshowSlides}
              onSlideshowSlidesChange={setSlideshowSlides}
              productName={productName}
              onProductNameChange={setProductName}
              productAudience={productAudience}
              onProductAudienceChange={setProductAudience}
              productAngle={productAngle}
              onProductAngleChange={setProductAngle}
              moduleRecipe={moduleRecipe}
              onModuleRecipeChange={setModuleRecipe}
              onOpenReference={() => setReferenceOpen(true)}
              onOpenOutfits={() => setAssetsOpen(true)}
              onOpenMotion={() => setMotionReferenceOpen(true)}
            />
            <div className="mt-3">
              <PromptInputRow items={promptInputs} ariaLabel="Prompt inputs" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-app-panel-border px-4 py-2.5">
            {!isEditWorkflow && (
              <Button
                variant="softControl"
                size="lg"
                onClick={() => setAssetsOpen(true)}
              >
                <Folder className="mr-2 size-4" />
                Assets
              </Button>
            )}
            {generateBlockReason && (
              <span className="text-[12px] font-medium text-app-danger-muted">
                {generateBlockReason}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <label className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-app-text-faint uppercase">
                Ratio
                <SelectControl
                  aria-label="Image aspect ratio"
                  value={selectedAspectRatio}
                  onChange={(event) =>
                    setSelectedAspectRatio(
                      event.target
                        .value as (typeof characterImageAspectRatios)[number]
                    )
                  }
                >
                  {characterImageAspectRatios.map((ratio) => (
                    <option key={ratio} value={ratio}>
                      {ratio}
                    </option>
                  ))}
                </SelectControl>
              </label>
              <Select.Root
                value={selectedModel}
                onValueChange={setSelectedModel}
              >
                <Select.Trigger asChild>
                  <Button variant="outline">
                    <IconSparkles className="mr-2 size-4" />
                    <Select.Value />
                  </Button>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content
                    side="top"
                    sideOffset={8}
                    position="popper"
                    className="z-50 w-[210px] overflow-hidden rounded-lg border border-app-panel-border bg-app-control-bg p-1 shadow-xl"
                  >
                    <Select.Viewport>
                      {characterGenerationModels.map((model) => (
                        <Select.Item
                          key={model}
                          value={model}
                          className={cn(
                            "flex h-10 w-full cursor-default items-center rounded-md px-3 text-left text-sm font-medium text-app-text outline-none data-[highlighted]:bg-app-control-hover",
                            selectedModel === model && "bg-app-control-hover"
                          )}
                        >
                          <Select.ItemText>{model}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
              <Button
                variant="action"
                size="lg"
                disabled={Boolean(generateBlockReason)}
                title={generateBlockReason || undefined}
                onClick={() => void generateCharacterImage()}
              >
                {workflowGenerateCount > 1
                  ? `Generate ${workflowGenerateCount}`
                  : currentWorkflow === "animate_image"
                    ? "Generate image"
                    : "Generate"}
              </Button>
            </div>
          </div>
        </section>
      </main>
      {referenceOpen && (
        <ReferenceImageModal
          selectedAssetId={selectedReferenceAsset?.id}
          onSelect={(asset) => {
            setSelectedReferenceAsset(asset)
            setReferenceImageUrl(asset.fileUrl || "")
            setReferenceOpen(false)
          }}
          onClose={() => setReferenceOpen(false)}
        />
      )}
      {assetsOpen && (
        <CharacterAssetsPanel
          selectedAssetIds={selectedAssets.map((asset) => asset.id)}
          onToggleAsset={(asset) => {
            setSelectedAssets((current) =>
              current.some((item) => item.id === asset.id)
                ? current.filter((item) => item.id !== asset.id)
                : [asset, ...current]
            )
          }}
          onClose={() => setAssetsOpen(false)}
        />
      )}
      {motionReferenceOpen && (
        <MotionReferenceModal
          selectedUrl={motionVideoUrl}
          onSelect={(url) => {
            setMotionVideoUrl(url)
            setMotionReferenceOpen(false)
          }}
          onClose={() => setMotionReferenceOpen(false)}
        />
      )}
      {debugOpen && (
        <PromptDebugModal
          prompt={promptPackage.prompt}
          attachments={promptPackage.attachments}
          onClose={() => setDebugOpen(false)}
        />
      )}
      {debugGeneration && (
        <GenerationDebugModal
          generation={debugGeneration}
          onClose={() => setDebugGeneration(null)}
        />
      )}
      {previewGeneration?.imageUrl && (
        <GenerationImagePreviewModal
          generation={previewGeneration}
          onClose={() => setPreviewGeneration(null)}
        />
      )}
    </div>
  )
}

async function runCharacterWorkflowOrImageGeneration(input: {
  workflow: CharacterWorkflowKey
  selectedCharacter: CharacterRecord
  prompt: string
  userPrompt: string
  selectedModel: string
  selectedAspectRatio: string
  attachments: CharacterPromptAttachment[]
  workflowLabel: string
  workflowMetadata: CharacterWorkflowMetadata
  sourceGenerationImageUrl: string
  referenceImageUrl: string
  referenceAnalysis?: unknown
  motionVideoUrl: string
  selfieTemplate: string
  breastSize: string
  clothingImageUrl: string
}) {
  if (
    input.workflow === "recreate_reference" ||
    input.workflow === "motion_control" ||
    input.workflow === "seedream_bedroom_selfie" ||
    input.workflow === "outfit_transfer" ||
    input.workflow === "pose_variation_cut_video"
  ) {
    const characterImageUrl = input.sourceGenerationImageUrl
    if (!characterImageUrl) {
      throw new Error("Select a generated image before using this workflow")
    }
    const payload = await fetchJsonWithTimeout<{
      imageUrl?: string
      videoUrl?: string
      generation?: CharacterGenerationView
      error?: string
    }>("/api/characters/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeoutMs: 900_000,
      toastOnError: false,
      body: JSON.stringify({
        workflow: input.workflow,
        characterId: input.selectedCharacter.id,
        characterName: input.selectedCharacter.name,
        characterAttributes: input.selectedCharacter.attributes,
        characterImageUrl,
        referenceImageUrl: input.referenceImageUrl,
        referenceAnalysis: input.referenceAnalysis,
        motionVideoUrl: input.motionVideoUrl,
        clothingImageUrl: input.clothingImageUrl,
        prompt: input.userPrompt,
        aspectRatio: input.selectedAspectRatio,
        selfieTemplate: input.selfieTemplate,
        breastSize: input.breastSize,
      }),
    })
    return payload
  }

  return fetchJsonWithTimeout<{
    imageUrl?: string
    videoUrl?: string
    generation?: CharacterGenerationView
    error?: string
  }>("/api/characters/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    timeoutMs: 300_000,
    toastOnError: false,
    body: JSON.stringify({
      characterId: input.selectedCharacter.id,
      prompt: input.prompt,
      model: input.selectedModel,
      aspectRatio: input.selectedAspectRatio,
      attachments: input.attachments,
      workflow: input.workflow,
      workflowLabel: input.workflowLabel,
      workflowMetadata: input.workflowMetadata,
    }),
  })
}

"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  IconBug,
  IconChevronLeft,
  IconChevronRight,
  IconPhoto,
  IconPlus,
  IconSparkles,
  IconUpload,
  IconX,
} from "@tabler/icons-react"
import { Folder, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  CharacterCreateModal,
  NewCharacterModal,
} from "@/components/realfarm/character-create"
import { Button } from "@/components/ui/button"
import { useDismissableLayer } from "@/components/ui/dismissable"
import { SelectControl } from "@/components/ui/form-controls"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import { UploadDropzone } from "@/components/ui/upload-dropzone"
import type { AssetCategory, AssetKind, AssetRecord } from "@/lib/assets"
import type { CharacterPayload, CharacterRecord } from "@/lib/characters"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import {
  assetCategoryByTab,
  assetTabs,
  type AssetTab,
} from "@/lib/realfarm-asset-ui-config"
import {
  buildCharacterPromptPackage,
  characterImageAspectRatios,
  characterGenerationPrimaryMedia,
  imageActionModels,
  characterImageToVideoModels,
  characterWorkflowOptions,
  createCharacterImageGenerationRecord,
  getCharacterWorkflowMode,
  type CharacterImageGenerationRecord,
  type CharacterPromptAttachment,
  type CharacterWorkflowKey,
  type CharacterWorkflowMetadata,
  characterGenerationModels,
  defaultImageActionModel,
  defaultImageToVideoModel,
  defaultImageGenerationModel,
  defaultCharacterPreviewUrl,
  formatCharacterValue,
  visibleCharacterWorkflowOptions,
} from "@/lib/realfarm-character-ui"
import { cn } from "@/lib/utils"

export function AvatarsView() {
  const [characterOpen, setCharacterOpen] = useState(false)
  const [editingCharacter, setEditingCharacter] =
    useState<CharacterRecord | null>(null)
  const [characters, setCharacters] = useState<CharacterRecord[]>([])
  const [selectedCharacterId, setSelectedCharacterId] = useState<number | null>(
    null
  )

  useEffect(() => {
    let active = true

    async function loadCharacters() {
      try {
        const data = await fetchJsonWithTimeout<{
          characters?: CharacterRecord[]
        }>("/api/characters", {
          cache: "no-store",
          timeoutMs: 12_000,
          toastOnError: false,
        })
        if (!active) {
          return
        }
        const loadedCharacters = data.characters ?? []
        setCharacters(loadedCharacters)
        setSelectedCharacterId(
          (current) => current ?? loadedCharacters[0]?.id ?? null
        )
      } catch (error) {
        if (active) {
          setCharacters([])
          toast.error(getApiErrorMessage(error, "Failed to load characters"))
        }
      }
    }

    loadCharacters()

    return () => {
      active = false
    }
  }, [])

  const selectedCharacter =
    characters.find((character) => character.id === selectedCharacterId) ??
    characters[0]

  async function saveCharacter(payload: CharacterPayload) {
    const data = await toast
      .promise(
        fetchJsonWithTimeout<{ character: CharacterRecord }>(
          "/api/characters",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            timeoutMs: 15_000,
            toastOnError: false,
            body: JSON.stringify(payload),
          }
        ),
        {
          loading: "Saving character...",
          success: "Character saved",
          error: (error) =>
            getApiErrorMessage(error, "Failed to save character"),
        }
      )
      .unwrap()
    setCharacters((current) => {
      const exists = current.some(
        (character) => character.id === data.character.id
      )
      return exists
        ? current.map((character) =>
            character.id === data.character.id ? data.character : character
          )
        : [data.character, ...current]
    })
    setSelectedCharacterId(data.character.id)
    setEditingCharacter(null)
    setCharacterOpen(false)
  }

  async function deleteCharacterById(id: number) {
    await toast
      .promise(
        fetchJsonWithTimeout(`/api/characters?id=${id}`, {
          method: "DELETE",
          timeoutMs: 15_000,
          toastOnError: false,
        }),
        {
          loading: "Deleting character...",
          success: "Character deleted",
          error: (error) =>
            getApiErrorMessage(error, "Failed to delete character"),
        }
      )
      .unwrap()
    setCharacters((current) => {
      const next = current.filter((character) => character.id !== id)
      setSelectedCharacterId((selectedId) =>
        selectedId === id ? (next[0]?.id ?? null) : selectedId
      )
      return next
    })
  }

  if (characterOpen && editingCharacter) {
    return (
      <div className="mx-[-8px] mt-[-8px]">
        <NewCharacterModal
          fullPage
          initialCharacter={editingCharacter}
          onCancel={() => {
            setCharacterOpen(false)
            setEditingCharacter(null)
          }}
          onSave={saveCharacter}
        />
      </div>
    )
  }

  if (!selectedCharacter) {
    return (
      <div className="mx-[-8px] mt-[-8px]">
        <div className="grid min-h-[calc(100svh-72px)] overflow-hidden rounded-[8px] bg-[#f8f8f4] lg:grid-cols-[280px_1fr]">
          <aside className="bg-[#efefe9] px-2 py-4">
            <h1 className="px-3 text-[20px] font-bold text-[#111827]">
              AI Characters
            </h1>
            <Button
              variant="action"
              size="largeAction"
              className="mt-6 w-full"
              onClick={() => {
                setEditingCharacter(null)
                setCharacterOpen(true)
              }}
            >
              <IconPlus className="mr-2 size-5" />
              New Character
            </Button>
          </aside>
          <main className="grid place-items-center bg-[#f8f8f4] text-center">
            <div>
              <IconPhoto
                className="mx-auto size-12 text-[#b8babf]"
                stroke={1.5}
              />
              <div className="mt-5 text-[22px] font-bold text-[#333]">
                No characters yet
              </div>
              <div className="mt-3 text-[17px] font-semibold text-[#8b8b86]">
                Create a character to generate images
              </div>
            </div>
          </main>
        </div>
        {characterOpen && !editingCharacter && (
          <CharacterCreateModal
            onCancel={() => setCharacterOpen(false)}
            onSave={saveCharacter}
          />
        )}
      </div>
    )
  }

  return (
    <div className="mx-[-8px] mt-[-8px]">
      <CharactersView
        characters={characters}
        selectedCharacter={selectedCharacter}
        onSelect={setSelectedCharacterId}
        onNew={() => {
          setEditingCharacter(null)
          setCharacterOpen(true)
        }}
        onEdit={(character) => {
          setEditingCharacter(character)
          setCharacterOpen(true)
        }}
        onDelete={deleteCharacterById}
        onRename={(character, name) =>
          saveCharacter({
            id: character.id,
            name,
            attributes: character.attributes,
            preview_url: character.preview_url,
          })
        }
      />
      {characterOpen && !editingCharacter && (
        <CharacterCreateModal
          onCancel={() => setCharacterOpen(false)}
          onSave={saveCharacter}
        />
      )}
    </div>
  )
}

function CharactersView({
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
  onSelect: (id: number) => void
  onNew: () => void
  onEdit: (character: CharacterRecord) => void
  onDelete: (id: number) => void | Promise<void>
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
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const modelMenuRef = useDismissableLayer<HTMLDivElement>(
    () => setModelMenuOpen(false),
    modelMenuOpen
  )
  const sourceImageInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedModel, setSelectedModel] = useState(
    defaultImageGenerationModel
  )
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<
    (typeof characterImageAspectRatios)[number]
  >(characterImageAspectRatios[0])
  const [generations, setGenerations] = useState<
    CharacterImageGenerationRecord[]
  >([])
  const [selectedGeneration, setSelectedGeneration] =
    useState<CharacterImageGenerationRecord | null>(null)
  const [generationDropActive, setGenerationDropActive] = useState(false)
  const [debugGeneration, setDebugGeneration] =
    useState<CharacterImageGenerationRecord | null>(null)
  const [previewGeneration, setPreviewGeneration] =
    useState<CharacterImageGenerationRecord | null>(null)
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
  useEffect(() => {
    let active = true
    void fetchJsonWithTimeout<{
      generations?: CharacterImageGenerationRecord[]
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
          toast.error(
            getApiErrorMessage(
              error,
              "Failed to load generated character images"
            )
          )
          setGenerations([])
          setSelectedGeneration(null)
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

  async function deleteGeneration(generation: CharacterImageGenerationRecord) {
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
      }>(`/api/characters/images?id=${encodeURIComponent(generation.id)}`, {
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
      toast.error(getApiErrorMessage(error, "Failed to delete generation"))
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
      const uploaded: CharacterImageGenerationRecord[] = []
      for (const file of imageFiles) {
        const formData = new FormData()
        formData.set("file", file)
        formData.set("characterId", String(selectedCharacter.id))
        formData.set("aspectRatio", selectedAspectRatio)
        formData.set("prompt", `Dropped source image: ${file.name}`)
        const payload = await fetchJsonWithTimeout<{
          generation?: CharacterImageGenerationRecord
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
    <div className="grid min-h-[calc(100svh-72px)] overflow-hidden rounded-[8px] bg-[#f8f8f4] lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="bg-[#efefe9] px-2 py-4">
        <h1 className="px-3 text-[20px] font-bold text-[#111827]">
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
        <div className="mt-4 space-y-2">
          {characters.map((character) => (
            <div
              key={character.id}
              role="button"
              tabIndex={0}
              className={cn(
                "group relative flex h-20 w-full cursor-pointer items-center gap-3 rounded-[12px] bg-white px-3 text-left shadow-sm transition hover:shadow-md",
                selectedCharacter.id === character.id && "ring-2 ring-[#ff4f28]"
              )}
              onClick={() => onSelect(character.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  onSelect(character.id)
                }
              }}
            >
              <CharacterAvatar character={character} sizeClassName="size-12" />
              <span className="min-w-0 pr-16">
                <span className="block truncate text-[15px] font-bold text-[#252525]">
                  {character.name}
                </span>
                <span className="mt-1 block text-[13px] font-bold text-[#555]">
                  {formatCharacterValue(character.attributes.gender)}{" "}
                  <span className="ml-4">
                    {character.attributes.age || "None"}
                  </span>
                </span>
              </span>
              <span className="absolute top-1/2 right-2 hidden -translate-y-1/2 items-center gap-1 group-hover:flex">
                <button
                  className="grid size-8 place-items-center rounded-[8px] bg-white text-[#555] shadow-sm hover:bg-[#f4f4ef]"
                  aria-label={`Edit ${character.name}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onEdit(character)
                  }}
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  className="grid size-8 place-items-center rounded-[8px] bg-white text-[#df2b34] shadow-sm hover:bg-[#fff0f0]"
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

      <main className="relative h-[calc(100svh-72px)] overflow-hidden bg-[#f8f8f4] px-7 py-6">
        <div className="relative z-20 flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <CharacterAvatar
              character={selectedCharacter}
              sizeClassName="size-14"
            />
            <div className="min-w-0">
              {renamingName ? (
                <input
                  className="h-10 min-w-[260px] rounded-[10px] border border-[#d8dce5] bg-white px-3 text-[24px] font-bold text-[#111827] shadow-sm outline-none"
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
                  <span className="truncate text-[26px] font-bold text-[#111827]">
                    {selectedCharacter.name}
                  </span>
                  <button
                    className="grid size-8 shrink-0 place-items-center rounded-[8px] text-[#9aa1ad] hover:bg-white hover:text-[#333]"
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
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] font-bold text-[#77766f]">
                <span>
                  {formatCharacterValue(selectedCharacter.attributes.gender)}
                </span>
                <span>{selectedCharacter.attributes.age || "No age"}</span>
                <span>Headshot locked</span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {[
              "Identity",
              "Generate",
              "Recreate",
              "Batch",
              "Video",
              "Recipes",
            ].map((item) => (
              <button
                key={item}
                className={cn(
                  "hidden h-9 rounded-full border border-[#e2e4ea] bg-white px-3 text-[12px] font-bold text-[#667085] shadow-sm hover:border-[#ff4f28] hover:text-[#ff4f28] xl:inline-flex xl:items-center",
                  activeWorkflowOption.label
                    .toLowerCase()
                    .includes(item.toLowerCase()) &&
                    "border-[#ff4f28] text-[#ff4f28]"
                )}
                onClick={() => {
                  if (item === "Generate") setActiveWorkflow("free_generate")
                  if (item === "Recreate")
                    setActiveWorkflow(
                      hasEditSource ? "recreate_reference" : "free_generate"
                    )
                  if (item === "Batch") setActiveWorkflow("batch_photo_dump")
                  if (item === "Video")
                    setActiveWorkflow(
                      hasEditSource ? "animate_image" : "free_generate"
                    )
                  if (item === "Recipes") setActiveWorkflow("build_modules")
                }}
              >
                {item}
              </button>
            ))}
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
          className={cn(
            "absolute inset-x-0 top-[104px] bottom-0 overflow-y-auto px-7 pt-8 pb-64",
            generations.length === 0 && "grid place-items-center text-center"
          )}
          onDragEnter={(event) => {
            if (hasImageDragItems(event.dataTransfer)) {
              event.preventDefault()
              setGenerationDropActive(true)
            }
          }}
          onDragOver={(event) => {
            if (hasImageDragItems(event.dataTransfer)) {
              event.preventDefault()
              event.dataTransfer.dropEffect = "copy"
              setGenerationDropActive(true)
            }
          }}
          onDragLeave={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            ) {
              setGenerationDropActive(false)
            }
          }}
          onDrop={(event) => {
            event.preventDefault()
            setGenerationDropActive(false)
            void uploadDroppedGenerationImages(event.dataTransfer.files)
          }}
        >
          {generationDropActive && (
            <div className="pointer-events-none absolute inset-4 z-20 grid place-items-center rounded-[16px] border-2 border-dashed border-[#ff4f28] bg-white/82 text-center shadow-[0_18px_48px_rgba(0,0,0,0.14)] backdrop-blur-sm">
              <div>
                <IconUpload className="mx-auto size-10 text-[#ff4f28]" />
                <div className="mt-3 text-[18px] font-bold text-[#202020]">
                  Drop images to add source cards
                </div>
                <div className="mt-1 text-[13px] font-semibold text-[#667085]">
                  They will appear in this grid and can be selected for edit
                  workflows.
                </div>
              </div>
            </div>
          )}
          {generations.length === 0 ? (
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
                      className="absolute top-2 left-2 z-10 rounded-full border border-white/70 bg-white/90 px-3 py-1 text-[12px] font-bold text-[#252520] shadow-sm backdrop-blur hover:bg-white"
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
                      className="grid size-8 place-items-center rounded-full border border-white/70 bg-black/55 text-white shadow-sm backdrop-blur hover:bg-[#d92d20]"
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

        <section className="absolute inset-x-8 bottom-6 z-30 mx-auto max-w-[760px] rounded-[16px] bg-white p-4 shadow-[0_18px_48px_rgba(0,0,0,0.14)]">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-[12px] font-bold tracking-wide text-[#77766f] uppercase">
              Mode
              <SelectControl
                aria-label="Character generation workflow"
                value={currentWorkflow}
                onChange={(event) =>
                  setActiveWorkflow(event.target.value as CharacterWorkflowKey)
                }
              >
                {workflowOptions.map((workflow) => (
                  <option key={workflow.key} value={workflow.key}>
                    {workflow.label}
                  </option>
                ))}
              </SelectControl>
            </label>
            <span className="rounded-full bg-[#f3f4f6] px-3 py-1 text-[12px] font-bold text-[#667085]">
              {activeWorkflowOption.description}
            </span>
          </div>
          {!isEditWorkflow && (
            <textarea
              className="h-20 w-full resize-none bg-transparent text-[16px] leading-6 font-semibold text-[#333] outline-none placeholder:text-[#a5adbb]"
              placeholder={activeWorkflowOption.placeholder}
              aria-label="Edit AI UGC character prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          )}
          <BottomWorkflowControls
            workflow={currentWorkflow}
            isEditWorkflow={isEditWorkflow}
            sourceGeneration={selectedGeneration}
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
            onClearSource={() => setSelectedGeneration(null)}
            onOpenReference={() => setReferenceOpen(true)}
            onOpenOutfits={() => setAssetsOpen(true)}
            onOpenMotion={() => setMotionReferenceOpen(true)}
          />
          {!isEditWorkflow && selectedAssets.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {selectedAssets.map((asset) => (
                <button
                  key={asset.id}
                  className="rounded-full bg-[#f2f4f7] px-3 py-1 text-[12px] font-bold text-[#344054] hover:bg-[#e6e9ef]"
                  onClick={() =>
                    setSelectedAssets((current) =>
                      current.filter((item) => item.id !== asset.id)
                    )
                  }
                >
                  {asset.name}
                </button>
              ))}
            </div>
          )}
          {!isEditWorkflow && (
            <AttachmentSquareRow
              attachments={promptPackage.attachments}
              ariaLabel="Prompt attachments"
            />
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
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
            <div className="ml-auto flex items-center gap-2">
              <label className="flex items-center gap-2 text-[12px] font-bold tracking-wide text-[#77766f] uppercase">
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
              <div ref={modelMenuRef} className="relative">
                <Button
                  variant="outline"
                  onClick={() => setModelMenuOpen((value) => !value)}
                >
                  <IconSparkles className="mr-2 size-4" />
                  {selectedModel}
                </Button>
                {modelMenuOpen && (
                  <div className="absolute bottom-[46px] left-0 z-20 w-[210px] overflow-hidden rounded-[10px] border border-[#e4e4df] bg-white p-1 shadow-xl">
                    {characterGenerationModels.map((model) => (
                      <button
                        key={model}
                        className={cn(
                          "flex h-10 w-full items-center rounded-[8px] px-3 text-left text-[14px] font-bold text-[#333] hover:bg-[#f5f5f1]",
                          selectedModel === model && "bg-[#eef0f5]"
                        )}
                        onClick={() => {
                          setSelectedModel(model)
                          setModelMenuOpen(false)
                        }}
                      >
                        {model}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button
                variant="action"
                size="lg"
                onClick={() => void generateCharacterImage()}
              >
                {workflowGenerateCount > 1
                  ? `Generate ${workflowGenerateCount}`
                  : currentWorkflow === "animate_image"
                    ? "Generate Image"
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

function CharacterWorkflowEmptyState({
  characterName,
  onSelectWorkflow,
}: {
  characterName: string
  onSelectWorkflow: (workflow: CharacterWorkflowKey) => void
}) {
  const cards: Array<{
    workflow: CharacterWorkflowKey
    title: string
    description: string
  }> = [
    {
      workflow: "free_generate",
      title: "Generate First Image",
      description: "Create a scene from text.",
    },
    {
      workflow: "build_modules",
      title: "Build From Modules",
      description: "Pick pose, outfit, camera, and background.",
    },
    {
      workflow: "batch_photo_dump",
      title: "Create Photo Dump",
      description: "Generate 8-12 related lifestyle images.",
    },
    {
      workflow: "product_ugc",
      title: "Product UGC",
      description: "Upload or attach a product and make ad images.",
    },
    {
      workflow: "free_generate",
      title: "Calibrate Identity",
      description: `Generate test images to lock ${characterName}'s look.`,
    },
  ]

  return (
    <div className="w-full max-w-[760px] text-left">
      <div className="text-center">
        <IconPhoto className="mx-auto size-12 text-[#b8babf]" stroke={1.5} />
        <div className="mt-5 text-[22px] font-bold text-[#333]">
          No images yet
        </div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <button
            key={`${card.title}-${card.workflow}`}
            className="min-h-28 rounded-[12px] border border-[#e2e4ea] bg-white p-4 text-left shadow-sm transition hover:border-[#ff4f28] hover:shadow-md"
            onClick={() => onSelectWorkflow(card.workflow)}
          >
            <span className="text-[15px] font-bold text-[#202020]">
              {card.title}
            </span>
            <span className="mt-2 block text-[12px] leading-5 font-semibold text-[#77766f]">
              {card.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function BottomWorkflowControls({
  workflow,
  isEditWorkflow,
  sourceGeneration,
  selectedReferenceAsset,
  selectedOutfitAsset,
  motionVideoUrl,
  selfieTemplate,
  onSelfieTemplateChange,
  breastSize,
  onBreastSizeChange,
  imageGenerateCount,
  onImageGenerateCountChange,
  photoDumpCount,
  onPhotoDumpCountChange,
  slideshowSlides,
  onSlideshowSlidesChange,
  productName,
  onProductNameChange,
  productAudience,
  onProductAudienceChange,
  productAngle,
  onProductAngleChange,
  moduleRecipe,
  onModuleRecipeChange,
  onClearSource,
  onOpenReference,
  onOpenOutfits,
  onOpenMotion,
}: {
  workflow: CharacterWorkflowKey
  isEditWorkflow: boolean
  sourceGeneration: CharacterImageGenerationRecord | null
  selectedReferenceAsset: AssetRecord | null
  selectedOutfitAsset?: AssetRecord
  motionVideoUrl: string
  selfieTemplate: string
  onSelfieTemplateChange: (value: string) => void
  breastSize: string
  onBreastSizeChange: (value: string) => void
  imageGenerateCount: number
  onImageGenerateCountChange: (value: number) => void
  photoDumpCount: number
  onPhotoDumpCountChange: (value: number) => void
  slideshowSlides: number
  onSlideshowSlidesChange: (value: number) => void
  productName: string
  onProductNameChange: (value: string) => void
  productAudience: string
  onProductAudienceChange: (value: string) => void
  productAngle: string
  onProductAngleChange: (value: string) => void
  moduleRecipe: Record<string, string>
  onModuleRecipeChange: (value: Record<string, string>) => void
  onClearSource: () => void
  onOpenReference: () => void
  onOpenOutfits: () => void
  onOpenMotion: () => void
}) {
  return (
    <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
      {sourceGeneration?.imageUrl ? (
        <div className="flex items-center gap-2 rounded-[10px] border border-[#ffb199] bg-[#fff4ed] p-1 pr-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- Generated local image URL is returned by the app API. */}
          <img
            src={sourceGeneration.imageUrl}
            alt="Selected edit source"
            className="size-11 rounded-[8px] object-cover"
          />
          <span className="text-[12px] font-bold text-[#ff4f28]">Source</span>
          <button
            type="button"
            className="grid size-6 place-items-center rounded-full text-[#ff4f28] hover:bg-[#ffe1d6]"
            aria-label="Clear selected source image"
            onClick={onClearSource}
          >
            <IconX className="size-4" />
          </button>
        </div>
      ) : (
        isEditWorkflow && (
          <div className="rounded-[10px] border border-[#f04438] bg-[#fff5f5] px-3 py-2 text-[12px] font-bold text-[#b42318]">
            Select a generated image first
          </div>
        )
      )}

      {workflow === "recreate_reference" && (
        <Button
          variant="softControl"
          size="lg"
          className={cn(
            "h-auto min-h-12 gap-2 border-2 p-1 pr-3",
            referenceAssetReady(selectedReferenceAsset)
              ? "border-[#12b76a]"
              : "border-[#f04438]"
          )}
          onClick={onOpenReference}
        >
          {selectedReferenceAsset?.fileUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- Uploaded local reference assets are stored by the app API. */}
              <img
                src={selectedReferenceAsset.fileUrl}
                alt={selectedReferenceAsset.name || "Selected reference"}
                className="size-11 rounded-[8px] object-cover"
              />
              <span>Reference</span>
            </>
          ) : (
            "Reference"
          )}
        </Button>
      )}

      {workflow === "outfit_transfer" && (
        <Button variant="softControl" size="lg" onClick={onOpenOutfits}>
          Outfits
          <span
            className={cn(
              "ml-2 size-2 rounded-full",
              selectedOutfitAsset?.fileUrl ? "bg-[#12b76a]" : "bg-[#f04438]"
            )}
          />
        </Button>
      )}

      {workflow === "motion_control" && (
        <Button variant="softControl" size="lg" onClick={onOpenMotion}>
          Motion ref
          <span
            className={cn(
              "ml-2 size-2 rounded-full",
              motionVideoUrl ? "bg-[#12b76a]" : "bg-[#f04438]"
            )}
          />
        </Button>
      )}

      {workflow === "seedream_bedroom_selfie" && (
        <>
          <label className="flex items-center gap-2 text-[12px] font-bold tracking-wide text-[#77766f] uppercase">
            Preset
            <SelectControl
              value={selfieTemplate}
              onChange={(event) => onSelfieTemplateChange(event.target.value)}
            >
              <option value="barely_awake_oversized_tee">Barely Awake</option>
              <option value="tank_top_flirty_smile">Tank Top</option>
              <option value="messy_bun_glasses">Bun Glasses</option>
              <option value="sheet_pull_soft_smile_bralette">Sheet Pull</option>
            </SelectControl>
          </label>
          <label className="flex items-center gap-2 text-[12px] font-bold tracking-wide text-[#77766f] uppercase">
            Size
            <SelectControl
              value={breastSize}
              onChange={(event) => onBreastSizeChange(event.target.value)}
            >
              {["a cup", "b cup", "c cup", "d cup", "dd cup"].map((size) => (
                <option key={size} value={size}>
                  {size.toUpperCase()}
                </option>
              ))}
            </SelectControl>
          </label>
        </>
      )}

      {workflow === "build_modules" && (
        <>
          <NumberStepper
            label="Images"
            value={imageGenerateCount}
            min={1}
            max={4}
            onChange={onImageGenerateCountChange}
          />
          <InlineModuleControls
            moduleRecipe={moduleRecipe}
            onModuleRecipeChange={onModuleRecipeChange}
          />
        </>
      )}
      {workflow === "recreate_reference" && (
        <NumberStepper
          label="Images"
          value={imageGenerateCount}
          min={1}
          max={4}
          onChange={onImageGenerateCountChange}
        />
      )}
      {workflow === "batch_photo_dump" && (
        <NumberStepper
          label="Images"
          value={photoDumpCount}
          min={1}
          max={12}
          onChange={onPhotoDumpCountChange}
        />
      )}
      {workflow === "tiktok_slideshow" && (
        <NumberStepper
          label="Slides"
          value={slideshowSlides}
          min={2}
          max={10}
          onChange={onSlideshowSlidesChange}
        />
      )}
      {workflow === "product_ugc" && (
        <>
          <NumberStepper
            label="Images"
            value={imageGenerateCount}
            min={1}
            max={5}
            onChange={onImageGenerateCountChange}
          />
          <InlineTextControl
            label="Product"
            value={productName}
            onChange={onProductNameChange}
          />
          <InlineTextControl
            label="Audience"
            value={productAudience}
            onChange={onProductAudienceChange}
          />
          <InlineTextControl
            label="Angle"
            value={productAngle}
            onChange={onProductAngleChange}
          />
        </>
      )}
    </div>
  )
}

function InlineModuleControls({
  moduleRecipe,
  onModuleRecipeChange,
}: {
  moduleRecipe: Record<string, string>
  onModuleRecipeChange: (value: Record<string, string>) => void
}) {
  return (
    <>
      {Object.entries(moduleRecipe)
        .slice(0, 4)
        .map(([key, value]) => (
          <InlineTextControl
            key={key}
            label={key}
            value={value}
            onChange={(nextValue) =>
              onModuleRecipeChange({ ...moduleRecipe, [key]: nextValue })
            }
          />
        ))}
    </>
  )
}

function InlineTextControl({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex items-center gap-2 text-[12px] font-bold tracking-wide text-[#77766f] uppercase">
      {label}
      <input
        className="h-9 w-[130px] rounded-[9px] border border-[#dde1e7] px-3 text-[13px] font-semibold text-[#111827] outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function NumberStepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex items-center gap-2 text-[12px] font-bold tracking-wide text-[#77766f] uppercase">
      {label}
      <input
        className="h-9 w-20 rounded-[9px] border border-[#dde1e7] px-3 text-[13px] font-semibold text-[#111827] outline-none"
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) =>
          onChange(clampNumber(Number(event.target.value), min, max))
        }
      />
    </label>
  )
}

function referenceAssetReady(asset: AssetRecord | null) {
  return asset?.metadata?.analysisStatus === "ready" && Boolean(asset.fileUrl)
}

// Legacy right-side workflow panel kept temporarily while the bottom editor migration settles.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function WorkflowSidePanel({
  character,
  workflow,
  onWorkflowChange,
  recreateMode,
  onRecreateModeChange,
  referenceImageUrl,
  onReferenceImageUrlChange,
  motionVideoUrl,
  onMotionVideoUrlChange,
  motionSourceImageUrl,
  onMotionSourceImageUrlChange,
  selfieTemplate,
  onSelfieTemplateChange,
  breastSize,
  onBreastSizeChange,
  clothingImageUrl,
  onClothingImageUrlChange,
  photoDumpCount,
  onPhotoDumpCountChange,
  slideshowSlides,
  onSlideshowSlidesChange,
  productName,
  onProductNameChange,
  productAudience,
  onProductAudienceChange,
  productAngle,
  onProductAngleChange,
  moduleRecipe,
  onModuleRecipeChange,
  selectedAssets,
  attachments,
  onOpenAssets,
  onOpenReference,
  onGenerate,
}: {
  character: CharacterRecord
  workflow: CharacterWorkflowKey
  onWorkflowChange: (workflow: CharacterWorkflowKey) => void
  recreateMode: string
  onRecreateModeChange: (value: string) => void
  referenceImageUrl: string
  onReferenceImageUrlChange: (value: string) => void
  motionVideoUrl: string
  onMotionVideoUrlChange: (value: string) => void
  motionSourceImageUrl: string
  onMotionSourceImageUrlChange: (value: string) => void
  selfieTemplate: string
  onSelfieTemplateChange: (value: string) => void
  breastSize: string
  onBreastSizeChange: (value: string) => void
  clothingImageUrl: string
  onClothingImageUrlChange: (value: string) => void
  photoDumpCount: number
  onPhotoDumpCountChange: (value: number) => void
  slideshowSlides: number
  onSlideshowSlidesChange: (value: number) => void
  productName: string
  onProductNameChange: (value: string) => void
  productAudience: string
  onProductAudienceChange: (value: string) => void
  productAngle: string
  onProductAngleChange: (value: string) => void
  moduleRecipe: Record<string, string>
  onModuleRecipeChange: (value: Record<string, string>) => void
  selectedAssets: AssetRecord[]
  attachments: CharacterPromptAttachment[]
  onOpenAssets: () => void
  onOpenReference: () => void
  onGenerate: () => void
}) {
  const activeWorkflow =
    characterWorkflowOptions.find((option) => option.key === workflow) ??
    characterWorkflowOptions[0]

  return (
    <aside className="hidden h-[calc(100svh-72px)] overflow-y-auto border-l border-[#e4e4df] bg-[#f3f3ee] p-4 lg:block">
      <div className="rounded-[14px] bg-white p-4 shadow-sm">
        <div className="text-[12px] font-bold tracking-wide text-[#9a9a93] uppercase">
          Workflow
        </div>
        <SelectControl
          aria-label="Workflow panel mode"
          className="mt-2 w-full"
          value={workflow}
          onChange={(event) =>
            onWorkflowChange(event.target.value as CharacterWorkflowKey)
          }
        >
          {characterWorkflowOptions.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </SelectControl>
        <p className="mt-3 text-[13px] leading-5 font-semibold text-[#77766f]">
          {activeWorkflow.description}
        </p>
      </div>

      <div className="mt-4 rounded-[14px] bg-white p-4 shadow-sm">
        {workflow === "free_generate" && (
          <FreeGeneratePanel
            character={character}
            attachments={attachments}
            selectedAssets={selectedAssets}
            onOpenAssets={onOpenAssets}
          />
        )}
        {workflow === "recreate_reference" && (
          <RecreateReferencePanel
            recreateMode={recreateMode}
            onRecreateModeChange={onRecreateModeChange}
            referenceImageUrl={referenceImageUrl}
            onReferenceImageUrlChange={onReferenceImageUrlChange}
            onOpenReference={onOpenReference}
          />
        )}
        {workflow === "build_modules" && (
          <BuildModulesPanel
            moduleRecipe={moduleRecipe}
            onModuleRecipeChange={onModuleRecipeChange}
          />
        )}
        {workflow === "batch_photo_dump" && (
          <BatchPhotoDumpPanel
            photoDumpCount={photoDumpCount}
            onPhotoDumpCountChange={onPhotoDumpCountChange}
          />
        )}
        {workflow === "tiktok_slideshow" && (
          <TikTokSlideshowPanel
            slideshowSlides={slideshowSlides}
            onSlideshowSlidesChange={onSlideshowSlidesChange}
          />
        )}
        {workflow === "product_ugc" && (
          <ProductUgcPanel
            productName={productName}
            onProductNameChange={onProductNameChange}
            productAudience={productAudience}
            onProductAudienceChange={onProductAudienceChange}
            productAngle={productAngle}
            onProductAngleChange={onProductAngleChange}
            onOpenAssets={onOpenAssets}
          />
        )}
        {workflow === "animate_image" && <AnimateImagePanel />}
        {workflow === "motion_control" && (
          <MotionControlPanel
            character={character}
            motionVideoUrl={motionVideoUrl}
            onMotionVideoUrlChange={onMotionVideoUrlChange}
            motionSourceImageUrl={motionSourceImageUrl}
            onMotionSourceImageUrlChange={onMotionSourceImageUrlChange}
          />
        )}
        {workflow === "seedream_bedroom_selfie" && (
          <SeedreamSelfiePanel
            selfieTemplate={selfieTemplate}
            onSelfieTemplateChange={onSelfieTemplateChange}
            breastSize={breastSize}
            onBreastSizeChange={onBreastSizeChange}
          />
        )}
        {workflow === "outfit_transfer" && (
          <OutfitTransferPanel
            clothingImageUrl={clothingImageUrl}
            onClothingImageUrlChange={onClothingImageUrlChange}
            onOpenAssets={onOpenAssets}
          />
        )}
        {workflow === "pose_variation_cut_video" && (
          <PoseVariationCutVideoPanel character={character} />
        )}
      </div>

      <Button
        variant="action"
        size="largeAction"
        className="mt-4 w-full"
        onClick={onGenerate}
      >
        Generate
      </Button>
    </aside>
  )
}

function FreeGeneratePanel({
  character,
  attachments,
  selectedAssets,
  onOpenAssets,
}: {
  character: CharacterRecord
  attachments: CharacterPromptAttachment[]
  selectedAssets: AssetRecord[]
  onOpenAssets: () => void
}) {
  return (
    <div className="space-y-4">
      <PanelTitle title="Free Generate" />
      <div className="space-y-2">
        {[
          `Use ${character.name}'s headshot`,
          "Preserve face",
          "Preserve hairstyle",
          "Preserve body/style",
        ].map((label) => (
          <StaticCheckbox key={label} label={label} checked />
        ))}
      </div>
      <PanelSection title="Assets">
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <div
              key={`${attachment.kind}-${attachment.url}`}
              className="flex items-center justify-between rounded-[8px] bg-[#f6f6f2] px-3 py-2 text-[12px] font-bold text-[#555]"
            >
              <span className="truncate">{attachment.label}</span>
              <span className="ml-2 shrink-0 uppercase">{attachment.kind}</span>
            </div>
          ))}
          <button
            className="h-9 w-full rounded-[8px] border border-dashed border-[#c8c9c2] text-[12px] font-bold text-[#77766f]"
            onClick={onOpenAssets}
          >
            {selectedAssets.length > 0
              ? "Manage assets"
              : "Add optional assets"}
          </button>
        </div>
      </PanelSection>
      <PanelSection title="Prompt strength">
        <div className="space-y-2 text-[12px] font-bold text-[#555]">
          <StrengthRow label="Character" value="High" />
          <StrengthRow label="User prompt" value="Medium" />
          <StrengthRow label="Reference" value="None" />
        </div>
      </PanelSection>
    </div>
  )
}

function RecreateReferencePanel({
  recreateMode,
  onRecreateModeChange,
  referenceImageUrl,
  onReferenceImageUrlChange,
  onOpenReference,
}: {
  recreateMode: string
  onRecreateModeChange: (value: string) => void
  referenceImageUrl: string
  onReferenceImageUrlChange: (value: string) => void
  onOpenReference: () => void
}) {
  return (
    <div className="space-y-4">
      <PanelTitle title="Recreate Reference" />
      <button
        className="grid min-h-28 w-full place-items-center rounded-[12px] border border-dashed border-[#c8c9c2] bg-[#f7f7f3] p-4 text-center text-[13px] font-bold text-[#77766f]"
        onClick={onOpenReference}
      >
        Drop IG/TikTok screenshot here
      </button>
      <TextField
        label="Reference image URL"
        value={referenceImageUrl}
        onChange={onReferenceImageUrlChange}
      />
      <div className="rounded-[10px] bg-[#fff7ed] p-3 text-[12px] leading-5 font-semibold text-[#9a5a1f]">
        Reference is used for pose, composition, camera, outfit vibe, and
        background only. Identity stays locked to the selected character.
      </div>
      <PanelSection title="Analyze result">
        <dl className="space-y-2 text-[12px] font-semibold text-[#555]">
          <InfoRow label="Photo type" value="Mirror selfie" />
          <InfoRow label="Pose" value="Standing angled" />
          <InfoRow label="Camera" value="Eye-level phone mirror" />
          <InfoRow label="Background" value="Bedroom" />
          <InfoRow label="Outfit vibe" value="Casual UGC styling" />
        </dl>
      </PanelSection>
      <label className="block text-[12px] font-bold text-[#667085]">
        Recreation mode
        <SelectControl
          className="mt-2 w-full"
          value={recreateMode}
          onChange={(event) => onRecreateModeChange(event.target.value)}
        >
          {[
            "Pose only",
            "Pose + camera",
            "Pose + background",
            "Full style recreation",
          ].map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </SelectControl>
      </label>
      <PanelSection title="Copy strength">
        <RangeReadout label="Pose" value={80} />
        <RangeReadout label="Camera" value={70} />
        <RangeReadout label="Background" value={60} />
        <RangeReadout label="Outfit vibe" value={50} />
      </PanelSection>
    </div>
  )
}

function MotionControlPanel({
  character,
  motionVideoUrl,
  onMotionVideoUrlChange,
  motionSourceImageUrl,
  onMotionSourceImageUrlChange,
}: {
  character: CharacterRecord
  motionVideoUrl: string
  onMotionVideoUrlChange: (value: string) => void
  motionSourceImageUrl: string
  onMotionSourceImageUrlChange: (value: string) => void
}) {
  return (
    <div className="space-y-4">
      <PanelTitle title="Motion Control" />
      <div className="rounded-[10px] bg-[#f7f7f3] p-3 text-[12px] leading-5 font-semibold text-[#77766f]">
        Uses Kling 3 motion-control. Character orientation is locked to the
        image; movement and facial expressions come from the reference video.
      </div>
      <TextField
        label="Motion reference video URL"
        value={motionVideoUrl}
        onChange={onMotionVideoUrlChange}
      />
      <TextField
        label="Source character image URL"
        value={motionSourceImageUrl}
        onChange={onMotionSourceImageUrlChange}
      />
      {!motionSourceImageUrl && (
        <div className="rounded-[8px] bg-[#f2f4f7] px-3 py-2 text-[12px] font-bold text-[#667085]">
          Defaults to {character.name}&apos;s profile image.
        </div>
      )}
    </div>
  )
}

function SeedreamSelfiePanel({
  selfieTemplate,
  onSelfieTemplateChange,
  breastSize,
  onBreastSizeChange,
}: {
  selfieTemplate: string
  onSelfieTemplateChange: (value: string) => void
  breastSize: string
  onBreastSizeChange: (value: string) => void
}) {
  return (
    <div className="space-y-4">
      <PanelTitle title="Seedream Selfie" />
      <label className="block text-[12px] font-bold text-[#667085]">
        Prompt preset
        <SelectControl
          className="mt-2 w-full"
          value={selfieTemplate}
          onChange={(event) => onSelfieTemplateChange(event.target.value)}
        >
          <option value="barely_awake_oversized_tee">
            Barely Awake Oversized Tee
          </option>
          <option value="tank_top_flirty_smile">Tank Top Flirty Smile</option>
          <option value="messy_bun_glasses">Messy Bun & Glasses</option>
          <option value="sheet_pull_soft_smile_bralette">
            Sheet Pull Soft Smile Bralette
          </option>
        </SelectControl>
      </label>
      <TextField
        label="Breast size setting"
        value={breastSize}
        onChange={onBreastSizeChange}
      />
      <div className="rounded-[10px] bg-[#fff7ed] p-3 text-[12px] leading-5 font-semibold text-[#9a5a1f]">
        Generated prompt explicitly keeps this as an adult woman and preserves
        the attached character identity.
      </div>
    </div>
  )
}

function OutfitTransferPanel({
  clothingImageUrl,
  onClothingImageUrlChange,
  onOpenAssets,
}: {
  clothingImageUrl: string
  onClothingImageUrlChange: (value: string) => void
  onOpenAssets: () => void
}) {
  return (
    <div className="space-y-4">
      <PanelTitle title="Outfit Transfer" />
      <TextField
        label="Clothing reference URL"
        value={clothingImageUrl}
        onChange={onClothingImageUrlChange}
      />
      <button
        className="h-9 w-full rounded-[8px] border border-dashed border-[#c8c9c2] text-[12px] font-bold text-[#77766f]"
        onClick={onOpenAssets}
      >
        Choose from outfits
      </button>
      <div className="rounded-[10px] bg-[#f7f7f3] p-3 text-[12px] leading-5 font-semibold text-[#77766f]">
        Uses image 1 as the influencer and image 2 as the clothing reference.
      </div>
    </div>
  )
}

function PoseVariationCutVideoPanel({
  character,
}: {
  character: CharacterRecord
}) {
  return (
    <div className="space-y-4">
      <PanelTitle title="Pose Cut Video" />
      <div className="rounded-[10px] bg-[#f7f7f3] p-3 text-[12px] leading-5 font-semibold text-[#77766f]">
        Starts from {character.name}&apos;s profile image, creates a stronger
        pose variation as the end frame, animates the two frames with Kling 2.5,
        then adds random micro cuts and a random song from the music folder.
      </div>
      <PanelSection title="Output">
        <dl className="space-y-2 text-[12px] font-semibold text-[#555]">
          <InfoRow label="End frame" value="Nano Banana Pro image edit" />
          <InfoRow label="Video" value="Kling 2.5 start/end frame" />
          <InfoRow label="Cuts" value="0.2-0.3s random micro cuts" />
          <InfoRow label="Music" value="Random TikTok trend audio file" />
        </dl>
      </PanelSection>
    </div>
  )
}

function BuildModulesPanel({
  moduleRecipe,
  onModuleRecipeChange,
}: {
  moduleRecipe: Record<string, string>
  onModuleRecipeChange: (value: Record<string, string>) => void
}) {
  const options: Record<string, string[]> = {
    action: ["Mirror selfie", "Walking shot", "Product hold", "Desk setup"],
    pose: ["Standing mirror selfie", "Seated casual pose", "Side angle"],
    expression: ["Soft pout", "Natural smile", "Neutral confident"],
    hair: ["Long loose waves", "Slick bun", "Messy ponytail"],
    top: ["Cropped tee", "Oversized hoodie", "Fitted tank"],
    bottom: ["Denim skirt", "Relaxed jeans", "Athleisure shorts"],
    device: ["Clear phone case", "No phone", "Compact camera"],
    photography: [
      "Casual smartphone mirror selfie",
      "Candid iPhone photo",
      "Flash photo",
    ],
    background: ["Minimal bedroom", "Bright kitchen", "Street corner"],
  }

  return (
    <div className="space-y-3">
      <PanelTitle title="Build From Modules" />
      {Object.entries(options).map(([key, values]) => (
        <label
          key={key}
          className="block text-[12px] font-bold text-[#667085] capitalize"
        >
          {key}
          <SelectControl
            className="mt-1 w-full"
            value={moduleRecipe[key] ?? values[0]}
            onChange={(event) =>
              onModuleRecipeChange({
                ...moduleRecipe,
                [key]: event.target.value,
              })
            }
          >
            {values.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectControl>
        </label>
      ))}
    </div>
  )
}

function BatchPhotoDumpPanel({
  photoDumpCount,
  onPhotoDumpCountChange,
}: {
  photoDumpCount: number
  onPhotoDumpCountChange: (value: number) => void
}) {
  return (
    <div className="space-y-4">
      <PanelTitle title="Photo Dump" />
      <NumberField
        label="Number of images"
        value={photoDumpCount}
        min={1}
        max={12}
        onChange={onPhotoDumpCountChange}
      />
      <PanelSection title="Vary">
        {["Pose", "Outfit", "Background", "Camera angle"].map((label) => (
          <StaticCheckbox key={label} label={label} checked />
        ))}
        {["Hairstyle", "Makeup"].map((label) => (
          <StaticCheckbox key={label} label={label} />
        ))}
      </PanelSection>
      <PanelSection title="Keep consistent">
        {["Face", "Body", "Phone case", "Skin texture"].map((label) => (
          <StaticCheckbox key={label} label={label} checked />
        ))}
      </PanelSection>
    </div>
  )
}

function TikTokSlideshowPanel({
  slideshowSlides,
  onSlideshowSlidesChange,
}: {
  slideshowSlides: number
  onSlideshowSlidesChange: (value: number) => void
}) {
  return (
    <div className="space-y-4">
      <PanelTitle title="TikTok Slideshow" />
      <label className="block text-[12px] font-bold text-[#667085]">
        Slideshow type
        <SelectControl className="mt-2 w-full" defaultValue="Lifestyle">
          {["Lifestyle", "UGC", "Product", "Story"].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </SelectControl>
      </label>
      <NumberField
        label="Number of slides"
        value={slideshowSlides}
        min={2}
        max={10}
        onChange={onSlideshowSlidesChange}
      />
      <PanelSection title="Generate">
        {["Images", "Slide captions", "Cover hook"].map((label) => (
          <StaticCheckbox key={label} label={label} checked />
        ))}
      </PanelSection>
    </div>
  )
}

function ProductUgcPanel({
  productName,
  onProductNameChange,
  productAudience,
  onProductAudienceChange,
  productAngle,
  onProductAngleChange,
  onOpenAssets,
}: {
  productName: string
  onProductNameChange: (value: string) => void
  productAudience: string
  onProductAudienceChange: (value: string) => void
  productAngle: string
  onProductAngleChange: (value: string) => void
  onOpenAssets: () => void
}) {
  return (
    <div className="space-y-4">
      <PanelTitle title="Product UGC" />
      <button
        className="grid min-h-20 w-full place-items-center rounded-[12px] border border-dashed border-[#c8c9c2] bg-[#f7f7f3] p-4 text-center text-[13px] font-bold text-[#77766f]"
        onClick={onOpenAssets}
      >
        Upload or select product image
      </button>
      <TextField
        label="Name"
        value={productName}
        onChange={onProductNameChange}
      />
      <TextField
        label="Audience"
        value={productAudience}
        onChange={onProductAudienceChange}
      />
      <TextField
        label="Angle"
        value={productAngle}
        onChange={onProductAngleChange}
      />
      <PanelSection title="Creative pack">
        {[
          "Hook image",
          "Holding product",
          "Before/after",
          "Reaction selfie",
          "Result shot",
        ].map((label) => (
          <StaticCheckbox key={label} label={label} checked />
        ))}
      </PanelSection>
    </div>
  )
}

function AnimateImagePanel() {
  return (
    <div className="space-y-4">
      <PanelTitle title="Animate Image" />
      <div className="rounded-[10px] bg-[#f7f7f3] p-3 text-[12px] leading-5 font-semibold text-[#77766f]">
        Generate or select an image first, then open it to use Edit, Upscale,
        Variations, or Animate. The image editor stores video metadata beside
        the selected image.
      </div>
      <PanelSection title="Motion preset">
        <StrengthRow label="Preset" value="Subtle selfie movement" />
        <StaticCheckbox label="Natural blinking" checked />
        <StaticCheckbox label="Slight head tilt" checked />
        <StaticCheckbox label="Handheld phone motion" checked />
      </PanelSection>
    </div>
  )
}

function PanelTitle({ title }: { title: string }) {
  return <h2 className="text-[18px] font-bold text-[#202020]">{title}</h2>
}

function PanelSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-2 text-[12px] font-bold tracking-wide text-[#9a9a93] uppercase">
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function StaticCheckbox({
  label,
  checked = false,
}: {
  label: string
  checked?: boolean
}) {
  return (
    <label className="flex items-center gap-2 text-[12px] font-bold text-[#555]">
      <input type="checkbox" checked={checked} readOnly />
      {label}
    </label>
  )
}

function StrengthRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="rounded-full bg-[#f2f4f7] px-2 py-0.5 text-[#667085]">
        {value}
      </span>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-2">
      <dt className="text-[#9a9a93]">{label}</dt>
      <dd className="text-[#333]">{value}</dd>
    </div>
  )
}

function RangeReadout({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[12px] font-bold text-[#555]">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#ecece8]">
        <div
          className="h-full rounded-full bg-app-action"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label className="block text-[12px] font-bold text-[#667085]">
      {label}
      <input
        className="mt-2 h-10 w-full rounded-[10px] border border-[#dde1e7] px-3 text-[14px] font-semibold text-[#111827] outline-none"
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) =>
          onChange(clampNumber(Number(event.target.value), min, max))
        }
      />
    </label>
  )
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block text-[12px] font-bold text-[#667085]">
      {label}
      <input
        className="mt-2 h-10 w-full rounded-[10px] border border-[#dde1e7] px-3 text-[14px] font-semibold text-[#111827] outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function compileWorkflowUserPrompt(input: {
  workflow: CharacterWorkflowKey
  prompt: string
  characterName: string
  moduleRecipe: Record<string, string>
  recreateMode: string
  referenceImageUrl: string
  motionVideoUrl: string
  selfieTemplate: string
  breastSize: string
  clothingImageUrl: string
  photoDumpCount: number
  slideshowSlides: number
  productName: string
  productAudience: string
  productAngle: string
}) {
  const userPrompt = input.prompt.trim()
  const promptLine = userPrompt || workflowFallbackPrompt(input.workflow)

  if (input.workflow === "free_generate") {
    return promptLine
  }

  if (input.workflow === "recreate_reference") {
    return [
      `workflow: recreate reference for ${input.characterName}`,
      "use any reference image only for pose, composition, camera, outfit vibe, and background.",
      `identity must stay as ${input.characterName}.`,
      `recreation mode: ${input.recreateMode}.`,
      `user changes: ${promptLine}`,
    ].join("\n")
  }

  if (input.workflow === "build_modules") {
    return [
      "workflow: build from modules",
      ...Object.entries(input.moduleRecipe).map(
        ([key, value]) => `${key}: ${value}`
      ),
      `user details: ${promptLine}`,
    ].join("\n")
  }

  if (input.workflow === "batch_photo_dump") {
    return [
      "workflow: batch photo dump",
      `theme: ${promptLine}`,
      `generate a coherent lifestyle image from a ${input.photoDumpCount}-image dump.`,
      "vary pose, outfit, background, and camera angle while keeping face, body, phone case, and skin texture consistent.",
    ].join("\n")
  }

  if (input.workflow === "tiktok_slideshow") {
    return [
      "workflow: tiktok slideshow image",
      `topic: ${promptLine}`,
      `this belongs to a ${input.slideshowSlides}-slide vertical photo slideshow.`,
      "create one candid iPhone-style slide image that can work with cover hooks and slide captions.",
    ].join("\n")
  }

  if (input.workflow === "product_ugc") {
    return [
      "workflow: product ugc creative pack",
      `product: ${input.productName || "attached product asset"}`,
      `audience: ${input.productAudience || "target audience from user prompt"}`,
      `angle: ${input.productAngle || promptLine}`,
      "create an authentic UGC ad image. Include product context only if it is attached or described.",
    ].join("\n")
  }

  if (input.workflow === "motion_control") {
    return [
      "workflow: kling motion-control video",
      "Same girl as reference image, identical face and features.",
      "Follow the movement and facial expressions in the video precisely. Smooth realistic animation, natural physics, stable camera.",
      `motion video: ${input.motionVideoUrl || "user-selected trending video"}`,
      `user details: ${promptLine}`,
    ].join("\n")
  }

  if (input.workflow === "seedream_bedroom_selfie") {
    return [
      "workflow: seedream v4 bedroom selfie preset",
      `preset: ${input.selfieTemplate}`,
      `breast size: ${input.breastSize || "d cup"}`,
      `user details: ${promptLine}`,
    ].join("\n")
  }

  if (input.workflow === "outfit_transfer") {
    return [
      "workflow: outfit transfer",
      "have the woman in image 1 wearing the clothing from reference image 2. Preserve facial structure, skin texture, lighting and body proportions.",
      `clothing reference: ${input.clothingImageUrl || "selected outfit asset"}`,
      `user details: ${promptLine}`,
    ].join("\n")
  }

  if (input.workflow === "pose_variation_cut_video") {
    return [
      "workflow: pose cut video",
      "edit the original image into a stronger pose variation, use original/end-frame as Kling 2.5 start and end frames, then add random 0.2-0.3s micro cuts and a random TikTok trending song from the music folder.",
      `user details: ${promptLine}`,
    ].join("\n")
  }

  return [
    "workflow: animate image source",
    "generate a still image that will animate well with subtle selfie movement, natural blinking, slight head tilt, and handheld phone motion.",
    `user details: ${promptLine}`,
  ].join("\n")
}

function workflowFallbackPrompt(workflow: CharacterWorkflowKey) {
  if (workflow === "recreate_reference") {
    return "recreate the reference as a candid UGC image"
  }
  if (workflow === "build_modules") {
    return "create an authentic UGC image from the selected modules"
  }
  if (workflow === "batch_photo_dump") {
    return "casual weekend at home"
  }
  if (workflow === "tiktok_slideshow") {
    return "candid lifestyle slideshow"
  }
  if (workflow === "product_ugc") {
    return "create a product UGC image"
  }
  if (workflow === "animate_image") {
    return "create a still image suitable for animation"
  }
  if (workflow === "motion_control") {
    return "apply the trending video motion to this character"
  }
  if (workflow === "seedream_bedroom_selfie") {
    return "generate a preset bedroom selfie"
  }
  if (workflow === "outfit_transfer") {
    return "transfer the selected outfit onto this character"
  }
  if (workflow === "pose_variation_cut_video") {
    return "create a start/end frame pose video with micro cuts and music"
  }
  return "Generate an authentic UGC image featuring this character."
}

function buildWorkflowMetadata(input: {
  workflow: CharacterWorkflowKey
  workflowLabel: string
  moduleRecipe: Record<string, string>
  recreateMode: string
  referenceImageUrl: string
  motionVideoUrl: string
  selfieTemplate: string
  breastSize: string
  clothingImageUrl: string
  photoDumpCount: number
  slideshowSlides: number
  productName: string
  productAudience: string
  productAngle: string
}): CharacterWorkflowMetadata {
  const recipe: Record<string, unknown> = {}

  if (input.workflow === "recreate_reference") {
    recipe.mode = input.recreateMode
    recipe.referenceImageUrl = input.referenceImageUrl
    recipe.referenceUse =
      "pose, composition, camera, outfit vibe, and background only"
  }
  if (input.workflow === "build_modules") {
    Object.assign(recipe, input.moduleRecipe)
  }
  if (input.workflow === "batch_photo_dump") {
    recipe.imageCount = input.photoDumpCount
    recipe.vary = ["pose", "outfit", "background", "camera angle"]
    recipe.keepConsistent = ["face", "body", "phone case", "skin texture"]
  }
  if (input.workflow === "tiktok_slideshow") {
    recipe.slideCount = input.slideshowSlides
    recipe.outputs = ["images", "slide captions", "cover hook"]
  }
  if (input.workflow === "product_ugc") {
    recipe.productName = input.productName
    recipe.audience = input.productAudience
    recipe.angle = input.productAngle
    recipe.creativePack = [
      "hook image",
      "holding product",
      "before/after",
      "reaction selfie",
      "result shot",
    ]
  }
  if (input.workflow === "animate_image") {
    recipe.motionPreset = "Subtle selfie movement"
  }
  if (input.workflow === "motion_control") {
    recipe.motionVideoUrl = input.motionVideoUrl
    recipe.character_orientation = "image"
  }
  if (input.workflow === "seedream_bedroom_selfie") {
    recipe.template = input.selfieTemplate
    recipe.breastSize = input.breastSize || "d cup"
  }
  if (input.workflow === "outfit_transfer") {
    recipe.clothingImageUrl = input.clothingImageUrl
  }
  if (input.workflow === "pose_variation_cut_video") {
    recipe.steps = [
      "generate pose variation end frame",
      "animate original and end frame with Kling 2.5",
      "add random micro cuts",
      "add random TikTok trend audio",
    ]
  }

  return {
    workflow: input.workflow,
    workflowLabel: input.workflowLabel,
    recipe,
  }
}

function generationCountForWorkflow(input: {
  workflow: CharacterWorkflowKey
  imageGenerateCount: number
  photoDumpCount: number
  slideshowSlides: number
}) {
  if (
    input.workflow === "recreate_reference" ||
    input.workflow === "build_modules" ||
    input.workflow === "product_ugc"
  ) {
    return clampNumber(input.imageGenerateCount, 1, 5)
  }
  if (input.workflow === "batch_photo_dump") {
    return clampNumber(input.photoDumpCount, 1, 12)
  }
  if (input.workflow === "tiktok_slideshow") {
    return clampNumber(input.slideshowSlides, 2, 10)
  }
  if (
    input.workflow === "motion_control" ||
    input.workflow === "seedream_bedroom_selfie" ||
    input.workflow === "outfit_transfer" ||
    input.workflow === "pose_variation_cut_video"
  ) {
    return 1
  }
  return 1
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
      generation?: CharacterImageGenerationRecord
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
    generation?: CharacterImageGenerationRecord
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

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(max, Math.max(min, Math.round(value)))
}

function createPendingGenerationId(batchIndex: number) {
  return `${Date.now()}-${batchIndex + 1}`
}

function hasImageDragItems(dataTransfer: DataTransfer) {
  const items = Array.from(dataTransfer.items ?? [])
  if (items.length > 0) {
    return items.some(
      (item) => item.kind === "file" && item.type.startsWith("image/")
    )
  }
  return Array.from(dataTransfer.files ?? []).some((file) =>
    file.type.startsWith("image/")
  )
}

function CharacterAvatar({
  character,
  sizeClassName,
}: {
  character: CharacterRecord
  sizeClassName: string
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border-2 border-white bg-cover bg-center shadow-sm",
        sizeClassName
      )}
      role="img"
      aria-label={character.name}
      style={{
        backgroundImage: `url(${character.preview_url || defaultCharacterPreviewUrl})`,
      }}
    />
  )
}

function GenerationPreview({
  generation,
  selectedCharacter,
  selected,
}: {
  generation: CharacterImageGenerationRecord
  selectedCharacter: CharacterRecord
  selected?: boolean
}) {
  const primaryMedia = characterGenerationPrimaryMedia(generation)

  return (
    <div
      className={cn(
        "relative grid overflow-hidden rounded-[10px] bg-[#ecece8] transition group-hover:ring-2 group-hover:ring-app-action",
        selected && "ring-2 ring-app-action"
      )}
      style={{ aspectRatio: ratioToCss(generation.aspectRatio) }}
    >
      {generation.status === "processing" ? (
        <div className="grid place-items-center px-6">
          <div className="w-full">
            <div className="mb-4 flex items-center justify-center">
              <CharacterAvatar
                character={selectedCharacter}
                sizeClassName="size-16"
              />
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-app-action transition-all"
                style={{ width: `${generation.progress}%` }}
              />
            </div>
            <div className="mt-3 text-center text-[12px] font-bold text-[#667085]">
              Generating...
            </div>
          </div>
        </div>
      ) : primaryMedia?.type === "video" ? (
        <video
          src={primaryMedia.url}
          className="h-full w-full object-cover"
          muted
          playsInline
          controls
        />
      ) : primaryMedia?.type === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element -- Generated local image URL is returned by the app API.
        <img
          src={primaryMedia.url}
          alt={generation.prompt || "Generated character image"}
          className="h-full w-full object-cover"
        />
      ) : generation.status === "failed" ? (
        <div className="grid place-items-center px-5 text-center">
          <div>
            <IconX className="mx-auto size-8 text-[#d8505f]" />
            <div className="mt-3 text-[13px] font-bold text-[#c63d4a]">
              {generation.error || "Generation failed"}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid place-items-center">
          <CharacterAvatar
            character={selectedCharacter}
            sizeClassName="size-20"
          />
        </div>
      )}
    </div>
  )
}

// Legacy modal editor kept temporarily; generation cards now select edit sources instead.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function CharacterImageEditorModal({
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

function ratioToCss(value: string) {
  return value.includes(":") ? value.replace(":", " / ") : "4 / 5"
}

function CharacterAssetsPanel({
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
            <div className="grid h-full place-items-center text-center">
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

function PromptDebugModal({
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

function GenerationDebugModal({
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

function AttachmentSquareRow({
  attachments,
  ariaLabel,
}: {
  attachments: CharacterPromptAttachment[]
  ariaLabel: string
}) {
  if (attachments.length === 0) {
    return null
  }

  return (
    <div className="flex gap-2 overflow-x-auto" aria-label={ariaLabel}>
      {attachments.map((attachment) => (
        <a
          key={`${attachment.kind}-${attachment.url}`}
          href={attachment.url}
          target="_blank"
          rel="noreferrer"
          title={attachment.label}
          className="block size-14 shrink-0 overflow-hidden rounded-[10px] border border-[#e4e4df] bg-[#f2f2ee] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Local/generated attachment thumbnails can be blob or local API URLs. */}
          <img
            src={attachment.url}
            alt={attachment.label}
            className="h-full w-full object-cover"
          />
        </a>
      ))}
    </div>
  )
}

function GenerationImagePreviewModal({
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

function ReferenceImageModal({
  selectedAssetId,
  onSelect,
  onClose,
}: {
  selectedAssetId?: string
  onSelect: (asset: AssetRecord) => void
  onClose: () => void
}) {
  const [assets, setAssets] = useState<AssetRecord[]>([])
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
            <div className="text-[24px] font-semibold text-[#9ca3af]">
              No reference images yet
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
                      "overflow-hidden rounded-[10px] border-2 bg-[#f7f7f4] text-left transition",
                      ready
                        ? "border-[#12b76a] hover:shadow-md"
                        : "border-[#f04438] opacity-70",
                      selectedAssetId === asset.id && "ring-2 ring-[#12b76a]"
                    )}
                    onClick={() => ready && onSelect(asset)}
                    title={
                      ready
                        ? "Use this analyzed reference"
                        : "Reference analysis is not ready"
                    }
                  >
                    {asset.fileUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- Asset image is served by local app API.
                      <img
                        src={asset.fileUrl}
                        alt={asset.name}
                        className="h-40 w-full object-cover"
                      />
                    )}
                    <div className="flex items-center justify-between gap-2 px-3 py-2 text-[12px] font-semibold text-[#555]">
                      <span className="truncate">{asset.name}</span>
                      <span
                        className={cn(
                          "size-2 rounded-full",
                          ready ? "bg-[#12b76a]" : "bg-[#f04438]"
                        )}
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="border-t border-[#eceff3] p-3">
          <div className="mb-3">
            <UploadDropzone
              inputRef={fileInputRef}
              accept="image/*"
              onFiles={chooseReferenceFile}
              className="min-h-32 rounded-[10px]"
            >
              {previewUrl ? (
                <span className="block w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Local file preview from user-selected upload. */}
                  <img
                    src={previewUrl}
                    alt={file?.name || "Reference upload preview"}
                    className="mx-auto max-h-32 rounded-[8px] object-contain"
                  />
                  <span className="mt-2 block text-[12px] font-bold text-[#333]">
                    {file?.name}
                  </span>
                </span>
              ) : (
                <span>
                  <IconUpload className="mx-auto mb-2 size-7 text-[#8b8b86]" />
                  <span className="block text-[14px] font-bold text-[#333]">
                    Upload reference image
                  </span>
                  <span className="mt-1 block text-[12px] font-semibold text-[#8b8b86]">
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
              {importing ? "Analyzing..." : "Upload and analyze"}
            </Button>
          </div>
          <div className="flex gap-2">
            <input
              className="h-11 min-w-0 flex-1 rounded-[10px] border border-[#dde1e7] px-3 text-[14px] font-semibold text-[#111827] outline-none"
              placeholder="Paste image URL"
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
            />
            <Button
              variant="action"
              disabled={importing}
              onClick={() => void importReference("url")}
            >
              {importing ? "Analyzing..." : "Add"}
            </Button>
          </div>
        </div>
      </AppModalPanel>
    </AppModal>
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

function MotionReferenceModal({
  selectedUrl,
  onSelect,
  onClose,
}: {
  selectedUrl: string
  onSelect: (url: string) => void
  onClose: () => void
}) {
  const [assets, setAssets] = useState<AssetRecord[]>([])
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
          <UploadDropzone
            inputRef={inputRef}
            accept="video/*"
            onFiles={chooseFile}
            className="min-h-36 rounded-[10px]"
          >
            {previewUrl ? (
              <span className="block w-full">
                <video
                  src={previewUrl}
                  className="mx-auto aspect-video max-h-36 w-full rounded-[8px] object-cover"
                  muted
                  playsInline
                  controls
                />
                <span className="mt-2 block text-[12px] font-bold text-[#333]">
                  {file?.name}
                </span>
              </span>
            ) : (
              <span>
                <IconUpload className="mx-auto mb-2 size-7 text-[#8b8b86]" />
                <span className="block text-[14px] font-bold text-[#333]">
                  Upload motion reference video
                </span>
                <span className="mt-1 block text-[12px] font-semibold text-[#8b8b86]">
                  MP4, MOV, or WEBM
                </span>
              </span>
            )}
          </UploadDropzone>
          {uploadError && (
            <div className="rounded-[8px] bg-[#fff0f0] px-4 py-2 text-[13px] font-semibold text-[#c63d4a]">
              {uploadError}
            </div>
          )}
          <Button
            variant="action"
            className="w-full justify-center"
            disabled={uploading || !file}
            onClick={() => void uploadMotionReference()}
          >
            {uploading ? "Uploading..." : "Upload and use"}
          </Button>
          <div className="flex gap-2">
            <input
              className="h-11 min-w-0 flex-1 rounded-[10px] border border-[#dde1e7] px-3 text-[14px] font-semibold text-[#111827] outline-none"
              placeholder="Paste video URL"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
            <Button
              variant="action"
              onClick={() => {
                if (url.trim()) {
                  onSelect(url.trim())
                }
              }}
            >
              Use URL
            </Button>
          </div>
          <div className="grid max-h-[360px] grid-cols-2 gap-3 overflow-y-auto">
            {assets.map((asset) => (
              <button
                key={asset.id}
                className={cn(
                  "rounded-[10px] border border-[#eceff3] bg-[#f7f7f4] p-3 text-left text-[12px] font-bold text-[#555]",
                  selectedUrl === asset.fileUrl && "ring-2 ring-app-action"
                )}
                onClick={() => asset.fileUrl && onSelect(asset.fileUrl)}
                disabled={!asset.fileUrl}
              >
                <span className="block truncate">{asset.name}</span>
                <span className="mt-1 block truncate text-[#8a8a84]">
                  {asset.fileUrl}
                </span>
              </button>
            ))}
          </div>
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

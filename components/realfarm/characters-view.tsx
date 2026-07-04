"use client"

import { useEffect, useRef, useState } from "react"
import { IconBug, IconChevronLeft, IconChevronRight, IconPhoto, IconPlus, IconSparkles, IconUpload, IconX } from "@tabler/icons-react"
import { Folder, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { CharacterCreateModal, NewCharacterModal } from "@/components/realfarm/character-create"
import { Button } from "@/components/ui/button"
import { useDismissableLayer } from "@/components/ui/dismissable"
import { SelectControl } from "@/components/ui/form-controls"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import { UploadDropzone } from "@/components/ui/upload-dropzone"
import type { AssetCategory, AssetKind, AssetRecord } from "@/lib/assets"
import type { CharacterPayload, CharacterRecord } from "@/lib/characters"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import {
  buildCharacterPromptPackage,
  characterImageAspectRatios,
  characterImageToVideoModels,
  createCharacterImageGenerationRecord,
  type CharacterImageGenerationRecord,
  type CharacterPromptAttachment,
  characterGenerationModels,
  defaultImageToVideoModel,
  defaultImageGenerationModel,
  defaultCharacterPreviewUrl,
  formatCharacterValue,
  ugcImagePromptPresets,
} from "@/lib/realfarm-character-ui"
import { cn } from "@/lib/utils"

export function AvatarsView() {
  const [characterOpen, setCharacterOpen] = useState(false)
  const [editingCharacter, setEditingCharacter] = useState<CharacterRecord | null>(null)
  const [characters, setCharacters] = useState<CharacterRecord[]>([])
  const [selectedCharacterId, setSelectedCharacterId] = useState<number | null>(null)

  useEffect(() => {
    let active = true

    async function loadCharacters() {
      try {
        const data = await fetchJsonWithTimeout<{ characters?: CharacterRecord[] }>("/api/characters", {
          cache: "no-store",
          timeoutMs: 12_000,
          toastOnError: false,
        })
        if (!active) {
          return
        }
        const loadedCharacters = data.characters ?? []
        setCharacters(loadedCharacters)
        setSelectedCharacterId((current) => current ?? loadedCharacters[0]?.id ?? null)
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

  const selectedCharacter = characters.find((character) => character.id === selectedCharacterId) ?? characters[0]

  async function saveCharacter(payload: CharacterPayload) {
    const data = await toast.promise(
      fetchJsonWithTimeout<{ character: CharacterRecord }>("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeoutMs: 15_000,
        toastOnError: false,
        body: JSON.stringify(payload),
      }),
      {
        loading: "Saving character...",
        success: "Character saved",
        error: (error) => getApiErrorMessage(error, "Failed to save character"),
      },
    ).unwrap()
    setCharacters((current) => {
      const exists = current.some((character) => character.id === data.character.id)
      return exists
        ? current.map((character) => character.id === data.character.id ? data.character : character)
        : [data.character, ...current]
    })
    setSelectedCharacterId(data.character.id)
    setEditingCharacter(null)
    setCharacterOpen(false)
  }

  async function deleteCharacterById(id: number) {
    await toast.promise(
      fetchJsonWithTimeout(`/api/characters?id=${id}`, { method: "DELETE", timeoutMs: 15_000, toastOnError: false }),
      {
        loading: "Deleting character...",
        success: "Character deleted",
        error: (error) => getApiErrorMessage(error, "Failed to delete character"),
      },
    ).unwrap()
    setCharacters((current) => {
      const next = current.filter((character) => character.id !== id)
      setSelectedCharacterId((selectedId) => selectedId === id ? next[0]?.id ?? null : selectedId)
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
            <h1 className="px-3 text-[20px] font-bold text-[#111827]">AI Characters</h1>
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
              <IconPhoto className="mx-auto size-12 text-[#b8babf]" stroke={1.5} />
              <div className="mt-5 text-[22px] font-bold text-[#333]">No characters yet</div>
              <div className="mt-3 text-[17px] font-semibold text-[#8b8b86]">Create a character to generate images</div>
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
        onRename={(character, name) => saveCharacter({
          id: character.id,
          name,
          attributes: character.attributes,
          preview_url: character.preview_url,
        })}
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
  const [referenceOpen, setReferenceOpen] = useState(false)
  const [assetsOpen, setAssetsOpen] = useState(false)
  const [selectedAssets, setSelectedAssets] = useState<AssetRecord[]>([])
  const [debugOpen, setDebugOpen] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [presetPickerOpen, setPresetPickerOpen] = useState(false)
  const modelMenuRef = useDismissableLayer<HTMLDivElement>(() => setModelMenuOpen(false), modelMenuOpen)
  const [selectedModel, setSelectedModel] = useState(defaultImageGenerationModel)
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<(typeof characterImageAspectRatios)[number]>(characterImageAspectRatios[0])
  const [generations, setGenerations] = useState<CharacterImageGenerationRecord[]>([])
  const [selectedGeneration, setSelectedGeneration] = useState<CharacterImageGenerationRecord | null>(null)
  const [nameEdit, setNameEdit] = useState({ id: selectedCharacter.id, draft: selectedCharacter.name, editing: false })
  const renamingName = nameEdit.id === selectedCharacter.id && nameEdit.editing
  const nameDraft = nameEdit.id === selectedCharacter.id ? nameEdit.draft : selectedCharacter.name
  const promptPackage = buildCharacterPromptPackage({
    userPrompt: prompt,
    character: selectedCharacter,
    assets: selectedAssets,
  })
  const viewableGenerations = generations.filter((generation): generation is CharacterImageGenerationRecord & { imageUrl: string } => Boolean(generation.imageUrl))
  const selectedGenerationIndex = selectedGeneration ? viewableGenerations.findIndex((generation) => generation.id === selectedGeneration.id) : -1
  const selectedViewableGeneration = selectedGenerationIndex >= 0 ? viewableGenerations[selectedGenerationIndex] : null

  useEffect(() => {
    let active = true
    void fetchJsonWithTimeout<{ generations?: CharacterImageGenerationRecord[] }>(`/api/characters/images?characterId=${selectedCharacter.id}`, {
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
          toast.error(getApiErrorMessage(error, "Failed to load generated character images"))
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
    setNameEdit({ id: selectedCharacter.id, draft: nextName || selectedCharacter.name, editing: false })
  }

  async function generateCharacterImage() {
    const generationId = `${Date.now()}`
    const pending = createCharacterImageGenerationRecord({
      id: generationId,
      prompt: promptPackage.prompt,
      model: selectedModel,
      aspectRatio: selectedAspectRatio,
      attachments: promptPackage.attachments,
      status: "processing",
      progress: 12,
    })
    setGenerations((current) => [pending, ...current])

    try {
      setGenerations((current) => current.map((generation) => generation.id === generationId ? { ...generation, progress: 42 } : generation))
      const result = await fetchJsonWithTimeout<{ imageUrl?: string; generation?: CharacterImageGenerationRecord; error?: string }>("/api/characters/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeoutMs: 300_000,
        toastOnError: false,
        body: JSON.stringify({
          characterId: selectedCharacter.id,
          prompt: promptPackage.prompt,
          model: selectedModel,
          aspectRatio: selectedAspectRatio,
          attachments: promptPackage.attachments,
        }),
      })
      if (!result.imageUrl) {
        throw new Error(result.error || "Image generation failed")
      }
      setGenerations((current) => current.map((generation) => generation.id === generationId ? {
        ...(result.generation ?? generation),
        status: "ready",
        imageUrl: result.imageUrl,
        progress: 100,
      } : generation))
      toast.success("Character image ready")
    } catch (error) {
      const message = getApiErrorMessage(error, "Image generation failed")
      setGenerations((current) => current.map((generation) => generation.id === generationId ? {
        ...generation,
        status: "failed",
        error: message,
        progress: 100,
      } : generation))
      toast.error(message)
    }
  }

  return (
    <div className="grid min-h-[calc(100svh-72px)] overflow-hidden rounded-[8px] bg-[#f8f8f4] lg:grid-cols-[280px_1fr]">
      <aside className="bg-[#efefe9] px-2 py-4">
        <h1 className="px-3 text-[20px] font-bold text-[#111827]">AI Characters</h1>
        <Button variant="action" size="largeAction" className="mt-6 w-full" onClick={onNew}>
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
                <span className="block truncate text-[15px] font-bold text-[#252525]">{character.name}</span>
                <span className="mt-1 block text-[13px] font-bold text-[#555]">
                  {formatCharacterValue(character.attributes.gender)} <span className="ml-4">{character.attributes.age || "None"}</span>
                </span>
              </span>
              <span className="absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-1 group-hover:flex">
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
            <CharacterAvatar character={selectedCharacter} sizeClassName="size-14" />
            <div className="min-w-0">
              {renamingName ? (
                <input
                  className="h-10 min-w-[260px] rounded-[10px] border border-[#d8dce5] bg-white px-3 text-[24px] font-bold text-[#111827] outline-none shadow-sm"
                  value={nameDraft}
                  onChange={(event) => setNameEdit({ id: selectedCharacter.id, draft: event.target.value, editing: true })}
                  onBlur={() => void commitNameEdit()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void commitNameEdit()
                    }
                    if (event.key === "Escape") {
                      setNameEdit({ id: selectedCharacter.id, draft: selectedCharacter.name, editing: false })
                    }
                  }}
                  aria-label="Character name"
                  autoFocus
                />
              ) : (
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[26px] font-bold text-[#111827]">{selectedCharacter.name}</span>
                  <button
                    className="grid size-8 shrink-0 place-items-center rounded-[8px] text-[#9aa1ad] hover:bg-white hover:text-[#333]"
                    onClick={() => {
                      setNameEdit({ id: selectedCharacter.id, draft: selectedCharacter.name, editing: true })
                    }}
                    aria-label="Rename character"
                  >
                    <Pencil className="size-5" />
                  </button>
                </div>
              )}
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
            <Button
              variant="outline"
              onClick={() => onEdit(selectedCharacter)}
            >
              <Pencil className="mr-2 size-4" />
              Edit character
            </Button>
          </div>
        </div>

        <div className={cn("absolute inset-x-0 bottom-0 top-[104px] overflow-y-auto px-7 pb-64 pt-8", generations.length === 0 && "grid place-items-center text-center")}>
          {generations.length === 0 ? (
            <div>
              <IconPhoto className="mx-auto size-12 text-[#b8babf]" stroke={1.5} />
              <div className="mt-5 text-[22px] font-bold text-[#333]">No images yet</div>
              <div className="mt-3 text-[17px] font-semibold text-[#8b8b86]">Use the prompt below to generate images</div>
            </div>
          ) : (
            <div className="mx-auto grid max-w-[760px] grid-cols-2 gap-4 md:grid-cols-3">
              {generations.map((generation) => (
                <button
                  key={generation.id}
                  className="group relative block overflow-hidden rounded-[10px] bg-transparent p-0"
                  onClick={() => {
                    if (generation.imageUrl) {
                      setSelectedGeneration(generation)
                    }
                  }}
                >
                  <GenerationPreview generation={generation} selectedCharacter={selectedCharacter} />
                </button>
              ))}
            </div>
          )}
        </div>

        <section className="absolute inset-x-8 bottom-6 z-30 mx-auto max-w-[760px] rounded-[16px] bg-white p-4 shadow-[0_18px_48px_rgba(0,0,0,0.14)]">
          <textarea
            className="h-20 w-full resize-none bg-transparent text-[16px] font-semibold leading-6 text-[#333] outline-none placeholder:text-[#a5adbb]"
            placeholder="Describe a scene, pose, outfit... or add Assets"
            aria-label="Edit AI UGC character prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
          {selectedAssets.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {selectedAssets.map((asset) => (
                <button
                  key={asset.id}
                  className="rounded-full bg-[#f2f4f7] px-3 py-1 text-[12px] font-bold text-[#344054] hover:bg-[#e6e9ef]"
                  onClick={() => setSelectedAssets((current) => current.filter((item) => item.id !== asset.id))}
                >
                  {asset.name}
                </button>
              ))}
            </div>
          )}
          <AttachmentSquareRow attachments={promptPackage.attachments} ariaLabel="Prompt attachments" />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="softControl"
              size="lg"
              onClick={() => setPresetPickerOpen(true)}
            >
              <IconSparkles className="mr-2 size-4" />
              Presets
            </Button>
            <Button variant="softControl" size="lg" onClick={() => setAssetsOpen(true)}>
              <Folder className="mr-2 size-4" />
              Assets
            </Button>
            <Button
              variant="outline"
              className="grid w-10 place-items-center"
              aria-label="Add a reference image"
              onClick={() => setReferenceOpen(true)}
            >
              <IconPlus className="size-5" />
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <label className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-[#77766f]">
                Ratio
                <SelectControl
                  aria-label="Image aspect ratio"
                  value={selectedAspectRatio}
                  onChange={(event) => setSelectedAspectRatio(event.target.value as (typeof characterImageAspectRatios)[number])}
                >
                  {characterImageAspectRatios.map((ratio) => (
                    <option key={ratio} value={ratio}>{ratio}</option>
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
                        className={cn("flex h-10 w-full items-center rounded-[8px] px-3 text-left text-[14px] font-bold text-[#333] hover:bg-[#f5f5f1]", selectedModel === model && "bg-[#eef0f5]")}
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
                Generate
              </Button>
            </div>
          </div>
        </section>
      </main>
      {referenceOpen && <ReferenceImageModal onClose={() => setReferenceOpen(false)} />}
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
      {presetPickerOpen && (
        <PresetPickerModal
          onClose={() => setPresetPickerOpen(false)}
          onSelect={(preset) => {
            setPrompt(preset.prompt)
            if (preset.aspectRatio && characterImageAspectRatios.includes(preset.aspectRatio as (typeof characterImageAspectRatios)[number])) {
              setSelectedAspectRatio(preset.aspectRatio as (typeof characterImageAspectRatios)[number])
            }
            if (preset.modelDisplayName && characterGenerationModels.includes(preset.modelDisplayName)) {
              setSelectedModel(preset.modelDisplayName)
            }
            setPresetPickerOpen(false)
          }}
        />
      )}
      {selectedViewableGeneration && (
        <CharacterImageEditorModal
          generation={selectedViewableGeneration}
          title={`${selectedCharacter.name} generated image`}
          index={selectedGenerationIndex}
          total={viewableGenerations.length}
          onCaptionChange={(caption) => {
            setGenerations((current) => current.map((generation) =>
              generation.id === selectedViewableGeneration.id ? { ...generation, prompt: caption } : generation
            ))
            setSelectedGeneration((current) => current?.id === selectedViewableGeneration.id ? { ...current, prompt: caption } : current)
          }}
          onImageReplace={(imageUrl) => {
            setGenerations((current) => current.map((generation) =>
              generation.id === selectedViewableGeneration.id ? { ...generation, imageUrl, status: "ready", progress: 100 } : generation
            ))
            setSelectedGeneration((current) => current?.id === selectedViewableGeneration.id ? { ...current, imageUrl, status: "ready", progress: 100 } : current)
          }}
          onVideoUpdate={(update) => {
            setGenerations((current) => current.map((generation) =>
              generation.id === selectedViewableGeneration.id ? { ...generation, ...update } : generation
            ))
            setSelectedGeneration((current) => current?.id === selectedViewableGeneration.id ? { ...current, ...update } : current)
          }}
          onPrevious={() => setSelectedGeneration(viewableGenerations[Math.max(0, selectedGenerationIndex - 1)] ?? selectedViewableGeneration)}
          onNext={() => setSelectedGeneration(viewableGenerations[Math.min(viewableGenerations.length - 1, selectedGenerationIndex + 1)] ?? selectedViewableGeneration)}
          onClose={() => setSelectedGeneration(null)}
        />
      )}
      {debugOpen && (
        <PromptDebugModal
          prompt={promptPackage.prompt}
          attachments={promptPackage.attachments}
          onClose={() => setDebugOpen(false)}
        />
      )}
    </div>
  )
}

function CharacterAvatar({ character, sizeClassName }: { character: CharacterRecord; sizeClassName: string }) {
  return (
    <span
      className={cn("shrink-0 rounded-full border-2 border-white bg-cover bg-center shadow-sm", sizeClassName)}
      role="img"
      aria-label={character.name}
      style={{ backgroundImage: `url(${character.preview_url || defaultCharacterPreviewUrl})` }}
    />
  )
}

function GenerationPreview({
  generation,
  selectedCharacter,
}: {
  generation: CharacterImageGenerationRecord
  selectedCharacter: CharacterRecord
}) {
  return (
    <div className="relative grid overflow-hidden rounded-[10px] bg-[#ecece8] transition group-hover:ring-2 group-hover:ring-app-action" style={{ aspectRatio: ratioToCss(generation.aspectRatio) }}>
      {generation.status === "processing" ? (
        <div className="grid place-items-center px-6">
          <div className="w-full">
            <div className="mb-4 flex items-center justify-center">
              <CharacterAvatar character={selectedCharacter} sizeClassName="size-16" />
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white">
              <div className="h-full rounded-full bg-app-action transition-all" style={{ width: `${generation.progress}%` }} />
            </div>
            <div className="mt-3 text-center text-[12px] font-bold text-[#667085]">Generating...</div>
          </div>
        </div>
      ) : generation.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Generated local image URL is returned by the app API.
        <img src={generation.imageUrl} alt={generation.prompt || "Generated character image"} className="h-full w-full object-cover" />
      ) : generation.status === "failed" ? (
        <div className="grid place-items-center px-5 text-center">
          <div>
            <IconX className="mx-auto size-8 text-[#d8505f]" />
            <div className="mt-3 text-[13px] font-bold text-[#c63d4a]">{generation.error || "Generation failed"}</div>
          </div>
        </div>
      ) : (
        <div className="grid place-items-center">
          <CharacterAvatar character={selectedCharacter} sizeClassName="size-20" />
        </div>
      )}
    </div>
  )
}

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
  const [activeImageTool, setActiveImageTool] = useState<"edit" | "upscale">("edit")
  const [imagePrompt, setImagePrompt] = useState("")
  const [imageModel, setImageModel] = useState("gpt-image-1")
  const [upscaleFactor, setUpscaleFactor] = useState("2")
  const [imageWorking, setImageWorking] = useState(false)
  const [imageError, setImageError] = useState("")
  const [videoPrompt, setVideoPrompt] = useState("Animate this generated character image with natural camera movement.")
  const [videoModel, setVideoModel] = useState(generation.videoModel || defaultImageToVideoModel)
  const [videoDuration, setVideoDuration] = useState("5")
  const [videoSound, setVideoSound] = useState(false)
  const [videoWorking, setVideoWorking] = useState(false)
  const [videoError, setVideoError] = useState("")

  async function runImageAction() {
    setImageWorking(true)
    setImageError("")
    const toastId = toast.loading(activeImageTool === "edit" ? "Generating image edit..." : "Upscaling image...")
    try {
      const payload = await fetchJsonWithTimeout<{ imageUrl?: string }>("/api/image-collections/image-actions", {
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
      })
      if (!payload.imageUrl) {
        throw new Error("Image action failed")
      }
      onImageReplace(payload.imageUrl)
      toast.success(activeImageTool === "edit" ? "Image edit ready" : "Upscaled image ready", { id: toastId })
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
      const payload = await fetchJsonWithTimeout<{ videoUrl?: string; taskId?: string; error?: string }>("/api/characters/video", {
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
      <button className="absolute right-6 top-5 z-10 grid size-9 place-items-center rounded-full hover:bg-white/10" onClick={onClose} aria-label="Close image editor">
        <IconX className="size-8" />
      </button>
      <button
        className="absolute left-8 top-1/2 z-10 grid size-12 -translate-y-1/2 place-items-center rounded-full hover:bg-white/10 disabled:opacity-30"
        onClick={onPrevious}
        disabled={index === 0}
        aria-label="Previous image"
      >
        <IconChevronLeft className="size-10" />
      </button>
      <button
        className="absolute right-8 top-1/2 z-10 grid size-12 -translate-y-1/2 place-items-center rounded-full hover:bg-white/10 disabled:opacity-30"
        onClick={onNext}
        disabled={index === total - 1}
        aria-label="Next image"
      >
        <IconChevronRight className="size-10" />
      </button>
      <div className="flex flex-1 items-center justify-center px-6 pb-6 pt-14 md:px-20">
        <div className="flex min-h-0 w-full max-w-[980px] flex-col items-center">
          <div
            className="h-[52vh] min-h-[260px] w-full bg-contain bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${generation.imageUrl})` }}
            role="img"
            aria-label={title}
          />
          <textarea
            className="mt-2 min-h-[44px] w-full max-w-[860px] resize-none bg-transparent text-center text-[15px] font-semibold leading-6 text-white outline-none placeholder:text-white/55"
            value={generation.prompt || "Character generation"}
            placeholder="Add image caption..."
            onChange={(event) => onCaptionChange(event.target.value)}
          />
          <div className="mt-1 rounded-[3px] bg-black/55 px-4 py-1.5 text-[15px] font-bold">{index + 1} / {total}</div>
          <div className="mt-2 w-full max-w-[860px] rounded-[8px] bg-white p-3 text-[#242421] shadow-xl">
            <div className="mb-2 grid h-8 w-[180px] grid-cols-2 rounded-[6px] bg-[#ecebe4] p-0.5 text-[12px] font-semibold">
              {(["image", "video"] as const).map((tab) => (
                <button
                  key={tab}
                  className={cn("rounded-[5px] px-3 capitalize leading-none text-[#595852]", activeTab === tab && "bg-white text-[#242421] shadow-sm")}
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
                        className={cn("rounded-[5px] px-3 capitalize leading-none text-[#595852]", activeImageTool === tool && "bg-white text-[#242421] shadow-sm")}
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
                    <option value="gpt-image-1">GPT Image 1</option>
                    <option value="flux">Flux</option>
                    <option value="dall-e-3">DALL-E 3</option>
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
                    disabled={imageWorking || (activeImageTool === "edit" && !imagePrompt.trim())}
                    onClick={() => void runImageAction()}
                  >
                    {imageWorking ? "Generating..." : activeImageTool === "edit" ? "Generate" : "Upscale"}
                  </Button>
                </div>
                {activeImageTool === "edit" && (
                  <textarea
                    className="mt-2 min-h-[44px] w-full resize-none rounded-[6px] border border-[#deddd5] px-3 py-2 text-[13px] font-medium leading-5 outline-none placeholder:text-[#aaa]"
                    value={imagePrompt}
                    onChange={(event) => setImagePrompt(event.target.value)}
                    placeholder="Describe the edit you want to make..."
                  />
                )}
                {imageError && <div className="mt-2 rounded-[6px] bg-[#fff3f0] px-3 py-2 text-[12px] font-semibold text-[#b44d38]">{imageError}</div>}
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
                      <option key={model.label} value={model.label}>{model.label}</option>
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
                  className="min-h-[58px] w-full resize-none rounded-[6px] border border-[#deddd5] px-3 py-2 text-[13px] font-medium leading-5 outline-none placeholder:text-[#aaa]"
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

function PresetPickerModal({
  onClose,
  onSelect,
}: {
  onClose: () => void
  onSelect: (preset: (typeof ugcImagePromptPresets)[number]) => void
}) {
  return (
    <AppModal className="z-[80]" onClose={onClose}>
      <AppModalPanel className="max-w-[920px]">
        <AppModalHeader
          title="Choose preset"
          description="Select a visual preset to load its prompt and format."
          closeLabel="Close presets"
          onClose={onClose}
        />
        <div className="grid max-h-[70vh] gap-4 overflow-y-auto p-5 sm:grid-cols-2 lg:grid-cols-3">
          {ugcImagePromptPresets.map((preset) => (
            <button
              key={preset.name}
              type="button"
              className="overflow-hidden rounded-[12px] border border-[#e4e4df] bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              onClick={() => onSelect(preset)}
            >
              <PresetVisualThumb preset={preset} />
              <div className="p-3">
                <div className="truncate text-[14px] font-bold text-[#252525]">{preset.name}</div>
                <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] font-bold uppercase text-[#77766f]">
                  {preset.aspectRatio && <span>{preset.aspectRatio}</span>}
                  {preset.modelDisplayName && <span className="truncate">{preset.modelDisplayName}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

function PresetVisualThumb({ preset }: { preset: (typeof ugcImagePromptPresets)[number] }) {
  const aspectRatio = ratioToCss(preset.aspectRatio || "4:5")
  if (preset.thumbnailUrl) {
    return (
      <span className="block overflow-hidden bg-[#ecece8]" style={{ aspectRatio }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Preset thumbnails are external/static catalog images when available. */}
        <img src={preset.thumbnailUrl} alt={preset.name} className="h-full w-full object-cover" />
      </span>
    )
  }

  return (
    <span className="relative block overflow-hidden bg-[#ecece8]" style={{ aspectRatio }}>
      <span className="absolute inset-0 bg-[linear-gradient(135deg,#f6d6ce_0%,#dce8f7_48%,#ede7cf_100%)]" />
      <span className="absolute inset-x-4 bottom-4 top-4 rounded-[10px] border border-white/70 bg-white/65 shadow-sm" />
      <span className="absolute left-6 top-6 h-3 w-24 rounded-full bg-[#252525]/75" />
      <span className="absolute bottom-7 left-6 h-2 w-28 rounded-full bg-[#ff4f28]/75" />
      <span className="absolute bottom-10 right-6 grid size-12 place-items-center rounded-full bg-white/85 text-[#8f96a3] shadow-sm">
        <IconPhoto className="size-6" stroke={1.5} />
      </span>
    </span>
  )
}

function ratioToCss(value: string) {
  return value.includes(":") ? value.replace(":", " / ") : "4 / 5"
}

type AssetTab = "outfits" | "accessories" | "background" | "products"

const assetTabs = ["outfits", "accessories", "background", "products"] as const
const assetCategoryByTab: Record<AssetTab, AssetCategory> = {
  outfits: "outfit",
  accessories: "accessory",
  background: "background",
  products: "product",
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
  const showImageOnlyGrid = activeTab === "outfits" || activeTab === "background"

  useEffect(() => {
    let active = true
    void fetchJsonWithTimeout<{ assets?: AssetRecord[] }>(`/api/assets?scope=ugc_avatar&category=${encodeURIComponent(activeCategory)}`, {
      cache: "no-store",
      timeoutMs: 12_000,
      toastOnError: false,
    })
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
      setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)])
    }
    setCreateOpen(false)
  }

  return (
    <div className="fixed inset-y-0 right-0 z-[60] w-full max-w-[360px] border-l border-[#e4e4df] bg-white shadow-2xl">
      <div className="flex h-16 items-center justify-between border-b border-[#ededed] px-4">
        <h2 className="text-[20px] font-bold text-[#202020]">Assets</h2>
        <button className="grid size-9 place-items-center rounded-[8px] text-[#667085] hover:bg-[#f4f4f2]" onClick={onClose} aria-label="Close assets">
          <IconX className="size-5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 border-b border-[#ededed] p-3">
        {assetTabs.map((tab) => (
          <button
            key={tab}
            className={cn(
              "h-10 rounded-[9px] text-[13px] font-bold capitalize text-[#666] hover:bg-[#f5f5f1]",
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
          <Button variant="action" size="appDefault" className="w-full justify-center" onClick={() => setCreateOpen(true)}>
            <IconPlus className="size-4" />
            Create asset
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="grid h-full place-items-center text-center">
              <div className="text-[14px] font-bold text-[#737373]">Loading assets...</div>
            </div>
          ) : error ? (
            <div className="rounded-[10px] bg-[#fff0f0] p-3 text-[13px] font-semibold text-[#c63d4a]">{error}</div>
          ) : assets.length === 0 ? (
            <div className="grid h-full place-items-center text-center">
              <div>
                <Folder className="mx-auto size-10 text-[#b7bcc5]" strokeWidth={1.5} />
                <div className="mt-4 text-[16px] font-bold text-[#333]">No {activeTab} yet</div>
                <div className="mt-2 text-[13px] font-semibold text-[#8b8b86]">Upload or generate one to use it in prompts.</div>
              </div>
            </div>
          ) : (
            showImageOnlyGrid ? (
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
                      selectedAssetIds.includes(asset.id) ? "border-[#ff4f28] ring-2 ring-[#ff4f28]/20" : "border-[#e4e4df]"
                    )}
                    onClick={() => onToggleAsset(asset)}
                  >
                    <AssetThumb asset={asset} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold text-[#252525]">{asset.name}</span>
                      <span className="mt-1 block line-clamp-2 text-[11px] font-semibold leading-4 text-[#667085]">{asset.caption || asset.prompt || "No caption yet"}</span>
                      <span className="mt-2 inline-flex rounded-full bg-[#f2f4f7] px-2 py-0.5 text-[10px] font-bold uppercase text-[#667085]">{asset.source.replace("_", " ")}</span>
                    </span>
                  </button>
                ))}
              </div>
            )
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
  const caption = asset.caption || asset.prompt || asset.name || "No caption yet"

  return (
    <button
      className={cn(
        "group relative aspect-square overflow-hidden rounded-[8px] border bg-[#f1f1ed] text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff4f28]",
        selected ? "border-[#ff4f28] ring-2 ring-[#ff4f28]/30" : "border-[#e4e4df] hover:border-[#c9c9c3]"
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
          <img src={asset.fileUrl} alt={asset.name} className="h-full w-full object-cover" />
        </>
      ) : (
        <span className="grid h-full w-full place-items-center text-[#a3a8b1]">
          <IconPhoto className="size-8" stroke={1.5} />
        </span>
      )}
      <span className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/85 via-black/25 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100 group-focus-visible:opacity-100">
        <span className="line-clamp-4 text-[11px] font-semibold leading-4 text-white">{caption}</span>
      </span>
    </button>
  )
}

function AssetThumb({ asset }: { asset: AssetRecord }) {
  if (asset.kind === "image" && asset.fileUrl) {
    return (
      <span className="block size-16 shrink-0 overflow-hidden rounded-[10px] bg-[#f1f1ed]">
        {/* eslint-disable-next-line @next/next/no-img-element -- User-created local assets are served from the local asset API. */}
        <img src={asset.fileUrl} alt={asset.name} className="h-full w-full object-cover" />
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
    setFilePreviewUrl(nextFile.type.startsWith("image/") ? URL.createObjectURL(nextFile) : "")
    setError("")
  }

  async function submit() {
    setSubmitting(true)
    setError("")
    try {
      const asset = await toast.promise(
        mode === "upload" ? uploadAsset() : generateAsset(),
        {
          loading: mode === "upload" ? "Uploading asset..." : "Generating asset...",
          success: "Asset created",
          error: (error) => getApiErrorMessage(error, "Failed to create asset"),
        },
      ).unwrap()
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
    const payload = await fetchJsonWithTimeout<{ asset?: AssetRecord }>("/api/assets/upload", {
      method: "POST",
      body: formData,
      timeoutMs: 30_000,
      toastOnError: false,
    })
    if (!payload.asset) {
      throw new Error("Failed to create asset")
    }
    return payload.asset
  }

  async function generateAsset() {
    if (!prompt.trim()) {
      throw new Error("Enter a prompt to generate an asset")
    }
    const payload = await fetchJsonWithTimeout<{ asset?: AssetRecord }>("/api/assets/generate", {
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
    })
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
                  mode === item ? "bg-white text-[#111827] shadow-sm" : "text-[#777] hover:bg-white/60"
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
                    <img src={filePreviewUrl} alt={file?.name ?? "Selected asset"} className="mx-auto h-28 w-28 rounded-[12px] object-cover shadow-sm" />
                    <span className="mt-3 block text-[13px] font-bold text-[#333]">{file?.name}</span>
                  </span>
                ) : (
                  <span>
                    <IconUpload className="mx-auto mb-3 size-8 text-[#9ca3af]" />
                    <span className="block text-[15px] font-bold text-[#333]">{file ? file.name : "Choose file"}</span>
                    <span className="mt-1 block text-[13px] font-semibold text-[#85857f]">Images, videos, audio, or text</span>
                  </span>
                )}
              </UploadDropzone>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-[13px] font-bold text-[#667085]">
                  Kind
                  <SelectControl className="mt-2 w-full" value={kind} onChange={(event) => setKind(event.target.value as AssetKind)}>
                    {(["image", "video", "audio", "text"] as AssetKind[]).map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </SelectControl>
                </label>
                <label className="block text-[13px] font-bold text-[#667085]">
                  Model
                  <SelectControl className="mt-2 w-full" value={model} onChange={(event) => setModel(event.target.value)}>
                    {characterGenerationModels.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </SelectControl>
                </label>
              </div>
              <label className="block text-[13px] font-bold text-[#667085]">
                Prompt
                <textarea
                  className="mt-2 h-28 w-full resize-none rounded-[12px] border border-[#dde1e7] p-3 text-[14px] font-semibold leading-6 outline-none"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Describe the asset to generate..."
                />
              </label>
            </div>
          )}

          {error && <div className="rounded-[10px] bg-[#fff0f0] p-3 text-[13px] font-semibold text-[#c63d4a]">{error}</div>}
        </div>

        <div className="flex justify-end gap-3 border-t border-[#eceff3] px-5 py-4">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="action"
            disabled={submitting || (mode === "upload" ? !file : !prompt.trim())}
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
            <h2 className="text-[22px] font-bold text-[#252525]">Final prompt debug</h2>
            <p className="mt-1 text-[13px] font-semibold text-[#85857f]">Prompt and attachments that will be sent to the image model.</p>
          </div>
          <button className="grid size-9 place-items-center rounded-[8px] text-[#667085] hover:bg-[#f4f4f2]" onClick={onClose} aria-label="Close prompt debug">
            <IconX className="size-5" />
          </button>
        </div>
        <div className="space-y-5 p-5">
          <div>
            <div className="text-[13px] font-bold uppercase tracking-wide text-[#9a9a93]">Prompt</div>
            <pre className="mt-2 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-[10px] bg-[#f7f7f3] p-4 text-[12px] font-semibold leading-5 text-[#333]">
              {prompt}
            </pre>
          </div>
        </div>
        <div data-testid="debug-attachments-bottom" className="border-t border-[#eceff3] px-5 py-4">
          <AttachmentSquareRow attachments={attachments} ariaLabel="Debug attachments" />
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

function AttachmentSquareRow({ attachments, ariaLabel }: { attachments: CharacterPromptAttachment[]; ariaLabel: string }) {
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
          <img src={attachment.url} alt={attachment.label} className="h-full w-full object-cover" />
        </a>
      ))}
    </div>
  )
}

function ReferenceImageModal({ onClose }: { onClose: () => void }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploads, setUploads] = useState<Array<{ id: string; name: string; url: string }>>([])

  function addFiles(files: FileList | null) {
    if (!files?.length) {
      return
    }

    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"))
    setUploads((current) => [
      ...current,
      ...imageFiles.map((file) => ({
        id: `${file.name}-${file.lastModified}-${file.size}`,
        name: file.name,
        url: URL.createObjectURL(file),
      })),
    ])
  }

  return (
    <AppModal className="z-[60] bg-[#24251f]/35" onClose={onClose}>
      <AppModalPanel className="max-w-[820px]">
        <AppModalHeader title="Add a reference image" closeLabel="Close reference image modal" onClose={onClose} />
        <div className={cn("min-h-[270px] p-6", uploads.length === 0 && "grid place-items-center")}>
          {uploads.length === 0 ? (
            <div className="text-[24px] font-semibold text-[#9ca3af]">No images yet for this character</div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {uploads.map((upload) => (
                <div key={upload.id} className="overflow-hidden rounded-[10px] border border-[#eceff3] bg-[#f7f7f4]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Blob previews from local file inputs cannot use Next image optimization. */}
                  <img src={upload.url} alt={upload.name} className="h-40 w-full object-cover" />
                  <div className="truncate px-3 py-2 text-[12px] font-semibold text-[#555]">{upload.name}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-[#eceff3] p-3">
          <UploadDropzone
            inputRef={fileInputRef}
            accept="image/*"
            multiple
            className="min-h-20"
            onFiles={addFiles}
          >
            <IconUpload className="size-8" />
            <span className="text-[15px] font-bold text-[#333]">Upload image</span>
          </UploadDropzone>
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

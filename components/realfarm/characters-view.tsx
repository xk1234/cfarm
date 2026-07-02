"use client"

import { useEffect, useRef, useState } from "react"
import { IconPhoto, IconPlus, IconSparkles, IconUpload, IconX } from "@tabler/icons-react"
import { Folder, Pencil, Trash2 } from "lucide-react"

import { CharacterCreateModal, CharacterModelPanel, NewCharacterModal } from "@/components/realfarm/character-create"
import { Button } from "@/components/ui/button"
import type { CharacterPayload, CharacterRecord } from "@/lib/characters"
import {
  characterGenerationModels,
  defaultCharacterPreviewUrl,
  formatCharacterValue,
  imageEditModels,
  upscaleModels,
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
        const response = await fetch("/api/characters", { cache: "no-store" })
        if (!response.ok) {
          throw new Error("Failed to load characters")
        }
        const data = (await response.json()) as { characters?: CharacterRecord[] }
        if (!active) {
          return
        }
        const loadedCharacters = data.characters ?? []
        setCharacters(loadedCharacters)
        setSelectedCharacterId((current) => current ?? loadedCharacters[0]?.id ?? null)
      } catch {
        if (active) {
          setCharacters([])
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
    const response = await fetch("/api/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      throw new Error("Failed to save character")
    }
    const data = (await response.json()) as { character: CharacterRecord }
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
    const response = await fetch(`/api/characters?id=${id}`, { method: "DELETE" })
    if (!response.ok) {
      throw new Error("Failed to delete character")
    }
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
              className="mt-6 w-full rounded-[12px] text-[17px] font-bold"
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
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [selectedModel, setSelectedModel] = useState(characterGenerationModels[0])
  const [generations, setGenerations] = useState<Array<{ id: string; prompt: string; model: string; createdAt: string }>>([])
  const [selectedGeneration, setSelectedGeneration] = useState<{ id: string; prompt: string; model: string; createdAt: string } | null>(null)
  const [nameEdit, setNameEdit] = useState({ id: selectedCharacter.id, draft: selectedCharacter.name, editing: false })
  const renamingName = nameEdit.id === selectedCharacter.id && nameEdit.editing
  const nameDraft = nameEdit.id === selectedCharacter.id ? nameEdit.draft : selectedCharacter.name

  async function commitNameEdit() {
    const nextName = nameDraft.trim()
    if (nextName && nextName !== selectedCharacter.name) {
      await onRename(selectedCharacter, nextName)
    }
    setNameEdit({ id: selectedCharacter.id, draft: nextName || selectedCharacter.name, editing: false })
  }

  return (
    <div className="grid min-h-[calc(100svh-72px)] overflow-hidden rounded-[8px] bg-[#f8f8f4] lg:grid-cols-[280px_1fr]">
      <aside className="bg-[#efefe9] px-2 py-4">
        <h1 className="px-3 text-[20px] font-bold text-[#111827]">AI Characters</h1>
        <Button variant="action" size="largeAction" className="mt-6 w-full rounded-[12px] text-[17px] font-bold" onClick={onNew}>
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

      <main className="relative min-h-[calc(100svh-72px)] bg-[#f8f8f4] px-7 py-6">
        <div className="flex items-start justify-between gap-4">
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
          <Button
            variant="outline"
            className="h-11 rounded-[12px] border-[#e3e3df] bg-white px-5 text-[16px] font-bold text-[#333] shadow-sm hover:bg-white"
            onClick={() => onEdit(selectedCharacter)}
          >
            <Pencil className="mr-2 size-4" />
            Edit character
          </Button>
        </div>

        <div className={cn("min-h-[52vh] pb-40 pt-10", generations.length === 0 && "grid place-items-center text-center")}>
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
                  className="overflow-hidden rounded-[14px] border border-[#e1e1dc] bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  onClick={() => setSelectedGeneration(generation)}
                >
                  <div className="grid aspect-[4/5] place-items-center bg-[#ecece8]">
                    <CharacterAvatar character={selectedCharacter} sizeClassName="size-20" />
                  </div>
                  <div className="p-3">
                    <div className="truncate text-[14px] font-bold text-[#252525]">{generation.model}</div>
                    <div className="mt-1 line-clamp-2 text-[12px] font-semibold leading-5 text-[#777]">{generation.prompt || "Character generation"}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <section className="absolute inset-x-8 bottom-6 mx-auto max-w-[760px] rounded-[16px] bg-white p-4 shadow-[0_18px_48px_rgba(0,0,0,0.14)]">
          <textarea
            className="h-20 w-full resize-none bg-transparent text-[16px] font-semibold leading-6 text-[#333] outline-none placeholder:text-[#a5adbb]"
            placeholder="Describe a scene, pose, outfit... or add Assets"
            aria-label="Edit AI UGC character prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="softControl" size="lg" className="rounded-[11px] px-4 text-[15px] font-bold text-[#333]" onClick={() => setAssetsOpen(true)}>
              <Folder className="mr-2 size-4" />
              Assets
            </Button>
            <Button
              variant="outline"
              className="grid h-10 w-10 place-items-center rounded-[10px] border-[#e3e3df] bg-white p-0 text-[#333]"
              aria-label="Add a reference image"
              onClick={() => setReferenceOpen(true)}
            >
              <IconPlus className="size-5" />
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <Button
                  variant="outline"
                  className="h-10 rounded-[11px] border-[#8d8d89] bg-[#eef0f5] px-4 text-[15px] font-bold text-[#3f3f3f] hover:bg-[#eef0f5]"
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
                className="rounded-[11px] px-5 text-[15px] font-bold"
                onClick={() => {
                  setGenerations((current) => [
                    {
                      id: `${Date.now()}`,
                      prompt: prompt.trim(),
                      model: selectedModel,
                      createdAt: new Date().toISOString(),
                    },
                    ...current,
                  ])
                }}
              >
                Generate
              </Button>
            </div>
          </div>
        </section>
      </main>
      {referenceOpen && <ReferenceImageModal onClose={() => setReferenceOpen(false)} />}
      {assetsOpen && <CharacterAssetsPanel onClose={() => setAssetsOpen(false)} />}
      {selectedGeneration && (
        <CharacterGenerationModal
          generation={selectedGeneration}
          onClose={() => setSelectedGeneration(null)}
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

function CharacterAssetsPanel({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<"outfits" | "accessories" | "background" | "products">("outfits")
  const tabs = ["outfits", "accessories", "background", "products"] as const

  return (
    <div className="fixed inset-y-0 right-0 z-[60] w-full max-w-[360px] border-l border-[#e4e4df] bg-white shadow-2xl">
      <div className="flex h-16 items-center justify-between border-b border-[#ededed] px-4">
        <h2 className="text-[20px] font-bold text-[#202020]">Assets</h2>
        <button className="grid size-9 place-items-center rounded-[8px] text-[#667085] hover:bg-[#f4f4f2]" onClick={onClose} aria-label="Close assets">
          <IconX className="size-5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 border-b border-[#ededed] p-3">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={cn(
              "h-10 rounded-[9px] text-[13px] font-bold capitalize text-[#666] hover:bg-[#f5f5f1]",
              activeTab === tab && "bg-[#111] text-white hover:bg-[#111]"
            )}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="grid h-[calc(100%-128px)] place-items-center p-6 text-center">
        <div>
          <Folder className="mx-auto size-10 text-[#b7bcc5]" strokeWidth={1.5} />
          <div className="mt-4 text-[16px] font-bold text-[#333]">No {activeTab} yet</div>
        </div>
      </div>
    </div>
  )
}

function CharacterGenerationModal({
  generation,
  onClose,
}: {
  generation: { id: string; prompt: string; model: string; createdAt: string }
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#24251f]/45 p-4">
      <section className="w-full max-w-[720px] overflow-hidden rounded-[14px] bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#eceff3] px-5 py-4">
          <div>
            <h2 className="text-[22px] font-bold text-[#252525]">Generation</h2>
            <p className="mt-1 text-[13px] font-semibold text-[#85857f]">{generation.model}</p>
          </div>
          <button className="grid size-9 place-items-center rounded-[8px] text-[#667085] hover:bg-[#f4f4f2]" onClick={onClose} aria-label="Close generation modal">
            <IconX className="size-5" />
          </button>
        </div>
        <div className="grid gap-5 p-5 md:grid-cols-[220px_1fr]">
          <div className="overflow-hidden rounded-[12px] border border-[#e4e4df] bg-[#f0f0ec]">
            <div className="grid aspect-[4/5] place-items-center">
              <IconPhoto className="size-12 text-[#a6abb3]" stroke={1.5} />
            </div>
          </div>
          <div className="space-y-5">
            <div>
              <div className="text-[13px] font-bold uppercase tracking-wide text-[#9a9a93]">Prompt</div>
              <p className="mt-2 rounded-[10px] bg-[#f7f7f3] p-3 text-[14px] font-semibold leading-6 text-[#333]">
                {generation.prompt || "Character generation"}
              </p>
            </div>
            <CharacterModelPanel
              title="Edit image"
              description="Choose an image edit model for this generation."
              models={imageEditModels}
            />
            <CharacterModelPanel
              title="Upscale"
              description="Choose an upscale model for this generation."
              models={upscaleModels}
            />
          </div>
        </div>
      </section>
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
    <div className="fixed inset-0 z-[60] grid place-items-center bg-[#24251f]/35 p-4">
      <section className="w-full max-w-[820px] overflow-hidden rounded-[8px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#eceff3] px-6 py-6">
          <h2 className="text-[30px] font-bold text-[#333]">Add a reference image</h2>
          <button className="grid size-10 place-items-center rounded-[8px] text-[#667085] hover:bg-[#f4f4f2]" onClick={onClose} aria-label="Close reference image modal">
            <IconX className="size-7" />
          </button>
        </div>
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
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              addFiles(event.target.files)
              event.target.value = ""
            }}
          />
          <button
            className="flex h-20 w-full items-center justify-center gap-4 rounded-[14px] border-2 border-[#e6e6e6] bg-white text-[26px] font-bold text-[#333] hover:bg-[#fafafa]"
            onClick={() => fileInputRef.current?.click()}
          >
            <IconUpload className="size-8" />
            Upload image
          </button>
        </div>
      </section>
    </div>
  )
}

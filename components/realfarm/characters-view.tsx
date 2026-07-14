"use client"

import { useEffect, useState } from "react"
import { IconPhoto, IconPlus } from "@tabler/icons-react"
import { toast } from "sonner"

import { CharactersView } from "@/components/realfarm/characters/characters-view"
import {
  CharacterCreateModal,
  NewCharacterModal,
} from "@/components/realfarm/character-create"
import { Button } from "@/components/ui/button"
import { CardGridSkeleton } from "@/components/ui/loading-skeleton"
import type { CharacterPayload, CharacterRecord } from "@/lib/characters"
import {
  fetchJsonWithTimeout,
  getApiErrorMessage,
  toastApiError,
} from "@/lib/client-api"

export function AvatarsView() {
  const [characterOpen, setCharacterOpen] = useState(false)
  const [editingCharacter, setEditingCharacter] =
    useState<CharacterRecord | null>(null)
  const [characters, setCharacters] = useState<CharacterRecord[]>([])
  const [charactersLoading, setCharactersLoading] = useState(true)
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
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
          toastApiError(error, "Failed to load characters")
        }
      } finally {
        if (active) {
          setCharactersLoading(false)
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

  async function deleteCharacterById(id: string) {
    await toast
      .promise(
        fetchJsonWithTimeout(`/api/characters/${encodeURIComponent(id)}`, {
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

  if (charactersLoading || !selectedCharacter) {
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
          <main
            className={
              charactersLoading
                ? "bg-[#f8f8f4] p-7"
                : "grid place-items-center bg-[#f8f8f4] text-center"
            }
          >
            {charactersLoading ? (
              <CardGridSkeleton count={6} className="xl:grid-cols-3" />
            ) : (
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
            )}
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

export { CharactersView } from "@/components/realfarm/characters/characters-view"

import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("CharactersView prompt debug layout", () => {
  it("keeps debug in the editor header and renders attachments as image squares", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "characters-view.tsx"), "utf8")
    const debugButtonIndex = source.indexOf('aria-label="Debug prompt"')
    const composerIndex = source.indexOf('aria-label="Edit AI UGC character prompt"')

    expect(debugButtonIndex).toBeGreaterThan(-1)
    expect(composerIndex).toBeGreaterThan(-1)
    expect(debugButtonIndex).toBeLessThan(composerIndex)
    expect(source).toContain("AttachmentSquareRow")
    expect(source).toContain('<img src={attachment.url} alt={attachment.label}')
    expect(source).toContain("debug-attachments-bottom")
    expect(source).not.toContain('className="inline-flex max-w-full items-center gap-2 rounded-full bg-[#eef0f5]')
  })

  it("opens presets in a visual modal and sends real image generation requests", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "characters-view.tsx"), "utf8")

    expect(source).toContain("PresetPickerModal")
    expect(source).toContain("PresetVisualThumb")
    expect(source).toContain("setPresetPickerOpen(true)")
    expect(source).toContain("characterImageAspectRatios")
    expect(source).toContain('aria-label="Image aspect ratio"')
    expect(source).toContain('fetchJsonWithTimeout<{ imageUrl?: string; generation?: CharacterImageGenerationRecord; error?: string }>("/api/characters/image"')
    expect(source).toContain('status: "processing"')
    expect(source).toContain('style={{ width: `${generation.progress}%` }}')
    expect(source).toContain('<img src={generation.imageUrl} alt={generation.prompt || "Generated character image"}')
    expect(source).not.toContain("presetMenuOpen")
  })

  it("reloads persisted character image generations for the selected character", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "characters-view.tsx"), "utf8")

    expect(source).toContain('fetchJsonWithTimeout<{ generations?: CharacterImageGenerationRecord[] }>(`/api/characters/images?characterId=${selectedCharacter.id}`')
    expect(source).toContain("setGenerations(payload.generations ?? [])")
    expect(source).toContain("characterId: selectedCharacter.id")
  })
})

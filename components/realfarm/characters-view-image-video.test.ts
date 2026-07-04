import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("CharactersView generated image workspace", () => {
  it("renders generated images as pure image tiles and opens an editor with a Video tab", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "characters-view.tsx"), "utf8")

    expect(source).toContain("CharacterImageEditorModal")
    expect(source).toContain('aria-label="Video generation prompt"')
    expect(source).toContain("characterImageToVideoModels")
    expect(source).toContain('fetchJsonWithTimeout<{ videoUrl?: string; taskId?: string; error?: string }>("/api/characters/video"')
    expect(source).toContain('className="group relative block overflow-hidden rounded-[10px] bg-transparent p-0"')
    expect(source).not.toContain('className="overflow-hidden rounded-[14px] border border-[#e1e1dc] bg-white text-left shadow-sm')
    expect(source).not.toContain('{generation.model} · {generation.aspectRatio}')
  })
})

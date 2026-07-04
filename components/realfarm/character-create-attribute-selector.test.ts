import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("CharacterCreateModal attribute controls", () => {
  it("turns the existing attribute summary cards into dropdown controls before regenerating the face", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "character-create.tsx"), "utf8")

    expect(source).toContain("CharacterAttributeCardControl")
    expect(source).toContain("updateCreateAttribute")
    expect(source).toContain("setCharacterFieldValue(current, key")
    expect(source).toContain("characterSummaryFields.map(([label, key]) => (")
    expect(source).toContain("field={key}")
    expect(source).toContain("onChange={updateCreateAttribute}")
    expect(source).toContain("characterAttributeOptions[field]?.length")
    expect(source).toContain("SelectControl")
    expect(source).toContain("<SelectControl")
    expect(source).toContain("value={selectedValue}")
    expect(source).toContain("onChange={(event) => onChange(field, event.target.value)}")
    expect(source).toContain("currentValueIsKnown")
    expect(source).not.toContain("aria-pressed={selected}")
    expect(source).not.toContain("<select")
    expect(source).toContain("Regenerate face")
    expect(source).toContain("regenerateFace")
    expect(source).toContain("generateHeadshot(cleanName, normalizeCharacterAttributes({ ...attributes, name: cleanName })")
    expect(source).not.toContain("<CharacterCreateAttributeSelector")
    expect(source).not.toContain("Edit attributes")
  })
})

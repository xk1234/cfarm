import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("Pinterest collection search alerts", () => {
  it("shows import/search failures through the floating toast alert layer", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "pinterest-collection-search.tsx"), "utf8")

    expect(source).toContain('import { toast } from "sonner"')
    expect(source).toContain("toast.error")
    expect(source).not.toContain('status === "error" &&')
  })

  it("keeps search, load more, and add-images loading states independent", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "pinterest-collection-search.tsx"), "utf8")

    expect(source).toContain('const [searchStatus, setSearchStatus] = useState<"idle" | "searching" | "loadingMore">("idle")')
    expect(source).toContain('const [creatingCollection, setCreatingCollection] = useState(false)')
    expect(source).toContain('const loadingMore = searchStatus === "loadingMore"')
    expect(source).toContain('const searching = searchStatus === "searching"')
    expect(source).toContain('const searchBusy = searchStatus !== "idle"')
    expect(source).toContain('disabled={!canCreate || creatingCollection}')
    expect(source).toContain('{creatingCollection ? (autoCaption ? "Captioning..." : "Adding...") : `Add ${selectedResults.length} images`}')
    expect(source).toContain('timeoutMs: 180_000')
    expect(source).not.toContain('const [status, setStatus]')
    expect(source).not.toContain('disabled={!canCreate || status === "loading"}')
  })

  it("imports selected remote images before saving a collection", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "pinterest-collection-search.tsx"), "utf8")

    expect(source).toContain('"/api/image-collections/import"')
    expect(source).toContain("collectionCreatedAt")
    expect(source).toContain("storedToCollection(payload.collection)")
    expect(source).not.toContain("images: selectedResults,")
  })
})

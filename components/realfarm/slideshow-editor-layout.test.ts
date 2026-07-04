import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("slideshow editor layout", () => {
  it("auto-selects a user automation while keeping the preview editor mounted", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "components",
        "realfarm",
        "slideshow-editor.tsx"
      ),
      "utf8"
    )

    expect(source).toContain(
      'const needsAutomationSelection = editorMode === "new" && !selectedAutomation'
    )
    expect(source).toContain("applyFormat(0)")
    expect(source).not.toContain(
      '{editorMode === "new" && !selectedAutomation ? ('
    )
    expect(source).toContain("grid overflow-hidden")
    expect(source).toContain("Preview Editor")
    expect(source.indexOf("needsAutomationSelection ? (")).toBeLessThan(
      source.indexOf("Preview Editor")
    )
  })

  it("renders automation run slides when generating from a selected automation", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "components",
        "realfarm",
        "slideshow-editor.tsx"
      ),
      "utf8"
    )

    expect(source).toContain("generateSelectedAutomationSlideshow")
    expect(source).toContain('"/api/automations/run"')
    expect(source).toContain("automationRunToPreviewSlides")
    expect(source).toContain("plan?.slides")
    expect(source).toContain("force: true")
    expect(source).toContain("flushSync")
    expect(source).toContain("await nextAnimationFrame()")
    expect(source).toContain("remainingLoadingMs")
    expect(source).toContain("aria-busy={generatingSlideshow}")
  })

  it("uses a selected user automation for previews and generation without inline format controls", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "components",
        "realfarm",
        "slideshow-editor.tsx"
      ),
      "utf8"
    )
    const workspaceSource = readFileSync(
      path.join(process.cwd(), "components", "realfarm-workspace.tsx"),
      "utf8"
    )
    const editorViewSource = workspaceSource.slice(
      workspaceSource.indexOf("<EditorView"),
      workspaceSource.indexOf('view === "collections"')
    )

    expect(source).toContain("automationConfigs")
    expect(source).toContain("selectedAutomationConfig")
    expect(source).toContain("linkedCollectionImages")
    expect(source).toContain(
      "schemaWithSelectedHook(selectedAutomationConfig, selectedHook)"
    )
    expect(source).toContain("moveHook")
    expect(source).toContain("AutomationSelectorCard")
    expect(source).toContain("Your automation")
    expect(editorViewSource).toContain("automations={automations}")
    expect(editorViewSource).toContain(
      "automationConfigs={automationConfigEdits}"
    )
    expect(editorViewSource).toContain(
      "recentRunsByAutomationId={recentRunsByAutomationId}"
    )
    expect(editorViewSource).not.toContain("automations={templateAutomations}")
    expect(editorViewSource).not.toContain(
      "automationConfigs={templateConfigEdits}"
    )
    expect(source).not.toContain("SlideshowTemplateControls")
    expect(source).not.toContain("Text direction")
    expect(source).not.toContain('title="Slideshow Format"')
  })

  it("derives new-mode hooks from the selected automation instead of placeholder hooks", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "components",
        "realfarm",
        "slideshow-editor.tsx"
      ),
      "utf8"
    )

    expect(source).toContain("initialSelectedAutomation")
    expect(source).toContain("initialSelectedHook")
    expect(source).toContain("automationHookOptions")
    expect(source).toContain("automationStoredHooks(config)")
    expect(source).toContain('aria-label="Edit selected hook"')
    expect(source).toContain("updateSelectedHookText")
    expect(source).not.toContain("const hookOptions = [")
    expect(source).not.toContain("useState(hookOptions[")
  })

  it("opens an all-hooks modal that can generate hooks for the selected automation", () => {
    const editorSource = readFileSync(
      path.join(
        process.cwd(),
        "components",
        "realfarm",
        "slideshow-editor.tsx"
      ),
      "utf8"
    )
    const previewSource = readFileSync(
      path.join(
        process.cwd(),
        "components",
        "realfarm",
        "slideshow-preview.tsx"
      ),
      "utf8"
    )
    const routeSource = readFileSync(
      path.join(
        process.cwd(),
        "app",
        "api",
        "automations",
        "hooks",
        "route.ts"
      ),
      "utf8"
    )

    expect(editorSource).toContain("setHookOpen(true)")
    expect(editorSource).toContain("generateMoreHooks")
    expect(editorSource).toContain('"/api/automations/hooks"')
    expect(editorSource).toContain(
      "onAutomationConfigChange(selectedAutomation, nextSchema)"
    )
    expect(editorSource).toContain("onGenerate={generateMoreHooks}")
    expect(editorSource).toContain('"0/0"')
    expect(previewSource).toContain("10 new hooks")
    expect(previewSource).toContain("Generating hooks...")
    expect(previewSource).toContain("No hooks yet")
    expect(previewSource).toContain("canGenerateHooks")
    expect(routeSource).toContain("randomSample(")
    expect(routeSource).toContain("Math.min(10, currentHooks.length)")
    expect(routeSource).toContain("automationStoredHooks(record.schema)")
    expect(routeSource).toContain(
      "Add at least one hook before generating more"
    )
    expect(routeSource).toContain(
      "schemaWithAutomationHooks(record.schema, hooks)"
    )
  })

  it("uses one default placeholder without an automation and shared collection selector for prompt images", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "components",
        "realfarm",
        "slideshow-editor.tsx"
      ),
      "utf8"
    )
    const workspaceSource = readFileSync(
      path.join(process.cwd(), "components", "realfarm-workspace.tsx"),
      "utf8"
    )

    expect(source).toContain(
      'import { CollectionSelector } from "@/components/realfarm/collection-selector"'
    )
    expect(source).toContain("defaultPlaceholderPreviewSlide")
    expect(source).toContain("initialSelectedConfig")
    expect(source).toContain(
      ": [defaultPlaceholderPreviewSlide(data, initialSelectedHook)]"
    )
    expect(source).not.toContain(
      "data.defaultCollections.backgrounds.images.slice(0, 3).map"
    )
    expect(source).toContain("<CollectionSelector")
    expect(source).toContain("promptCollection")
    expect(source).toContain("onPromptCollectionChange")
    expect(source).toContain("onCreateCollection")
    expect(source).not.toContain("Community: Pinterest - NYC Lifestyle")
    expect(workspaceSource).toContain("onCreateCollection={(collection) => {")
  })

  it("separates exported slideshows from drafts with restricted actions", () => {
    const editorSource = readFileSync(
      path.join(
        process.cwd(),
        "components",
        "realfarm",
        "slideshow-editor.tsx"
      ),
      "utf8"
    )
    const previewSource = readFileSync(
      path.join(
        process.cwd(),
        "components",
        "realfarm",
        "slideshow-preview.tsx"
      ),
      "utf8"
    )

    expect(editorSource).toContain("onDelete={(id) => {")
    expect(editorSource).toContain("draftItems={draftSlideshowItems}")
    expect(editorSource).toContain("onDuplicateDraft")
    expect(editorSource).toContain("fetchJsonWithTimeout(")
    expect(editorSource).toContain(
      "`/api/slideshows?id=${encodeURIComponent(id)}`"
    )
    expect(editorSource).toContain('method: "DELETE"')
    expect(previewSource).toContain('actions: "exported" | "draft"')
    expect(previewSource).toContain("Download")
    expect(previewSource).toContain("Schedule")
    expect(previewSource).toContain("Duplicate")
    expect(previewSource).toContain("Delete")
    expect(previewSource).toContain("ScheduleSlideshowModal")
    expect(previewSource).toContain('sourceType: "slideshow"')
    expect(previewSource).toContain("onDelete?: (id: string) => void")
    expect(previewSource).not.toContain("Quick publish")
  })
})

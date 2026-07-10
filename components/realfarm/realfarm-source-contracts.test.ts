import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

function src(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8")
}

function readAutomationSettingsSource() {
  return [
    "components/realfarm/automation-settings.tsx",
    "components/realfarm/automation-settings/content-format-editor.tsx",
    "components/realfarm/automation-settings/drawer.tsx",
    "components/realfarm/automation-settings/format-helpers.ts",
    "components/realfarm/automation-settings/format-preview-card.tsx",
    "components/realfarm/automation-settings/format-text-toolbar.tsx",
    "components/realfarm/automation-settings/general-settings.tsx",
    "components/realfarm/automation-settings/generated-slideshow-frame.tsx",
    "components/realfarm/automation-settings/overview-panel.tsx",
    "components/realfarm/automation-settings/prompt-settings.tsx",
    "components/realfarm/automation-settings/run-helpers.ts",
    "components/realfarm/automation-settings/schedule-helpers.ts",
    "components/realfarm/automation-settings/schedule-settings.tsx",
    "components/realfarm/automation-settings/settings-layout.tsx",
    "components/realfarm/automation-settings/slideshow-format-panel.tsx",
    "components/realfarm/automation-settings/slideshow-format-preview-stage.tsx",
    "components/realfarm/automation-settings/social-platform-fields.tsx",
    "components/realfarm/automation-settings/social-settings-helpers.ts",
    "components/realfarm/automation-settings/social-settings.tsx",
    "components/realfarm/automation-settings/types.ts",
    "components/realfarm/automation-settings/video-format-panel.tsx",
    "components/realfarm/automation-settings/video-format-helpers.ts",
  ]
    .map(src)
    .join("\n")
}

function section(source: string, start: string, end: string) {
  return source.slice(
    source.indexOf(start),
    source.indexOf(end, source.indexOf(start))
  )
}

function expectContains(source: string, values: string[]) {
  for (const value of values) {
    expect(source).toContain(value)
  }
}

function expectNotContains(source: string, values: string[]) {
  for (const value of values) {
    expect(source).not.toContain(value)
  }
}

describe("RealFarm source contracts", () => {
  describe("workspace and navigation", () => {
    it("keeps the initial workspace layout and hides the creators tab", () => {
      const workspaceSource = src("components/realfarm-workspace.tsx")
      const navigationSource = src("components/realfarm/navigation.tsx")

      expectContains(workspaceSource, [
        'const [view, setView] = useState<ViewKey>("home")',
        "const initialHash = window.location.hash",
        "let ignoredInitialHashChange = false",
        "window.location.hash === initialHash",
        'window.addEventListener("hashchange", syncSwipeHashView)',
        'className="h-svh overflow-hidden bg-[#f6f6f2] text-[#242421]"',
        'className="flex h-svh"',
        '"min-w-0 flex-1 overflow-y-auto"',
        '"px-5 py-5 lg:px-7"',
      ])
      expectContains(navigationSource, [
        "hidden h-svh w-[214px] shrink-0 overflow-y-auto",
      ])
      expectNotContains(workspaceSource, [
        "\n    syncSwipeHashView()\n",
        "CreatorsView",
        'view === "creators"',
      ])
      expectNotContains(navigationSource, ['"creators"', 'label: "Creators"'])
      expectNotContains(workspaceSource, [
        'view === "editor"',
        "EditorView",
        "slideshow-editor",
        'setView("editor")',
      ])
      expectNotContains(navigationSource, [
        '"editor"',
        "Slideshow Editor",
        "IconWand",
      ])
      expectNotContains(workspaceSource, [
        'view === "ugcads"',
        "UGCAdsView",
        "ugc-ads-view",
      ])
      expectNotContains(navigationSource, [
        '"ugcads"',
        "AI UGC ads",
        "IconMovie",
      ])
    })

    it("moves AI UGC ad creation into video automation settings", () => {
      const automationSettingsSource = readAutomationSettingsSource()
      const videoPanelSource = section(
        automationSettingsSource,
        "function VideoAutomationFormatPanel",
        "function textPlacementFromItem"
      )
      const rendererSource = src(
        "components/realfarm/generated-video-renderer.ts"
      )
      const realfarmDataSource = src("lib/realfarm-data.ts")

      expectContains(automationSettingsSource, [
        "renderAndUploadUgcAdVideo",
        "GeneratedVideoExports",
        "useGeneratedVideoExports(",
        '"ugc_ad"',
        "createGeneratedVideoExportRecord",
        "updateGeneratedVideoExportRecord",
        "Avatar video collection",
        "Demo video",
        "createUgcAdAutomationExport",
      ])
      expectContains(realfarmDataSource, [
        "demoVideos: LocalAsset[]",
        "demoVideos: listLocalAssets(",
        '"assets/demos"',
      ])
      expectContains(videoPanelSource, [
        "demoVideos: LocalAsset[]",
        "selectedDemoVideoId",
        "const activeDemoVideo =",
        "demoVideos.find((video) => video.id === selectedDemoVideoId)",
        "VideoAutomationPreviewText",
        "AutomationFormatTextToolbar",
        "addVideoTextItem",
        "selectedVideoTextIndex",
        "updateVideoTextItem",
        "deleteSelectedVideoTextItem",
        "textItems: hookTextItems",
      ])
      expectContains(rendererSource, [
        "type UGCAdTextItem",
        "textItems?: UGCAdTextItem[]",
        "drawUgcAdTextItems(",
        "drawUgcAdTextItem(",
      ])
      expectNotContains(videoPanelSource, [
        'schemaWithAutomationCollectionId(config, "hook"',
        "selectedDemoCollection",
        "updateDemoCollection",
        "VideoAutomationTextCard",
        "Demo video collection",
      ])
    })

    it("loads generated videos and quick-start templates from live props", () => {
      const homeSource = src("components/realfarm/home-view.tsx")

      expectContains(homeSource, [
        "fetchJsonWithTimeout<{",
        "exports?: GeneratedVideoExport[]",
        '}>("/api/generated-videos"',
        "void loadGeneratedVideos()",
        "Quick start",
        "templates: Automation[]",
        "quickStartTemplates",
        "QUICK_START_ITEMS_PER_PAGE = 6",
        "quickStartPage",
        "pagedQuickStartTemplates",
        "generatedRunsByAutomationId",
        "generatedHomeSlideshowCards",
        "Slideshows ({generatedSlideshowCards.length})",
        "GeneratedSlideshowCard",
        "No generated slideshows yet. Run a slideshow automation",
        'aria-label="Previous quick start page"',
        'aria-label="Next quick start page"',
        "QuickStartTemplateCard",
        "onUseTemplate(automation)",
        "No templates available",
      ])
      expectNotContains(homeSource, [
        'if (activeTab !== "videos") return',
        "Slideshows (0)",
        "templates.slice(0, 6)",
        "Start automating this format",
      ])
    })
  })

  describe("shared selectors and collections", () => {
    it("uses the standard collection selector and keeps Pinterest import states independent", () => {
      const selectorSource = src("components/realfarm/collection-selector.tsx")
      const closedSelectorSource = selectorSource.slice(
        selectorSource.indexOf("return ("),
        selectorSource.indexOf("{open &&")
      )
      const pinterestSource = src(
        "components/realfarm/pinterest-collection-search.tsx"
      )
      const automationSettingsSource = readAutomationSettingsSource()

      expectContains(selectorSource, [
        "export function CollectionSelector",
        "PinterestCollectionSearch",
        "showPinterestSearch",
        "showPictures = true",
        "onCreateCollection",
        "Select collection",
        "Search collections",
        "Add collection",
      ])
      expectContains(selectorSource, [
        "showPictures ?",
        "showPictures={showPictures}",
      ])
      expectContains(closedSelectorSource, [
        "ChevronRight",
        "onClick={() => setOpen(true)}",
      ])
      expectNotContains(selectorSource, ["Community", "My Collections"])
      expectNotContains(closedSelectorSource, [
        "<Button",
        "setShowPinterestSearch(true)",
      ])
      expectContains(automationSettingsSource, [
        'import { CollectionSelector } from "@/components/realfarm/collection-selector"',
        "<CollectionSelector",
        "onCreateCollection={onCreateCollection}",
      ])
      expectNotContains(automationSettingsSource, [
        "function AutomationCollectionPicker",
        "<AutomationCollectionPicker",
      ])
      expectContains(pinterestSource, [
        'import { toast } from "sonner"',
        "toast.error",
        'const [searchStatus, setSearchStatus] = useState<"idle" | "searching" | "loadingMore">("idle")',
        "const [creatingCollection, setCreatingCollection] = useState(false)",
        'const loadingMore = searchStatus === "loadingMore"',
        'const searching = searchStatus === "searching"',
        'const searchBusy = searchStatus !== "idle"',
        "disabled={!canCreate || creatingCollection}",
        '{creatingCollection ? (autoCaption ? "Captioning..." : "Adding...") : `Add ${selectedResults.length} images`}',
        "timeoutMs: 180_000",
        '"/api/image-collections/import"',
        "collectionCreatedAt",
        "storedToCollection(payload.collection)",
      ])
      expectNotContains(pinterestSource, [
        'status === "error" &&',
        "const [status, setStatus]",
        'disabled={!canCreate || status === "loading"}',
        "images: selectedResults,",
      ])
    })

    it("keeps collection detail loading and image actions on the expected UI", () => {
      const collectionsSource = src("components/realfarm/collections-view.tsx")
      const imageViewerSource = src(
        "components/realfarm/image-viewer-modal.tsx"
      )
      const imageActionBlock = section(
        imageViewerSource,
        "async function runImageAction()",
        "return ("
      )

      expectContains(collectionsSource, [
        "const INITIAL_VISIBLE_ROWS = 3",
        "const LOAD_MORE_ROWS = 3",
        "visibleRows * columns",
        "setVisibleRows((current) => current + LOAD_MORE_ROWS)",
        "Load more",
        "Columns:",
      ])
      expectNotContains(collectionsSource, ["imagesPerPage", "Images per page"])
      expectContains(imageViewerSource, [
        'import { toast } from "sonner"',
        'import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"',
        "function CollectionImageActionEditor",
        "<CollectionImageActionEditor",
        "Image action model",
        'disabled={working || (activeTool === "edit" && !prompt.trim())}',
      ])
      expectContains(imageActionBlock, [
        "fetchJsonWithTimeout",
        "toast.error",
        "getApiErrorMessage",
      ])
      expectNotContains(imageViewerSource, ["absolute right-8 top-7 z-10"])
    })

    it("lets greenscreen use the shared collection selector without collection pictures", () => {
      const greenscreenSource = src("components/realfarm/greenscreen-view.tsx")

      expectContains(greenscreenSource, [
        'import { CollectionSelector } from "@/components/realfarm/collection-selector"',
        "<CollectionSelector",
        "showPictures={false}",
      ])
    })
  })

  describe("automation settings and automations grid", () => {
    it("keeps settings tabs, controls, and backing schema fields wired", () => {
      const source = readAutomationSettingsSource()
      const settingsSource = section(
        source,
        "function AutomationGeneralSettingsPanel",
        "function SettingsPage"
      )

      expect(source).toContain("type AutomationDrawerTab =")
      expectContains(source, [
        '"overview"',
        '"format"',
        '"hooks"',
        '"schedule"',
        '"tiktok"',
        '"settings"',
        'active={activeTab === "tiktok"}',
        'onClick={() => setActiveTab("tiktok")}',
        'active={activeTab === "settings"}',
        'onClick={() => setActiveTab("settings")}',
        'activeTab === "tiktok"',
        'activeTab === "settings"',
        "AutomationGeneralSettingsPanel",
        'SettingsPage title="Settings"',
        "New Slide Editor",
        "SelectControl",
        "SwitchPillButton",
        "SettingsRow",
        "PromptTextarea",
        'title="Posting times"',
        "defaultPostingTime",
        "Add posting time",
        "toggleDay",
        "updateTime",
        "removePostingTime",
        'type="time"',
      ])
      expectContains(settingsSource, [
        "config.image_collection_ids.language",
        "updateLanguage",
        "SoundSelector",
        "updateTransitionStyle",
        "updateSlideDuration",
        "updateSelectedSound",
        "slideshow_transition_style",
        "slideshow_slide_duration",
        "slideshow_sound_id",
        "slideshow_sound_name",
        "slideshow_sound_url",
      ])
      expectContains(source, [
        "draftConfig",
        "setDraftConfig",
        "saveConfigChanges",
        "cancelConfigChanges",
        "cloneAutomationSchema",
        "SettingsFooter",
        "onConfigChange(",
        "social_integrations: config.social_integrations",
        "onConfigChange={setDraftConfig}",
        "onSave={saveConfigChanges}",
        "onCancel={cancelConfigChanges}",
      ])
      expectContains(source, [
        "selectedSound: LocalAsset | null",
        "music: LocalAsset[]",
      ])
      expectContains(settingsSource, [
        "automationLanguageOptions",
        "slideshowTransitionOptions",
        "slideshowDurationOptions",
        "randomTikTokSoundLabel",
      ])
      expectNotContains(settingsSource, [
        "French",
        "German",
        "Italian",
        "Portuguese",
      ])
    })

    it("uses real collection data in automation format previews and compact controls", () => {
      const source = readAutomationSettingsSource()
      const sharedSource = src("components/realfarm/shared-media.tsx")
      const toolbarSource = section(
        source,
        "function AutomationFormatTextToolbar",
        "function TikTokSettingsPanel"
      )
      const ctaSource = section(
        source,
        "function AutomationCtaFormatEditor",
        "function AutomationFormatPreviewCard"
      )

      expectContains(source, [
        "collections: CreatedImageCollection[]",
        "formatCollection(config, collections, activeKey)",
        "buildFormatPreviewItems(config, collections)",
        "CollectionSelector",
        "updateImageCollectionId",
        "formatCollection(config, collections, role)",
        "formatPreviewText(config, role, index)",
        "formatPreviewCardSize(item.section.aspect_ratio",
        "formatAspectRatioCss(",
        "renderedSlideSvg",
        "previewSlideshowSlide",
        "previewSlideshowTextItems",
        "dangerouslySetInnerHTML",
        "PinterestPreviewTile",
      ])
      expectNotContains(source, [
        "collections.find((collection) => collection.images.length > 0)?.images",
        'Array.from({ length: activeTab === "CTA" ? 8 : 6 })',
        "text-[11px] leading-tight font-bold text-yellow-100",
        "Motivational Screencaps",
        "Pinterest - space",
        "Nisi ut aliquip",
        "Incididunt ut labore",
        "Not published",
      ])
      expect(sharedSource).not.toContain("Not published")
      expectContains(toolbarSource, [
        "border-t border-[#E5E7EB]",
        "bg-[#F5F5F5]",
        "rounded-xl",
        "space-y-2.5",
        "Font",
        "Style",
        "Size",
        "Position",
        "Width",
        "updateTextItem",
        "Word length",
        "Alignment",
        "Top/Bottom Padding",
        "Content direction",
        "<textarea",
        "Add text",
        "AlignCenter",
        "MapPin",
      ])
      expectNotContains(toolbarSource, [">Advanced<", "ChevronUp"])
      expectContains(source, [
        "AutomationContentFormatEditor",
        "updateSectionOverlayImage",
        "updateSectionOverlayPadding",
        "updateContentSlideOverride",
        "updateContentImageOverride",
        "ContentOverlayImagePicker",
        "Slide overrides",
        "Image overrides",
        "Override content direction for a specific slide",
        "Override the image collection for a specific slide",
        "overlayImage?.padding",
        "slideOverrides",
        "imageOverrides",
      ])
      expectContains(ctaSource, [
        "Enable CTA",
        "Slide Placement",
        "Collection or Image",
        "Single image",
        "CTA collection",
        "Aspect Ratio",
        "Image Grid",
        "Overlay Image",
        "Display text",
        "CtaSingleImagePicker",
      ])
      expectContains(source, [
        "function updateCtaEnabled",
        "function updateCtaPlacement",
        "function updateCtaImageMode",
        "function updateCtaSingleImage",
        "ctaEnabled(config, cta)",
      ])
      expectNotContains(source, [
        'activeSection.ctaLocation !== "static" ? "bg-app-action"',
      ])
    })

    it("wires automation grid actions, delete, and generation through persisted APIs", () => {
      const settingsSource = readAutomationSettingsSource()
      const automationsSource = src("components/realfarm/automations-view.tsx")
      const workspaceSource = src("components/realfarm-workspace.tsx")

      expectContains(settingsSource, [
        "onDelete",
        "Delete automation",
        "async function generateAutomation()",
        '"/api/automations/run"',
        "automationId: automation.id",
        "schema: draftConfig",
        "flushSync",
        "remainingLoadingMs",
        "setRecentRuns",
        "AutomationRecentRunCard",
        "AutomationGeneratedSlideshowViewer",
        "runScheduleDurationLine",
        "renderedSlides",
        "ratioToCss(activeSlideRecord?.aspectRatio)",
        "absolute top-1/2 left-2",
        "absolute top-1/2 right-2",
        "AutomationRunDetail",
        "No generated slideshows yet.",
      ])
      expectContains(workspaceSource, [
        "fetchJsonWithTimeout(`/api/automations?id=${encodeURIComponent(id)}`",
        'method: "DELETE"',
        "/api/automations/runs?limit=100",
        "toggleAutomationStatus",
        "status: nextStatus",
      ])
      expectContains(automationsSource, [
        "recentRunsByAutomationId",
        "No recent generation",
        "text-center",
        "backgroundImage: `url(${imageUrl})`",
        "onToggleStatus",
        "Resume",
        "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3",
        "col-span-full",
        "AutomationGridCard",
      ])
      expectNotContains(settingsSource, [
        "4 uncomfortable but healthy relationship questions",
      ])
      expectNotContains(automationsSource, [
        "IconFilter",
        ">Filter<",
        "AutomationThumb",
        "AutomationListItem",
        "space-y-3",
        "md:grid-cols-[172px_1fr_auto]",
        "Create New",
      ])
    })

    it("renders automation settings inline on the automations page instead of a modal overlay", () => {
      const settingsSource = readAutomationSettingsSource()
      const workspaceSource = src("components/realfarm-workspace.tsx")
      const automationViewBranch = section(
        workspaceSource,
        '{view === "automations" &&',
        "</section>"
      )
      const settingsShell = section(
        settingsSource,
        "export function AutomationSettingsDrawer",
        "function DrawerNavButton"
      )
      const settingsOuterClass = section(
        settingsShell,
        "className={cn(",
        ")}\n    >"
      )

      expectContains(automationViewBranch, [
        "editingAutomation ? (",
        "<AutomationSettingsDrawer",
        "onClose={() => setEditingAutomation(null)}",
        ") : (",
        "<AutomationsView",
      ])
      expectContains(workspaceSource, [
        'const fillsWorkspace = view === "automations" && Boolean(editingAutomation)',
        'fillsWorkspace ? "p-0" : "px-5 py-5 lg:px-7"',
      ])
      expectContains(settingsShell, [
        "min-h-svh",
        "md:grid-cols-[246px_1fr]",
        'aria-label="Back to automations"',
      ])
      expectNotContains(settingsShell, ["<AppModal", "<AppModalPanel"])
      expectNotContains(settingsOuterClass, [
        "shadow-2xl",
        "rounded-[8px]",
        "border border-[#e1e0d8]",
        "shadow-sm",
        "h-[min(720px,90vh)]",
        "min-h-[calc(100svh-40px)]",
      ])
    })

    it("uses a multi-provider PostFast social account picker for automation destinations", () => {
      const settingsSource = readAutomationSettingsSource()
      const automationsSource = src("components/realfarm/automations-view.tsx")
      const pickerSource = src("components/realfarm/social-account-picker.tsx")
      const workspaceSource = src("components/realfarm-workspace.tsx")
      const schemaSource = src("lib/realfarm-automation.ts")

      expectContains(schemaSource, [
        "social_integrations: AutomationSocialIntegration[]",
        "normalizeAutomationSocialIntegrations",
      ])
      expectNotContains(schemaSource, ["tiktok_account_id: string | null"])
      expectContains(pickerSource, [
        "SocialAccountPickerModal",
        "/api/postfast/integrations",
        '"tiktok"',
        '"youtube"',
        '"instagram"',
        '"facebook"',
        '"x"',
        "Available accounts",
        "Selected to run",
        "AccountTile",
        "selectedIntegrationGrid",
      ])
      expectNotContains(pickerSource, ["providerIntegrations"])
      expectContains(automationsSource, [
        "socialIntegrations",
        "onEditSocialAccounts",
        "Add social account",
      ])
      expectContains(settingsSource, [
        "Social destinations",
        "onEditSocialAccounts",
      ])
      expectContains(workspaceSource, [
        "socialAccountAutomation",
        "onSocialIntegrationsChange",
        "SocialAccountPickerModal",
      ])
    })

    it("renders TikTok sounds as a full-row clickable picker", () => {
      const settingsSource = readAutomationSettingsSource()
      const creatorSource = src("components/realfarm/creator-ui.tsx")

      expectContains(settingsSource, [
        'variant="settingsSound"',
        "emptyLabel={randomTikTokSoundLabel}",
      ])
      expectContains(creatorSource, [
        'variant?: "default" | "ugc" | "sound" | "settingsSound"',
        'variant === "settingsSound"',
        "TikTok Sounds",
        "All sounds - a random song will be selected",
        "onClick={() => setOpen(true)}",
      ])
      expectNotContains(settingsSource, [
        "mt-6 flex w-full items-center justify-between rounded-[8px] border border-[#ecebe4] bg-white p-5 text-left",
      ])
    })
  })

  describe("automation and template data sources", () => {
    it("uses persisted automation templates instead of hardcoded seeds", () => {
      const workspaceSource = src("components/realfarm-workspace.tsx")
      const templatesSource = src("components/realfarm/templates.tsx")
      const homeSource = src("components/realfarm/home-view.tsx")
      const previewSource = src(
        "components/realfarm/template-showcase-preview.tsx"
      )
      const exampleModalSource = src(
        "components/realfarm/example-slideshow-modal.tsx"
      )
      const slideshowViewerSource = src(
        "components/realfarm/slideshow-viewer-modal.tsx"
      )

      expectContains(workspaceSource, [
        "initialTemplateData",
        "initialTemplateData.templates",
        "initialTemplateData.exampleRunsByTemplateId",
        "initialTemplateData.schemas",
        "templates={templateAutomations}",
        "createLocalAutomation",
        '"/api/automation-templates"',
        '"/api/automations"',
        "exampleRunsByTemplateId",
        "showcaseRunsByAutomationId",
        "recentRunsByAutomationId={showcaseRunsByAutomationId}",
        "generatedRunsByAutomationId={recentRunsByAutomationId}",
      ])
      expectContains(templatesSource, [
        "templates: templateAutomations",
        "return templateAutomations",
        "TemplateGeneratedPreview",
        "exampleSlides={generatedExampleSlides",
        "ExampleSlideshowModal",
        "View ${automation.name} examples",
        'useState<TemplateKindFilter>("slideshow")',
        "templateKind(automation) === selectedKind",
        "setSelectedKind(kind)",
        "onClick={() => onCreateBlank(selectedKind)}",
        "New {selectedKindLabel.toLowerCase()} automation",
        "No templates available",
        "No matching ${selectedKindLabel.toLowerCase()} templates",
        "opacity-0",
        "group-hover:opacity-100",
      ])
      expectNotContains(templatesSource, [
        'onCreateBlank("slideshow")',
        'onCreateBlank("video")',
      ])
      expectContains(homeSource, ["ExampleSlideshowModal", "onOpenSlideshow"])
      expectContains(previewSource, [
        "No example slideshow yet",
        "slide.text",
        'slide.section !== "hook"',
        "slide.imageUrl",
        "run.renderedSlides?.length",
        "slide.sourceImageUrl",
      ])
      expectContains(exampleModalSource, [
        "generatedExampleSlideshows",
        "SlideshowViewerModal",
        "initialSlideshowId",
      ])
      expectContains(slideshowViewerSource, [
        "CheckedDropdownButton",
        "selectedSlideshowLabel",
        "boundedActiveSlide - 1",
        "boundedActiveSlide + 1",
        "onSelectSlideshow(nextIndex)",
        "initialSlideshowId",
        'aria-hidden="true"',
        'slide.section !== "hook"',
      ])
      expectNotContains(workspaceSource, ["templates={data.automations}"])
      expectNotContains(templatesSource, [
        "return data.automations",
        "templateImages(automation",
        "high-level skills to acquire in your 20s",
        "featured={index === 0}",
        'featured ? "opacity-100"',
      ])
    })
  })

  describe("standalone slideshow editor removal", () => {
    it("does not leave editor-only source files or data shapes behind", () => {
      const workspaceSource = src("components/realfarm-workspace.tsx")
      const navigationSource = src("components/realfarm/navigation.tsx")
      const realfarmDataSource = src("lib/realfarm-data.ts")
      const dataSource = src("data/realfarm.json")

      expectNotContains(workspaceSource, [
        "slideshow-editor",
        "EditorView",
        'view === "editor"',
        'setView("editor")',
      ])
      expectNotContains(navigationSource, [
        '"editor"',
        "Slideshow Editor",
        "IconWand",
      ])
      expectNotContains(realfarmDataSource, ["EditorSlide", '"editor"'])
      expectNotContains(dataSource, ['"editor"'])
      expect(() => src("components/realfarm/slideshow-editor.tsx")).toThrow()
      expect(() => src("components/realfarm/slideshow-preview.tsx")).toThrow()
      expect(() =>
        src("components/realfarm/slideshow-format-modal.tsx")
      ).toThrow()
    })
  })

  describe("calendar and analytics", () => {
    it("uses stable PostFast fetch dependencies and AG Grid metric rows", () => {
      const source = src("components/realfarm/calendar-analytics.tsx")
      const fetchStart = source.indexOf(
        "void fetchJsonWithTimeout<{\n      posts?: { posts?: PostFastListedPost[] }\n      configured?: boolean\n    }>(monthRangeKey)"
      )
      const fetchBlock = source.slice(
        fetchStart,
        source.indexOf("\n\n  return (", fetchStart)
      )

      expectContains(source, [
        "monthRangeKey",
        "AgGridReact<AnalyticsMetricRow>",
        "analyticsRows",
        "analyticsMetricRow",
      ])
      expect(fetchBlock).toContain("}, [monthRangeKey])")
      expect(fetchBlock).not.toContain("[monthDate, monthEnd]")
      expectNotContains(source, [
        '["Account", "Views", "Likes", "Comments", "Shares", "Engagement Rate", "Created"]',
        "grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1.2fr_1fr]",
        ">Table</Button>",
        ">Grid</Button>",
      ])
    })
  })

  describe("characters", () => {
    it("keeps character creation attributes and headshot loading wired", () => {
      const source = src("components/realfarm/character-create.tsx")
      const loadingTextIndex = source.indexOf("Generating headshot...")
      const separateBelowPortraitIndex = source.indexOf(
        "mt-3 rounded-[10px] bg-white px-3 py-2 text-center text-[13px] font-bold text-[#555] shadow-sm"
      )
      const portraitContainerIndex = source.indexOf(
        '<div className="relative w-fit">'
      )

      expectContains(source, [
        "CharacterAttributeCardControl",
        "updateCreateAttribute",
        "setCharacterFieldValue(current, key",
        "characterSummaryFields.map(([label, key]) => (",
        "field={key}",
        "onChange={updateCreateAttribute}",
        "characterAttributeOptions[field]?.length",
        "SelectControl",
        "<SelectControl",
        "value={selectedValue}",
        "onChange={(event) => onChange(field, event.target.value)}",
        "currentValueIsKnown",
        "Regenerate face",
        "regenerateFace",
        "generateHeadshot(cleanName, normalizeCharacterAttributes({ ...attributes, name: cleanName })",
        "absolute inset-0",
      ])
      expect(loadingTextIndex).toBeGreaterThan(portraitContainerIndex)
      expect(separateBelowPortraitIndex).toBe(-1)
      expectNotContains(source, [
        "aria-pressed={selected}",
        "<select",
        "<CharacterCreateAttributeSelector",
        "Edit attributes",
      ])
    })

    it("keeps character assets, generated images, and fixed editor layout in place", () => {
      const source = src("components/realfarm/characters/characters-view.tsx")
      const modalsSource = src("components/realfarm/characters/modals.tsx")
      const sharedSource = src(
        "components/realfarm/characters/shared-components.tsx"
      )
      const gridSource = section(
        modalsSource,
        "function AssetImageTile",
        "function AssetThumb"
      )
      const debugButtonIndex = source.indexOf('aria-label="Debug prompt"')
      const composerIndex = source.indexOf(
        'aria-label="Edit AI UGC character prompt"'
      )

      expectContains(source, [
        "PromptInputRow",
        "characterImageAspectRatios",
        'aria-label="Image aspect ratio"',
        "fetchJsonWithTimeout<{",
        "imageUrl?: string",
        "generation?: CharacterImageGenerationRecord",
        '"/api/characters/image"',
        'status: "processing"',
        "setPreviewGeneration(generation)",
        'aria-label="Use as source image"',
        "setSelectedGeneration(generation)",
        "generations?: CharacterImageGenerationRecord[]",
        "`/api/characters/images?characterId=${selectedCharacter.id}`",
        "setGenerations(payload.generations ?? [])",
        "characterId: input.selectedCharacter.id",
        'className="relative h-[calc(100svh-72px)] overflow-hidden bg-app-surface-subtle px-7 py-6"',
        '"absolute inset-x-0 top-[104px] bottom-0 overflow-y-auto px-7 pt-8 pb-64"',
        'className="absolute inset-x-8 bottom-6 z-30 mx-auto max-w-[760px] overflow-hidden rounded-2xl border border-app-panel-border bg-app-surface shadow-[0_12px_32px_rgba(30,30,25,0.12)]"',
        "videoUrl?: string",
        "group relative block overflow-hidden rounded-[10px] bg-transparent p-0",
      ])
      expect(debugButtonIndex).toBeGreaterThan(-1)
      expect(composerIndex).toBeGreaterThan(-1)
      expect(debugButtonIndex).toBeLessThan(composerIndex)
      expectContains(gridSource, [
        "const caption =",
        'asset.caption || asset.prompt || asset.name || "No caption yet"',
      ])
      expectContains(sharedSource, [
        "src={attachment.url}",
        "alt={attachment.label}",
        "style={{ width: `${generation.progress}%` }}",
        'alt={generation.prompt || "Generated character image"}',
      ])
      expectContains(modalsSource, [
        "@/lib/realfarm-asset-ui-config",
        "assetCategoryByTab",
        "assetTabs.map((tab) => (",
        'activeTab === "outfits"',
        'activeTab === "background"',
        "function AssetImageGrid",
        "function AssetImageTile",
        "grid grid-cols-3 gap-2",
        "aspect-square",
        "group-hover:opacity-100",
        "group-focus-visible:opacity-100",
        "debug-attachments-bottom",
        "src={generation.imageUrl}",
        "CharacterImageEditorModal",
        'aria-label="Video generation prompt"',
        "characterImageToVideoModels",
        "taskId?: string",
        '"/api/characters/video"',
      ])
      expectNotContains(gridSource, ["asset.source", "replace"])
      expectNotContains(source, [
        'className="inline-flex max-w-full items-center gap-2 rounded-full bg-[#eef0f5]',
        "presetMenuOpen",
        'className="overflow-hidden rounded-[14px] border border-[#e1e1dc] bg-white text-left shadow-sm',
        "{generation.model} · {generation.aspectRatio}",
      ])
    })
  })

  describe("automation dynamic tags and loading", () => {
    it("keeps automation dynamic tags and generation loading wired", () => {
      const automationSettingsSource = readAutomationSettingsSource()
      const promptSource = src(
        "components/realfarm/automation-settings/prompt-settings.tsx"
      )
      const loadingSource = src("components/realfarm/generation-loading.tsx")
      const wordCollectionRouteSource = src("app/api/word-collections/route.ts")

      expectContains(promptSource, [
        "Dynamic tags",
        "dynamicHookSlotPattern",
        "/api/word-collections",
        "schemaWithAutomationHookSlots",
        "[[{slot}]]",
      ])
      expectContains(automationSettingsSource, [
        "generating={generating}",
        "StandardGenerationLoadingScreen",
        "Selecting images, expanding dynamic tags",
        "Preview will update when ready.",
      ])
      expectContains(loadingSource, [
        "StandardGenerationLoadingScreen",
        'role="status"',
        'aria-busy="true"',
      ])
      expectContains(wordCollectionRouteSource, [
        "listWordCollections",
        "upsertWordCollection",
        'export const dynamic = "force-dynamic"',
      ])
    })
  })

  describe("generated videos and UGC", () => {
    it("keeps generated video actions and persistence on DB-backed flows", () => {
      const exportsSource = src(
        "components/realfarm/generated-video-exports.tsx"
      )
      const greenscreenSource = src("components/realfarm/greenscreen-view.tsx")
      const ugcSource = readAutomationSettingsSource()
      const routeSource = src("app/api/generated-videos/route.ts")
      const greenscreenFlow = section(
        greenscreenSource,
        "async function createGreenscreenExport()",
        "return ("
      )
      const ugcFlow = section(
        ugcSource,
        "async function createUgcAdAutomationExport()",
        "return ("
      )

      expectContains(exportsSource, [
        "IconDownload",
        "IconCalendar",
        "IconTrash",
        'aria-label="Save video"',
        'aria-label="Schedule post"',
        'aria-label="Delete output"',
        "poster={item.previewUrl}",
        "primeVideoThumbnail",
        "ScheduleGeneratedVideoModal",
        '"/api/postfast/integrations"',
        '"/api/postfast/upload"',
        '"/api/postfast/posts"',
        "datetime-local",
        "/api/generated-videos?id=",
      ])
      expect(
        greenscreenFlow.indexOf("createGeneratedVideoExportRecord")
      ).toBeLessThan(greenscreenFlow.indexOf("renderAndUploadGreenscreenVideo"))
      expect(ugcFlow.indexOf("createGeneratedVideoExportRecord")).toBeLessThan(
        ugcFlow.indexOf("renderAndUploadUgcAdVideo")
      )
      expectContains(greenscreenSource, [
        'status: "processing"',
        "updateGeneratedVideoExportRecord",
        'status: "failed"',
      ])
      expectContains(ugcSource, [
        'status: "processing"',
        "updateGeneratedVideoExportRecord",
        'status: "failed"',
        "previewUrl: renderedVideo.thumbnailUrl",
        "Select an avatar video collection before creating an ad.",
        "disabled={creating || !previewVideo}",
        "Avatar video collection",
        "Demo video",
        "GeneratedVideoExports",
      ])
      expectContains(routeSource, [
        "payload.status",
        "requestedStatus",
        'requestedStatus ?? "queued"',
      ])
      expectNotContains(greenscreenSource, ["placeholderId"])
      expectNotContains(ugcSource, ["placeholderCounterRef", "Demo name"])
    })

    it("keeps greenscreen collection selection and renderer safeguards in place", () => {
      const greenscreenSource = src("components/realfarm/greenscreen-view.tsx")
      const workspaceSource = src("components/realfarm-workspace.tsx")
      const rendererSource = src(
        "components/realfarm/generated-video-renderer.ts"
      )
      const ugcRenderer = section(
        rendererSource,
        "export async function renderAndUploadUgcAdVideo",
        "export async function renderAndUploadGreenscreenVideo"
      )
      const greenscreenRenderer = section(
        rendererSource,
        "export async function renderAndUploadGreenscreenVideo",
        "async function uploadGeneratedVideo"
      )
      const recorderBlock = section(
        rendererSource,
        'recorder.addEventListener("dataavailable"',
        'recorder.addEventListener("error"'
      )

      expectContains(greenscreenSource, [
        "collections: CreatedImageCollection[]",
        "selectedBackgroundCollectionId",
        'import { CollectionSelector } from "@/components/realfarm/collection-selector"',
        "<CollectionSelector",
        "onCreateCollection",
      ])
      expectContains(workspaceSource, [
        "collections={visibleCollections}",
        "onCreateCollection={(collection) =>",
      ])
      expectNotContains(greenscreenSource, [
        "SelectControl",
        'aria-label="Background image collection"',
        "backgrounds: PinterestSearchResult[]",
      ])
      expectNotContains(workspaceSource, [
        "backgrounds={backgroundCollection?.images",
      ])
      expectContains(rendererSource, [
        "Selected UGC avatar video could not be loaded",
        "input.avatarVideoUrl && !video",
        "Selected greenscreen video could not be loaded",
        "input.memeUrl && !video",
        "safeCanvasImageSrc",
        "/api/image-proxy?url=",
        "encodeURIComponent(url.toString())",
        "thumbnailUrl",
        "canvasToBlob",
        "-thumbnail.jpg",
      ])
      expect(ugcRenderer).not.toContain("drawProgressBar")
      expect(greenscreenRenderer).not.toContain("drawProgressBar")
      expect(recorderBlock.match(/event\.data\.size > 0/g)).toHaveLength(1)
      expect(recorderBlock).toContain("chunks.push(event.data)")
    })
  })

  describe("temporary tooling", () => {
    it("renders model tags in slide testing center output previews", () => {
      const source = src("components/temp/slide-testing-center.tsx")
      const runResultSource = section(
        source,
        "function RunResult(",
        "function SlidePreview("
      )

      expectContains(runResultSource, ["{run.model}", "Model", "absolute"])
    })
  })
})

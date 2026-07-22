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
    "components/realfarm/automation-settings/automation-video-generation.ts",
    "components/realfarm/automation-settings/video-format-panel.tsx",
    "components/realfarm/automation-settings/video-format-helpers.ts",
    "components/realfarm/automation-settings/video-template-panel.tsx",
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
  expect(values.filter((value) => !source.includes(value))).toEqual([])
}

function expectNotContains(source: string, values: string[]) {
  expect(values.filter((value) => source.includes(value))).toEqual([])
}

describe("RealFarm source contracts", () => {
  describe("workspace and navigation", () => {
    it("keeps the initial workspace layout and hides the creators tab", () => {
      const workspaceSource = src("components/realfarm-workspace.tsx")
      const navigationSource = src("components/realfarm/navigation.tsx")

      expectContains(workspaceSource, [
        'initialNavigation?.view ?? "home"',
        'className="relative h-svh overflow-hidden bg-[#f7f7fa] text-app-text"',
        'className="flex h-svh"',
        '"min-w-0 flex-1 overflow-y-auto pb-20 md:pb-0"',
        '"px-4 py-4 sm:px-5 sm:py-5 lg:px-7"',
      ])
      expectContains(navigationSource, [
        "hidden h-svh w-56 shrink-0 overflow-y-auto",
        "export function MobileNavigation",
      ])
      expectNotContains(workspaceSource, [
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

    it("generates automation videos from the drawer and shows them in overview", () => {
      const automationSettingsSource = readAutomationSettingsSource()
      const videoPanelSource = src(
        "components/realfarm/automation-settings/video-format-panel.tsx"
      )
      const overviewSource = src(
        "components/realfarm/automation-settings/overview-panel.tsx"
      )
      const generationSource = src(
        "components/realfarm/automation-settings/automation-video-generation.ts"
      )
      const rendererSource = src(
        "components/realfarm/generated-video-renderer.ts"
      )
      const realfarmDataSource = src("lib/realfarm-data.ts")

      expectContains(generationSource, [
        "renderAndUploadUgcAdVideo",
        '"ugc_ad"',
        "createGeneratedVideoExportRecord",
        "updateGeneratedVideoExportRecord",
        "resolveMediaCollection",
        "automationId: input.automation.id",
      ])
      expectContains(automationSettingsSource, [
        "generateAutomationVideo",
        "automationVideoGenerationIssue",
        "useAutomationGeneratedVideoExports",
      ])
      expectContains(overviewSource, [
        "GeneratedVideoExports",
        'title="Generated videos"',
        "videoExportsLoading",
      ])
      expectContains(realfarmDataSource, [
        "demoVideos: LocalAsset[]",
        "listMediaLibraryAssets",
        'assetsFor(mediaAssets, "demo_videos")',
      ])
      expectContains(videoPanelSource, [
        "demoVideos: LocalAsset[]",
        "selectedDemoVideoId",
        "VideoAutomationPreviewText",
        "AutomationFormatTextToolbar",
        "addVideoTextItem",
        "selectedVideoTextIndex",
        "updateVideoTextItem",
        "deleteSelectedVideoTextItem",
      ])
      expectContains(generationSource, [
        "const activeDemoVideo =",
        "input.demoVideos.find(",
        "input.config.image_collection_ids.video_demo_asset_id",
      ])
      expectNotContains(videoPanelSource, [
        "GeneratedVideoExports",
        "createUgcAdAutomationExport",
        "renderAndUploadUgcAdVideo",
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

    it("allows parallel automation generations with distinct placeholders", () => {
      const drawerSource = src(
        "components/realfarm/automation-settings/drawer.tsx"
      )
      const helperSource = src(
        "components/realfarm/automation-settings/run-helpers.ts"
      )

      expectContains(drawerSource, [
        "activeGenerationCount",
        "crypto.randomUUID()",
        "function settleGeneration(run?: AutomationRunApiRecord)",
        "settleGeneration(run)",
        "loadFailedRunForRequest(",
        'run.requestId === requestId && run.status === "failed"',
        'generating ? "Generating…" : "Generate"',
        "disabled={generating || savingConfig}",
      ])
      expectContains(helperSource, [
        "generation-placeholder-${automation.id}${requestId",
      ])
      expectNotContains(drawerSource, [
        "disabled={generating}",
        "if (generating) {\n      return",
      ])
    })

    it("loads generated videos and quick-start templates from live props", () => {
      const homeSource = src("components/realfarm/home-view.tsx")

      expectContains(homeSource, [
        "fetchJsonWithTimeout<{",
        "exports?: GeneratedVideoExport[]",
        '}>("/api/generated-videos?limit=50"',
        "void loadGeneratedVideos()",
        "Start from a proven workflow",
        "templates: Automation[]",
        "quickStartTemplates",
        "QUICK_START_ITEMS_PER_PAGE = 6",
        "quickStartPage",
        "pagedQuickStartTemplates",
        "generatedRunsByAutomationId",
        "generatedHomeSlideshowCards",
        "includeFailed: true",
        "GenerationFailurePlaceholder",
        'item.slideshow.status === "failed"',
        'const isFailed = !item.videoUrl && item.status === "failed"',
        'item.error || "This video could not be generated."',
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
        "const [searchStatus, setSearchStatus] = useState<",
        '"idle" | "searching" | "loadingMore"',
        "const [creatingCollection, setCreatingCollection] = useState(false)",
        'const loadingMore = searchStatus === "loadingMore"',
        'const searching = searchStatus === "searching"',
        'const searchBusy = searchStatus !== "idle"',
        "disabled={!canCreate || creatingCollection}",
        "{creatingCollection",
        '? "Captioning..."',
        ': "Adding..."',
        ": `Add ${selectedResults.length} images`",
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
        "config.language",
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
        "formatCollection(config, photoCollections, activeKey)",
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
      ])
      expect(sharedSource).not.toContain("Not published")
      expectContains(toolbarSource, [
        "border-t border-app-panel-border",
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
        "Collection or Image",
        "Single image",
        "CTA collection",
        "Aspect Ratio",
        "Overlay Image",
        "Display text",
        "CtaSingleImagePicker",
      ])
      expectContains(source, [
        "function updateCtaEnabled",
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
        "config: effectiveDraftConfig",
        "flushSync",
        "remainingLoadingMs",
        "setRecentRuns",
        "AutomationRecentRunCard",
        "GeneratedSlideshowViewerModal",
        "runScheduleDurationLine",
        "renderedSlides",
        "ratioToCss(activeSlideRecord?.aspectRatio)",
        "absolute top-1/2 left-2",
        "absolute top-1/2 right-2",
        "AutomationRunDebugModal",
        "No generated slideshows yet.",
      ])
      expectContains(workspaceSource, [
        "fetchJsonWithTimeout(`/api/automations/${encodeURIComponent(id)}`",
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
      const workspaceSource = src("components/realfarm-workspace.tsx")
      const automationViewBranch = section(
        workspaceSource,
        '{view === "automations" &&',
        "</section>"
      )
      const settingsShell = section(
        src("components/realfarm/automation-settings/drawer.tsx"),
        "export function AutomationSettingsDrawer",
        "async function persistDraftConfig"
      )
      const settingsOuterClass = section(
        settingsShell,
        "className={cn(",
        ")}\n    >"
      )

      expectContains(automationViewBranch, [
        "editingAutomation ? (",
        "<AutomationSettingsDrawer",
        "refreshRecentAutomationRuns()",
        ") : (",
        "<AutomationsView",
      ])
      expectContains(workspaceSource, [
        'const fillsWorkspace = view === "automations" && Boolean(editingAutomation)',
        'fillsWorkspace ? "p-0" : "px-4 py-4 sm:px-5 sm:py-5 lg:px-7"',
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
        "border border-app-panel-border",
        "shadow-sm",
        "h-[min(720px,90vh)]",
        "min-h-[calc(100svh-40px)]",
      ])
    })

    it("uses a multi-provider PostFast social account picker for automation destinations", () => {
      const settingsSource = readAutomationSettingsSource()
      const automationsSource = src("components/realfarm/automations-view.tsx")
      const pickerSource = src("components/realfarm/social-account-picker.tsx")
      const selectionSource = src(
        "components/realfarm/social-account-selection.tsx"
      )
      const workspaceSource = src("components/realfarm-workspace.tsx")
      const schemaSource = src("lib/realfarm-automation.ts")

      expectContains(schemaSource, [
        "social_integrations: AutomationSocialIntegration[]",
        "normalizeAutomationSocialIntegrations",
      ])
      expectNotContains(schemaSource, ["tiktok_account_id: string | null"])
      expectContains(pickerSource, [
        "SocialAccountPickerModal",
        "usePostFastIntegrations",
        "isSlideshowSocialProvider",
        "Available accounts",
        "Selected to run",
        "SocialAccountSelectionGrid",
        "selectedIntegrationGrid",
      ])
      expectContains(selectionSource, [
        "/api/postfast/integrations",
        "SocialAccountSelectionTile",
        "SocialPlatformIcon",
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
        "mt-6 flex w-full items-center justify-between rounded-[8px] border border-app-panel-border bg-app-surface p-5 text-left",
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
        '"/api/automations"',
        "exampleRunsByTemplateId",
        "showcaseRunsByAutomationId",
        "recentRunsByAutomationId={showcaseRunsByAutomationId}",
        "generatedRunsByAutomationId={recentRunsByAutomationId}",
      ])
      expectNotContains(workspaceSource, ['"/api/automation-templates"'])
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
      expectContains(homeSource, [
        "ExampleSlideshowModal",
        "GeneratedSlideshowViewerModal",
        "onOpenSlideshow",
      ])
      expectContains(previewSource, [
        "No example slideshow yet",
        "slide.text",
        "exampleSlideSection(slide, index)",
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
        "exportSlideshowAsPngZip",
        "Export PNGs",
        "boundedActiveSlide - 1",
        "boundedActiveSlide + 1",
        "initialSlideshowId",
        'aria-label="Close slideshow"',
      ])
      expectNotContains(slideshowViewerSource, [
        "CheckedDropdownButton",
        'slide.section !== "hook"',
        "text-yellow-100",
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
    it("uses the canonical calendar and stored cross-account analytics", () => {
      const calendar = src(
        "components/realfarm/content-calendar/content-calendar-view.tsx"
      )
      const analytics = src("components/realfarm/analytics/analytics-view.tsx")
      const analyticsData = src(
        "components/realfarm/analytics/use-analytics-data.ts"
      )
      const accountProfile = src(
        "components/realfarm/analytics/account-profile-icon.tsx"
      )
      const analyticsPagination = src(
        "components/realfarm/analytics/pagination-controls.tsx"
      )
      const navigation = src("components/realfarm/navigation.tsx")
      const globalStyles = src("app/globals.css")

      expectContains(calendar, [
        "`/api/calendar?from=${encodeURIComponent(",
        "FullCalendar",
        'initialView="dayGridMonth"',
        'right: "dayGridMonth,timeGridWeek"',
        "CalendarItemDetail",
        "filterStorageKey",
        "MultiSelectFilter",
        "CalendarSelectFilter",
        "<DropdownMenu.Root>",
        "<Select.Root",
        "reconcileAvailableFilters",
        "activeFilters",
        "No accounts in range",
        "No platforms in range",
        "No automations in range",
        "No sources in range",
        '<IconUsers className="size-4" />',
        '<IconWorld className="size-4" />',
        '<IconActivity className="size-4" />',
        '<IconDatabase className="size-4" />',
        "filters.accounts",
        "filters.statuses",
        "filters.platform",
        "filters.automation",
        "filters.sourceType",
        "window.localStorage.setItem",
        'item.status === "scheduled" && item.links.cancel',
        'item.status === "generation_failed" && item.links.retry',
        'item.links.retry, { method: "POST" }',
        "calendarEventHoverText(item)",
        "calendarTimingEntries(item)",
        '<AppModal className="z-[70] bg-[#24251f]/45"',
        "accessibleTitle={item.title}",
        'className="max-h-[calc(100vh-2rem)] max-w-[560px] overflow-y-auto p-0"',
        "function PlatformMark",
        'case "google-business-profile"',
      ])
      expectNotContains(calendar, [
        "WeekCalendar",
        "AgendaList",
        "Reschedule",
        "xl:grid-cols-[1fr_340px]",
        "<aside",
        "SelectControl",
        "Select all",
      ])
      expectContains(globalStyles, [
        "--fc-button-text-color: var(--app-text-soft);",
        ".cfarm-calendar .fc-button {",
        "background: var(--app-control-bg);",
        "color: var(--app-text-soft);",
        ".cfarm-calendar .fc-button:hover:not(:disabled)",
        ".cfarm-calendar .fc-button-primary:not(:disabled).fc-button-active",
        ".cfarm-calendar .fc-button:focus-visible",
        ".cfarm-calendar .fc-button:disabled",
        "color: var(--app-muted-text);",
      ])
      expectContains(navigation, [
        '}>("/api/calendar/summary"',
        "calendarStatus.summary.needsAction + calendarStatus.summary.failed",
        'item.key === "schedule" ? scheduleBadge : 0',
      ])
      expectContains(analyticsData, [
        "const requestKey = `/api/analytics/report?days=${days}`",
      ])
      expectContains(analytics, [
        "AnalyticsOverview",
        "AccountSelectorRail",
        "PortfolioMetricCard",
        "PlatformAnalytics",
        "ComparisonChart",
        "AccountPerformanceTable",
        "RecentPosts",
        "`/app/analytics/posts/${encodeURIComponent(post.postId)}`",
        "capabilities",
        "<AccountProfileIcon",
        "<PaginationControls",
        "const pageSize = 4",
        "const pageSize = 8",
      ])
      expectContains(accountProfile, [
        "export function AccountProfileIcon",
        "<Tooltip.Portal>",
        "providerName(integration.provider)",
      ])
      expectContains(analyticsPagination, [
        "export function PaginationControls",
        "Previous ${label} page",
        "Next ${label} page",
      ])
      expectNotContains(analytics, [
        'type AnalyticsLevel = "overview" | "account" | "posts"',
        "AccountAnalytics",
        "PostAnalyticsTable",
      ])
      expectNotContains(analytics, [
        "domain={[0, 4]}",
        "Track your TikTok performance",
      ])
    })
  })

  describe("automation variables and loading", () => {
    it("keeps compact automation variables and generation loading wired", () => {
      const automationSettingsSource = readAutomationSettingsSource()
      const promptSource = src(
        "components/realfarm/automation-settings/prompt-settings.tsx"
      )
      const loadingSource = src("components/realfarm/generation-loading.tsx")
      const wordCollectionRouteSource = src("app/api/word-collections/route.ts")

      expectContains(promptSource, [
        "Variables",
        "VariableBadge",
        "variable.name.toUpperCase()",
        "/api/word-collections",
        "schemaWithAutomationHookSlots",
        "wordCollectionVariableName(collection).toUpperCase()",
      ])
      expectNotContains(promptSource, [
        "Dynamic tags",
        "dynamicHookSlotPattern",
      ])
      expectContains(automationSettingsSource, [
        "generationPlaceholderRun",
        "placeholder-generating",
        "generatingSlidePlaceholderDataUrl",
      ])
      expectNotContains(automationSettingsSource, [
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
      const accountSelectionSource = src(
        "components/realfarm/social-account-selection.tsx"
      )
      const greenscreenSource = src("components/realfarm/greenscreen-view.tsx")
      const ugcSource = src(
        "components/realfarm/automation-settings/automation-video-generation.ts"
      )
      const routeSource = src("app/api/generated-videos/route.ts")
      const greenscreenFlow = section(
        greenscreenSource,
        "async function createGreenscreenExport()",
        "return ("
      )
      const ugcFlow = section(
        ugcSource,
        "async function generateUgcAdVideo(",
        "async function generateTemplateVideo("
      )

      expectContains(exportsSource, [
        "IconDownload",
        "IconCalendar",
        "IconTrash",
        'aria-label="Save video"',
        'aria-label="Schedule post"',
        'aria-label="Delete output"',
        "item.previewUrl ? undefined : item.videoUrl",
        'preload={item.previewUrl ? "none" : "metadata"}',
        "ScheduleGeneratedVideoModal",
        "usePostFastIntegrations",
        "SocialAccountSelectionGrid",
        '"/api/postfast/upload"',
        '"/api/postfast/posts"',
        "datetime-local",
        "/api/generated-videos/",
      ])
      expectContains(accountSelectionSource, ['"/api/postfast/integrations"'])
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
        "previewUrl: rendered.thumbnailUrl",
        "Choose or create a video collection with at least one video before generating.",
        "automationId: input.automation.id",
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

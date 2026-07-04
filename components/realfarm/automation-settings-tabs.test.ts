import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("automation settings drawer tabs", () => {
  it("keeps TikTok settings separate from general settings", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "components",
        "realfarm",
        "automation-settings.tsx"
      ),
      "utf8"
    )

    expect(source).toContain("type AutomationDrawerTab =")
    for (const tab of [
      '"overview"',
      '"format"',
      '"hooks"',
      '"schedule"',
      '"tiktok"',
      '"settings"',
    ]) {
      expect(source).toContain(tab)
    }
    expect(source).toContain('active={activeTab === "tiktok"}')
    expect(source).toContain('onClick={() => setActiveTab("tiktok")}')
    expect(source).toContain('active={activeTab === "settings"}')
    expect(source).toContain('onClick={() => setActiveTab("settings")}')
    expect(source).toContain('activeTab === "tiktok"')
    expect(source).toContain('activeTab === "settings"')
    expect(source).toContain("AutomationGeneralSettingsPanel")
    expect(source).toContain('SettingsPage title="Settings"')
    expect(source).toContain("New Slide Editor")
    expect(source).toContain("TikTok Sounds")
  })

  it("uses shared select and switch controls in the affected settings panels", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "components",
        "realfarm",
        "automation-settings.tsx"
      ),
      "utf8"
    )

    expect(source).toContain("SelectControl")
    expect(source).toContain("SwitchPillButton")
    expect(source).toContain("SettingsRow")
    expect(source).toContain("PromptTextarea")
  })

  it("backs automation language control with the schema language setting", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "components",
        "realfarm",
        "automation-settings.tsx"
      ),
      "utf8"
    )
    const settingsSource = source.slice(
      source.indexOf("function AutomationGeneralSettingsPanel"),
      source.indexOf("function SettingsPage")
    )

    expect(settingsSource).toContain("config.image_collection_ids.language")
    expect(settingsSource).toContain("updateLanguage")
    for (const language of ["English", "Chinese", "Malay", "Indian", "Spanish"]) {
      expect(settingsSource).toContain(`\"${language}\"`)
    }
    expect(settingsSource).not.toContain("French")
    expect(settingsSource).not.toContain("German")
    expect(settingsSource).not.toContain("Italian")
    expect(settingsSource).not.toContain("Portuguese")
  })

  it("renders schedule as an editable posting time settings page", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "components",
        "realfarm",
        "automation-settings.tsx"
      ),
      "utf8"
    )

    expect(source).toContain('title="Posting times"')
    expect(source).toContain("defaultPostingTime")
    expect(source).toContain("Add posting time")
    expect(source).toContain("toggleDay")
    expect(source).toContain("updateTime")
    expect(source).toContain("removePostingTime")
    expect(source).toContain('placeholder="11:00 AM"')
  })

  it("uses the selected automation template data in slideshow format previews", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "components",
        "realfarm",
        "automation-settings.tsx"
      ),
      "utf8"
    )
    const sharedSource = readFileSync(
      path.join(process.cwd(), "components", "realfarm", "shared-media.tsx"),
      "utf8"
    )

    expect(source).toContain("collections: CreatedImageCollection[]")
    expect(source).toContain("formatCollection(config, collections, activeKey)")
    expect(source).toContain("buildFormatPreviewItems(config, collections)")
    expect(source).toContain("CollectionSelector")
    expect(source).toContain("updateImageCollectionId")
    expect(source).toContain("formatCollection(config, collections, role)")
    expect(source).not.toContain(
      "collections.find((collection) => collection.images.length > 0)?.images"
    )
    expect(source).toContain("formatPreviewText(config, role, index)")
    expect(source).toContain("formatPreviewCardSize(item.section.aspect_ratio")
    expect(source).toContain("formatAspectRatioCss(")
    expect(source).toContain("AutomationFormatImageLayout")
    expect(source).not.toContain(
      'Array.from({ length: activeTab === "CTA" ? 8 : 6 })'
    )
    expect(source).toContain("PinterestPreviewTile")
    expect(source).not.toContain("Motivational Screencaps")
    expect(source).not.toContain("Pinterest - space")
    expect(source).not.toContain("Nisi ut aliquip")
    expect(source).not.toContain("Incididunt ut labore")
    expect(source).not.toContain("Not published")
    expect(sharedSource).not.toContain("Not published")
  })

  it("matches the Reelfarm compact text editor controls", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "components",
        "realfarm",
        "automation-settings.tsx"
      ),
      "utf8"
    )
    const toolbarSource = source.slice(
      source.indexOf("function AutomationFormatTextToolbar"),
      source.indexOf("function TikTokSettingsPanel")
    )

    expect(toolbarSource).toContain("border-t border-[#E5E7EB]")
    expect(toolbarSource).toContain("bg-[#F5F5F5]")
    expect(toolbarSource).toContain("rounded-xl")
    expect(toolbarSource).toContain("space-y-2.5")
    expect(toolbarSource).toContain("Word length")
    expect(toolbarSource).toContain("Alignment")
    expect(toolbarSource).toContain("Top/Bottom Padding")
    expect(toolbarSource).toContain("Content direction")
    expect(toolbarSource).toContain("<textarea")
    expect(toolbarSource).toContain("Advanced")
    expect(toolbarSource).toContain("Add text")
    expect(toolbarSource).toContain("AlignCenter")
    expect(toolbarSource).toContain("MapPin")
    expect(toolbarSource).not.toContain('label="Font"')
    expect(toolbarSource).not.toContain('label="Style"')
    expect(toolbarSource).not.toContain('label="Size"')
  })

  it("matches the Reelfarm CTA format editor controls", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "components",
        "realfarm",
        "automation-settings.tsx"
      ),
      "utf8"
    )
    const ctaSource = source.slice(
      source.indexOf("function AutomationCtaFormatEditor"),
      source.indexOf("function AutomationFormatPreviewCard")
    )

    expect(ctaSource).toContain("Enable CTA")
    expect(ctaSource).toContain("Slide Placement")
    expect(ctaSource).toContain("Collection or Image")
    expect(ctaSource).toContain("Single image")
    expect(ctaSource).toContain("CTA collection")
    expect(ctaSource).toContain("Aspect Ratio")
    expect(ctaSource).toContain("Image Grid")
    expect(ctaSource).toContain("Overlay Image")
    expect(ctaSource).toContain("Display text")
    expect(ctaSource).toContain("CtaSingleImagePicker")
    expect(source).toContain("function updateCtaEnabled")
    expect(source).toContain("function updateCtaPlacement")
    expect(source).toContain("function updateCtaImageMode")
    expect(source).toContain("function updateCtaSingleImage")
    expect(source).toContain("ctaEnabled(config, cta)")
    expect(source).not.toContain(
      'activeSection.ctaLocation !== "static" ? "bg-app-action"'
    )
  })

  it("generates from the drawer and renders recent runs from data", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "components",
        "realfarm",
        "automation-settings.tsx"
      ),
      "utf8"
    )

    expect(source).toContain("async function generateAutomation()")
    expect(source).toContain('"/api/automations/run"')
    expect(source).toContain("automationId: automation.id")
    expect(source).toContain("schema: config")
    expect(source).toContain("flushSync")
    expect(source).toContain("remainingLoadingMs")
    expect(source).toContain("setRecentRuns")
    expect(source).toContain("AutomationRecentRunCard")
    expect(source).toContain("No generated slideshows yet.")
    expect(source).not.toContain(
      "4 uncomfortable but healthy relationship questions"
    )
  })
})

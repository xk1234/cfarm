import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const targets = process.argv.slice(2)

if (targets.length === 0) {
  throw new Error("Pass one or more JSON files to migrate")
}

for (const target of targets) {
  const filePath = path.resolve(target)
  const value = JSON.parse(await readFile(filePath, "utf8"))
  migrateValue(value)
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
  console.log(`Migrated ${filePath}`)
}

function migrateValue(value) {
  if (Array.isArray(value)) {
    value.forEach(migrateValue)
    return
  }
  if (!value || typeof value !== "object") return

  migrateSlideshow(value)
  if (value.aspect_ratio === "fit") value.aspect_ratio = "4:5"

  for (const [key, child] of Object.entries(value)) {
    if (key === "image_collection_ids") {
      migrateImageConfig(value, key, child)
      continue
    }
    if (key === "settings" && child && typeof child === "object") {
      delete child.is_bg_overlay_on
      delete child.is_bg_overlay_on_hook_image
    }
    migrateValue(child)
  }
}

function migrateSlideshow(value) {
  const slides = Array.isArray(value.slides)
    ? value.slides
    : Array.isArray(value.images)
      ? value.images
      : null
  if (!slides || !value.settings || typeof value.settings !== "object") return

  const firstSlide = slides.find((slide) => slide && typeof slide === "object")
  const firstTextItem = slides
    .flatMap((slide) =>
      Array.isArray(slide?.textItems) ? slide.textItems : []
    )
    .find((item) => item && typeof item === "object")
  value.settings.aspect_ratio =
    typeof value.settings.aspect_ratio === "string"
      ? value.settings.aspect_ratio
      : typeof firstSlide?.aspect_ratio === "string"
        ? firstSlide.aspect_ratio === "fit"
          ? "4:5"
          : firstSlide.aspect_ratio
        : "9:16"
  value.settings.font =
    typeof value.settings.font === "string"
      ? value.settings.font
      : typeof firstTextItem?.font === "string"
        ? firstTextItem.font
        : "TikTok Display Medium"

  for (const slide of slides) {
    if (!slide || typeof slide !== "object") continue
    delete slide.aspect_ratio
    delete slide.time_length_ms
    if (!Array.isArray(slide.textItems)) continue
    for (const textItem of slide.textItems) {
      if (textItem && typeof textItem === "object") delete textItem.font
    }
  }
}

function migrateImageConfig(parent, key, rawConfig) {
  const storedAsString = typeof rawConfig === "string"
  const config = storedAsString ? JSON.parse(rawConfig) : rawConfig
  if (!config || typeof config !== "object" || Array.isArray(config)) return

  parent.image_fit =
    parent.image_fit === "cover" ||
    parent.image_fit === "contain" ||
    parent.image_fit === "fit"
      ? parent.image_fit
      : config.keepOriginalAspectRatio === false
        ? "cover"
        : "contain"
  parent.language =
    typeof parent.language === "string" && parent.language.trim()
      ? parent.language.trim()
      : typeof config.language === "string" && config.language.trim()
        ? config.language.trim()
        : "English"

  migrateSectionOverlays(parent, config)

  delete config.aspect_ratio
  delete config.is_bg_overlay_on
  delete config.keepOriginalAspectRatio
  delete config.is_bg_overlay_on_hook_image
  delete config.language

  parent[key] = storedAsString ? JSON.stringify(config) : config
  migrateValue(config)
}

function migrateSectionOverlays(parent, config) {
  if (!Array.isArray(parent.formatting)) return
  for (const section of parent.formatting) {
    if (!section || typeof section !== "object") continue
    if (section.aspect_ratio === "fit") section.aspect_ratio = "4:5"
    if (typeof section.overlay === "boolean") continue
    if (section.id === "hook") {
      section.overlay =
        typeof config.is_bg_overlay_on_hook_image === "boolean"
          ? config.is_bg_overlay_on_hook_image
          : Boolean(config.is_bg_overlay_on)
    } else if (section.id === "body") {
      section.overlay = Boolean(config.is_bg_overlay_on)
    } else if (section.id === "cta") {
      section.overlay = false
    }
  }
}

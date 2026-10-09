/**
 * Built-in starter templates (doc 01 §3). They are read-only, shared by every
 * workspace, and addressable by `templateId` exactly like stored templates.
 *
 * The engine's house-style starters (lib/render/templates) come first; the
 * doc 01 example fixtures fill in ids the engine set does not define.
 */
import collageTemplate from "@/lib/render/fixtures/collage.template.json"
import collageValues from "@/lib/render/fixtures/collage.values.json"
import listicleTemplate from "@/lib/render/fixtures/listicle.template.json"
import listicleValues from "@/lib/render/fixtures/listicle.values.json"
import quoteTemplate from "@/lib/render/fixtures/quote-carousel.template.json"
import quoteValues from "@/lib/render/fixtures/quote-carousel.values.json"
import { canvasSize, type SlideshowSpec, type SlotValues } from "@/lib/render/spec"
import { listStarterTemplates as listEngineStarters, STARTER_TEMPLATE_PREFIX } from "@/lib/render/templates"

export { STARTER_TEMPLATE_PREFIX }

export type StarterTemplate = {
  id: string
  name: string
  description: string
  spec: SlideshowSpec
  /** Illustrative slot values (media ids are placeholders). */
  exampleSlotValues: SlotValues
}

function starter(slug: string, template: unknown, values: unknown): StarterTemplate {
  const spec = template as SlideshowSpec
  return {
    id: `${STARTER_TEMPLATE_PREFIX}${slug}`,
    name: spec.name ?? slug,
    description: spec.description ?? "",
    spec,
    exampleSlotValues: values as SlotValues,
  }
}

const ENGINE_STARTERS: StarterTemplate[] = listEngineStarters().map((t) => ({
  id: t.id,
  name: t.name,
  description: t.description,
  spec: t.spec,
  exampleSlotValues: t.sampleValues,
}))

const FIXTURE_STARTERS: StarterTemplate[] = [
  starter("listicle", listicleTemplate, listicleValues),
  starter("quote-carousel", quoteTemplate, quoteValues),
  starter("collage", collageTemplate, collageValues),
]

const STARTERS: readonly StarterTemplate[] = Object.freeze([
  ...ENGINE_STARTERS,
  ...FIXTURE_STARTERS.filter((f) => !ENGINE_STARTERS.some((e) => e.id === f.id)),
])

export function listStarterTemplates(): readonly StarterTemplate[] {
  return STARTERS
}

export function isStarterTemplateId(id: string): boolean {
  return id.startsWith(STARTER_TEMPLATE_PREFIX)
}

export function getStarterTemplate(id: string): StarterTemplate | null {
  return STARTERS.find((s) => s.id === id) ?? null
}

/** Summary fields shared by starter and stored templates. */
export function templateShape(spec: SlideshowSpec) {
  const size = canvasSize(spec.canvas)
  let imageSlotCount = 0
  for (const def of Object.values(spec.slots ?? {})) {
    if (def.type === "image") imageSlotCount++
    if (def.type === "list") {
      imageSlotCount += Object.values(def.item).filter((d) => d.type === "image").length
    }
  }
  return {
    aspectRatio: spec.canvas.preset ?? (size ? `${size.width}x${size.height}` : "unknown"),
    width: size?.width ?? null,
    height: size?.height ?? null,
    slideCount: spec.slides.length,
    imageSlotCount,
  }
}

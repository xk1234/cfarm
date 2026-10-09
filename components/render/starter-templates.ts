/**
 * Bundled starter templates (the doc 01 §3 examples). The gallery prefers
 * `GET /api/v1/templates`; these keep the gallery usable when that route is
 * unavailable. Renders from a bundled starter post the template spec itself,
 * so they never depend on a server-side template id.
 */
import collageTemplate from "@/lib/render/fixtures/collage.template.json"
import listicleTemplate from "@/lib/render/fixtures/listicle.template.json"
import quoteTemplate from "@/lib/render/fixtures/quote-carousel.template.json"
import type { SlideshowSpec } from "@/lib/render/spec"

import type { TemplateView } from "@/components/realfarm/api-client"

function starter(id: string, spec: unknown, description: string): TemplateView {
  const typed = spec as SlideshowSpec
  return {
    id,
    name: typed.name ?? id,
    description,
    starter: true,
    spec: typed,
  }
}

export const BUNDLED_STARTER_TEMPLATES: readonly TemplateView[] = Object.freeze([
  starter(
    "starter-listicle",
    listicleTemplate,
    "Hook slide, one photo slide per list item, closing slide."
  ),
  starter("starter-quote-carousel", quoteTemplate, "Text-only quotes on a colour background."),
  starter("starter-collage", collageTemplate, "Single 2×2 photo grid with a centred label."),
])

/** Server templates first; bundled starters fill in names the server lacks. */
export function mergeTemplates(remote: readonly TemplateView[] | null): TemplateView[] {
  if (!remote || remote.length === 0) return [...BUNDLED_STARTER_TEMPLATES]
  const names = new Set(remote.map((template) => template.name))
  return [
    ...remote,
    ...BUNDLED_STARTER_TEMPLATES.filter((template) => !names.has(template.name)),
  ]
}

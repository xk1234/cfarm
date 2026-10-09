/**
 * Starter templates: read-only template specs shipped with the app. They
 * reproduce the pre-engine house styles (outline / pill captions, listicle,
 * quote, text-only, 2×2 / 1×2 / 1×3 grids, photo card, sticker oval) as
 * explicit layers — no engine special-casing. Users render them directly
 * (`templateId: "starter-…"`) or copy one into their own templates.
 *
 * Each `<id>.json` has a matching `<id>.values.json` with sample slot values
 * (media ids are placeholders) used by golden tests and docs.
 */
import type { SlideshowSpec, SlotValues } from "../spec"
import grid1x2 from "./starter-grid-1x2.json"
import grid1x2Values from "./starter-grid-1x2.values.json"
import grid1x3 from "./starter-grid-1x3.json"
import grid1x3Values from "./starter-grid-1x3.values.json"
import grid2x2 from "./starter-grid-2x2.json"
import grid2x2Values from "./starter-grid-2x2.values.json"
import iconOval from "./starter-icon-oval.json"
import iconOvalValues from "./starter-icon-oval.values.json"
import listicle from "./starter-listicle.json"
import listicleValues from "./starter-listicle.values.json"
import photoCard from "./starter-photo-card.json"
import photoCardValues from "./starter-photo-card.values.json"
import photoOutline from "./starter-photo-outline.json"
import photoOutlineValues from "./starter-photo-outline.values.json"
import photoPill from "./starter-photo-pill.json"
import photoPillValues from "./starter-photo-pill.values.json"
import quoteCards from "./starter-quote-cards.json"
import quoteCardsValues from "./starter-quote-cards.values.json"
import textStatements from "./starter-text-statements.json"
import textStatementsValues from "./starter-text-statements.values.json"

export const STARTER_TEMPLATE_PREFIX = "starter-"

export type StarterTemplateCategory = "photo" | "text" | "grid" | "stickers"

export type StarterTemplate = {
  id: string
  name: string
  description: string
  category: StarterTemplateCategory
  spec: SlideshowSpec
  /** Example slot values; image sources are placeholder media ids. */
  sampleValues: SlotValues
}

function starter(spec: unknown, sampleValues: unknown): StarterTemplate {
  const s = spec as SlideshowSpec
  const meta = (s.meta ?? {}) as { category?: StarterTemplateCategory }
  return {
    id: s.id!,
    name: s.name!,
    description: s.description ?? "",
    category: meta.category ?? "photo",
    spec: s,
    sampleValues: sampleValues as SlotValues,
  }
}

const STARTER_TEMPLATES: readonly StarterTemplate[] = Object.freeze([
  starter(photoOutline, photoOutlineValues),
  starter(photoPill, photoPillValues),
  starter(listicle, listicleValues),
  starter(quoteCards, quoteCardsValues),
  starter(textStatements, textStatementsValues),
  starter(grid2x2, grid2x2Values),
  starter(grid1x2, grid1x2Values),
  starter(grid1x3, grid1x3Values),
  starter(photoCard, photoCardValues),
  starter(iconOval, iconOvalValues),
])

/** Starter templates in display order. Specs are shared; clone before mutating. */
export function listStarterTemplates(): readonly StarterTemplate[] {
  return STARTER_TEMPLATES
}

export function getStarterTemplate(id: string): StarterTemplate | null {
  return STARTER_TEMPLATES.find((t) => t.id === id) ?? null
}

export function isStarterTemplateId(id: string): boolean {
  return id.startsWith(STARTER_TEMPLATE_PREFIX)
}

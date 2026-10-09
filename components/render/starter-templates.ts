/**
 * Bundled starter templates (the doc 01 §3 examples). The gallery prefers
 * `GET /api/v1/templates`; these keep the gallery usable when that route is
 * unavailable. Renders from a bundled starter post the template spec itself,
 * so they never depend on a server-side template id.
 */
import { listStarterTemplates } from "@/lib/renders/starters"

import type { TemplateView } from "@/components/realfarm/api-client"

export const BUNDLED_STARTER_TEMPLATES: readonly TemplateView[] = Object.freeze(
  listStarterTemplates().map((starter) => ({
    id: starter.id,
    name: starter.name,
    description: starter.description || null,
    starter: true,
    spec: starter.spec,
  }))
)

/** Server templates first; bundled starters fill in ids the server lacks. */
export function mergeTemplates(remote: readonly TemplateView[] | null): TemplateView[] {
  if (!remote || remote.length === 0) return [...BUNDLED_STARTER_TEMPLATES]
  const ids = new Set(remote.map((template) => template.id))
  return [...remote, ...BUNDLED_STARTER_TEMPLATES.filter((template) => !ids.has(template.id))]
}

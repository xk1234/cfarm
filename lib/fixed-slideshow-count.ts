import type {
  AutomationHookItem,
  AutomationSchema,
} from "@/lib/realfarm-automation"

const dynamicSlideCountToken = /\[\[\s*SLIDE_COUNT\s*\]\]/i

export function fixedSlideshowCount(
  schema: Pick<AutomationSchema, "prompt_formatting" | "formatting">
) {
  const configured = Number(schema.prompt_formatting?.num_of_slides)
  if (Number.isFinite(configured) && configured > 0) {
    return Math.max(1, Math.round(configured))
  }

  const total = schema.formatting.reduce(
    (sum, section) =>
      sum + Math.max(0, Math.round(Number(section.slideCount) || 0)),
    0
  )
  return Math.max(1, total || 1)
}

export function hookUsesDynamicSlideCount(
  hook: Pick<AutomationHookItem, "text" | "bodySlideCount">
) {
  return (
    dynamicSlideCountToken.test(hook.text) ||
    (Number.isFinite(Number(hook.bodySlideCount)) &&
      Number(hook.bodySlideCount) > 0)
  )
}

export function assertNoEnabledDynamicSlideCountHooks(
  hooks: Array<
    Pick<AutomationHookItem, "id" | "text" | "enabled" | "bodySlideCount">
  >
) {
  const invalid = hooks.filter(
    (hook) => hook.enabled && hookUsesDynamicSlideCount(hook)
  )
  if (invalid.length === 0) return
  throw new Error(
    `Dynamic slide-count hooks are no longer supported. Set a fixed template slide count and rewrite or disable: ${invalid
      .map((hook) => hook.id)
      .join(", ")}.`
  )
}

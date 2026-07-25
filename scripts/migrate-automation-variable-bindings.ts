import { readFileSync } from "node:fs"
import path from "node:path"
import { parseEnv } from "node:util"

const root = path.resolve(import.meta.dirname, "..")
const envFile = argumentValue("--env-file") || ".env.local"
const applySlideCountHooks = process.argv.includes("--apply-slide-count-hooks")
const environment = parseEnv(readFileSync(path.resolve(root, envFile), "utf8"))
for (const [key, value] of Object.entries(environment)) process.env[key] = value

const ownerId =
  environment.LUMENCLIP_SYSTEM_OWNER_ID?.trim() ||
  environment.LUMENCLIP_MCP_OWNER_ID?.trim()
if (!ownerId) {
  throw new Error(
    `${envFile} must define LUMENCLIP_SYSTEM_OWNER_ID or LUMENCLIP_MCP_OWNER_ID.`
  )
}
process.env.LUMENCLIP_SYSTEM_OWNER_ID = ownerId

const [
  { deriveAutomationVariableBindings },
  { listAutomationRecords, patchAutomationRecord },
  { automationHookItems, schemaWithAutomationHookItems },
  { listWordCollections },
  { withSystemOwner },
] = await Promise.all([
  import("@/lib/automation-variable-bindings"),
  import("@/lib/automations"),
  import("@/lib/realfarm-automation"),
  import("@/lib/word-collections"),
  import("@/lib/system-owner-context"),
])

const slideCountHookIds = new Set([
  "hook_0sxku68",
  "hook_1lvalff",
  "hook_1lia5rp",
  "hook_0nbdcs0",
])

const result = await withSystemOwner(ownerId, async () => {
  const [automations, collections] = await Promise.all([
    listAutomationRecords(),
    listWordCollections(),
  ])
  let slideCountHooksChanged = 0
  const reports = []

  for (const original of automations) {
    let automation = original
    const hooks = automationHookItems(automation.schema)
    const migratedHooks = hooks.map((hook) => {
      if (!slideCountHookIds.has(hook.id)) return hook
      const text = hook.text.replace(/^\s*\[\[NUMBER\]\]/i, "[[SLIDE_COUNT]]")
      if (text === hook.text) return hook
      slideCountHooksChanged += 1
      return { ...hook, text, updatedAt: new Date().toISOString() }
    })
    if (
      applySlideCountHooks &&
      migratedHooks.some((hook, index) => hook.text !== hooks[index]?.text)
    ) {
      const updated = await patchAutomationRecord({
        id: automation.id,
        schema: schemaWithAutomationHookItems(automation.schema, migratedHooks),
      })
      if (!updated) throw new Error(`Automation disappeared: ${automation.id}`)
      automation = updated
    }

    const bindings = deriveAutomationVariableBindings({
      schema: automation.schema,
      collections,
    })
    const normalizedOverrides = normalizeMap(bindings.explicitOverrides)
    const normalizedDerived = normalizeMap(bindings.hookSlots)
    const differingOverrides = Object.entries(normalizedOverrides).flatMap(
      ([token, collectionId]) =>
        normalizedDerived[token] !== collectionId
          ? [
              {
                token,
                configuredCollectionId: collectionId,
                derivedCollectionId: normalizedDerived[token] ?? null,
              },
            ]
          : []
    )
    if (
      bindings.missingTokens.length > 0 ||
      bindings.unusedOverrides.length > 0 ||
      bindings.conflicts.length > 0 ||
      differingOverrides.length > 0
    ) {
      reports.push({
        automationId: automation.id,
        name: automation.name,
        missingTokens: bindings.missingTokens,
        unusedOverrides: bindings.unusedOverrides,
        conflicts: bindings.conflicts,
        differingOverrides,
      })
    }
  }

  return {
    environment: envFile,
    dryRun: !applySlideCountHooks,
    automationsScanned: automations.length,
    collectionsScanned: collections.length,
    slideCountHooksChanged,
    bindingMismatchCount: reports.length,
    bindingMismatches: reports,
    note: "Project-scoped LumenLab connections are intentionally not mutated; this report compares LumenClip hooks, canonical collections, and explicit automation overrides.",
  }
})

console.log(JSON.stringify(result, null, 2))

function normalizeMap(values: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key.trim().toLowerCase(),
      value.trim().toLowerCase(),
    ])
  )
}

function argumentValue(name: string) {
  const exact = process.argv.find((argument) => argument.startsWith(`${name}=`))
  if (exact) return exact.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

import {
  hookVariableNameFromLabel,
  isRuntimeHookVariable,
  wordCollectionVariableName,
} from "@/lib/hook-variables"
import {
  automationHookItems,
  type AutomationSchema,
} from "@/lib/realfarm-automation"
import type { WordCollectionRecord } from "@/lib/word-collections"

export type AutomationVariableBinding = {
  token: string
  variableName: string
  source: "runtime" | "derived" | "override" | "missing"
  collectionId?: string
  collectionName?: string
}

export function deriveAutomationVariableBindings(input: {
  schema: AutomationSchema
  collections: WordCollectionRecord[]
}) {
  const explicitOverrides = { ...(input.schema.hook_slots ?? {}) }
  const tokens = automationVariableNames(input.schema)
  const collectionsByAlias = collectionAliasIndex(input.collections)
  const collectionsByVariable = new Map<string, WordCollectionRecord[]>()
  for (const collection of input.collections) {
    const variableName = wordCollectionVariableName(collection).toLowerCase()
    collectionsByVariable.set(variableName, [
      ...(collectionsByVariable.get(variableName) ?? []),
      collection,
    ])
  }

  const bindings: AutomationVariableBinding[] = tokens.map((variableName) => {
    const token = `[[${variableName.toUpperCase()}]]`
    if (isRuntimeHookVariable(variableName)) {
      return { token, variableName, source: "runtime" }
    }
    const override = caseInsensitiveValue(explicitOverrides, variableName)
    const matches = override
      ? (collectionsByAlias.get(override.toLowerCase()) ?? [])
      : (collectionsByVariable.get(variableName) ?? [])
    if (matches.length !== 1) {
      return { token, variableName, source: "missing" }
    }
    const collection = matches[0]
    return {
      token,
      variableName,
      source: override ? "override" : "derived",
      collectionId: collection.id,
      collectionName: collection.name,
    }
  })

  const hookSlots = Object.fromEntries(
    bindings.flatMap((binding) =>
      binding.collectionId
        ? [[binding.variableName, binding.collectionId] as const]
        : []
    )
  )
  const tokenSet = new Set(tokens)
  const conflicts = [...collectionsByVariable.entries()].flatMap(
    ([variableName, collections]) =>
      collections.length > 1
        ? [
            {
              variableName,
              collectionIds: collections.map((collection) => collection.id),
            },
          ]
        : []
  )

  return {
    hookSlots,
    explicitOverrides,
    bindings,
    missingTokens: bindings
      .filter((binding) => binding.source === "missing")
      .map((binding) => binding.token),
    unusedOverrides: Object.keys(explicitOverrides).filter(
      (name) => !tokenSet.has(hookVariableNameFromLabel(name))
    ),
    ignoredRuntimeOverrides: Object.keys(explicitOverrides).filter((name) =>
      isRuntimeHookVariable(name)
    ),
    conflicts,
  }
}

export function automationVariableNames(schema: AutomationSchema) {
  const names: string[] = []
  const seen = new Set<string>()
  for (const hook of automationHookItems(schema).filter(
    (candidate) => candidate.enabled
  )) {
    for (const match of hook.text.matchAll(
      /\[\[([a-zA-Z0-9_-]+)\]\]|\{([a-zA-Z0-9_-]+)\}/g
    )) {
      const name = hookVariableNameFromLabel(match[1] || match[2])
      if (!name || seen.has(name)) continue
      seen.add(name)
      names.push(name)
    }
  }
  return names
}

function collectionAliasIndex(collections: WordCollectionRecord[]) {
  const index = new Map<string, WordCollectionRecord[]>()
  for (const collection of collections) {
    const aliases = new Set([
      collection.id.toLowerCase(),
      collection.name.toLowerCase(),
      wordCollectionVariableName(collection).toLowerCase(),
    ])
    for (const alias of aliases) {
      index.set(alias, [...(index.get(alias) ?? []), collection])
    }
  }
  return index
}

function caseInsensitiveValue(
  values: Record<string, string>,
  name: string
): string | undefined {
  return Object.entries(values).find(
    ([candidate]) =>
      hookVariableNameFromLabel(candidate) === hookVariableNameFromLabel(name)
  )?.[1]
}

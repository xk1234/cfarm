export const hookCaseModes = [
  "lowercase",
  "uppercase",
  "title",
  "sentence",
  "mixed",
] as const

export type HookCaseMode = (typeof hookCaseModes)[number]

const variablePattern = /\[\[([a-zA-Z0-9_-]+)\]\]|\{([a-zA-Z0-9_-]+)\}/g

export function normalizeHookVariables(value: string) {
  return value.replace(variablePattern, (token) => token.toUpperCase())
}

export function applyHookCase(value: string, mode: HookCaseMode) {
  if (mode === "mixed") return normalizeHookVariables(value)
  let cursor = 0
  let result = ""
  for (const match of value.matchAll(variablePattern)) {
    const index = match.index ?? 0
    result += transformText(value.slice(cursor, index), mode)
    result += match[0].toUpperCase()
    cursor = index + match[0].length
  }
  result += transformText(value.slice(cursor), mode)
  return mode === "sentence" ? uppercaseFirstVisibleCharacter(result) : result
}

export function applyResolvedHookCase(value: string, mode: HookCaseMode) {
  if (mode === "mixed") return value
  const transformed = transformText(value, mode)
  return mode === "sentence"
    ? uppercaseFirstVisibleCharacter(transformed)
    : transformed
}

export function detectHookCaseMode(hooks: string[]): HookCaseMode {
  const values = hooks.map((hook) => normalizeHookVariables(hook.trim())).filter(Boolean)
  if (values.length === 0) return "mixed"
  for (const mode of ["lowercase", "uppercase", "title", "sentence"] as const) {
    if (values.every((hook) => applyHookCase(hook, mode) === hook)) return mode
  }
  return "mixed"
}

function transformText(value: string, mode: Exclude<HookCaseMode, "mixed">) {
  if (mode === "lowercase" || mode === "sentence") return value.toLowerCase()
  if (mode === "uppercase") return value.toUpperCase()
  return value
    .toLowerCase()
    .replace(/(^|[\s\-—–/([{“‘])([a-z])/g, (_, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`)
}

function uppercaseFirstVisibleCharacter(value: string) {
  return value.replace(/[a-z]/i, (letter) => letter.toUpperCase())
}

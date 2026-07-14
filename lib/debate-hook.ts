export function splitDebateHook(value: string) {
  const parts = value
    .split(/\s*\|\|\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
  return parts.length === 2 ? ([parts[0], parts[1]] as const) : null
}

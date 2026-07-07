export type UnknownRecord = Record<string, unknown>

export function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

export function cleanCollapsedWhitespace(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""
}

export function cleanString(value: string) {
  return value.trim()
}

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isLooseRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" ? (value as UnknownRecord) : null
}

export function readRecord(value: unknown): UnknownRecord | undefined {
  return isRecord(value) ? value : undefined
}

export function readLooseRecord(value: unknown): UnknownRecord | null {
  return isLooseRecord(value)
}

export function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : ""
}

export function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

export function readTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function sleepIfPositive(ms: number) {
  return ms > 0
    ? new Promise((resolve) => setTimeout(resolve, ms))
    : Promise.resolve()
}

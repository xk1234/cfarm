export const RecordQuery = {
  equal(attribute: string, values: unknown | unknown[]) {
    return query("equal", attribute, list(values))
  },
  notEqual(attribute: string, values: unknown | unknown[]) {
    return query("notEqual", attribute, list(values))
  },
  lessThan(attribute: string, value: unknown) {
    return query("lessThan", attribute, [value])
  },
  lessThanEqual(attribute: string, value: unknown) {
    return query("lessThanEqual", attribute, [value])
  },
  orderAsc(attribute: string) {
    return query("orderAsc", attribute)
  },
  orderDesc(attribute: string) {
    return query("orderDesc", attribute)
  },
  limit(value: number) {
    return query("limit", undefined, [value])
  },
  offset(value: number) {
    return query("offset", undefined, [value])
  },
  cursorAfter(id: string) {
    return query("cursorAfter", undefined, [id])
  },
} as const

function query(method: string, attribute?: string, values?: unknown[]) {
  return JSON.stringify({
    method,
    ...(attribute ? { attribute } : {}),
    ...(values ? { values } : {}),
  })
}

function list(value: unknown | unknown[]) {
  return Array.isArray(value) ? value : [value]
}

/**
 * Maps JSON Pointers (RFC 6901) and JSON.parse failures back to line/column
 * positions in the text the user pasted, so validation issues can point at
 * the exact line.
 */

export type TextLocation = { line: number; column: number; offset: number }

/** 1-based line/column for a character offset. */
export function offsetToLocation(text: string, offset: number): TextLocation {
  const clamped = Math.max(0, Math.min(offset, text.length))
  let line = 1
  let lineStart = 0
  for (let i = 0; i < clamped; i++) {
    if (text.charCodeAt(i) === 10) {
      line++
      lineStart = i + 1
    }
  }
  return { line, column: clamped - lineStart + 1, offset: clamped }
}

/** Location of a JSON.parse error, using the engine's "position N" or "line L column C" hint. */
export function jsonParseErrorLocation(text: string, error: unknown): TextLocation | null {
  const message = error instanceof Error ? error.message : String(error)
  const lineColumn = /line (\d+) column (\d+)/i.exec(message)
  if (lineColumn) {
    const line = Number(lineColumn[1])
    const column = Number(lineColumn[2])
    const lines = text.split("\n")
    let offset = 0
    for (let i = 0; i < line - 1 && i < lines.length; i++) offset += lines[i].length + 1
    return { line, column, offset: offset + column - 1 }
  }
  const position = /position (\d+)/i.exec(message)
  if (position) return offsetToLocation(text, Number(position[1]))
  if (/unexpected end/i.test(message)) return offsetToLocation(text, text.length)
  return null
}

export function decodePointer(pointer: string): string[] {
  if (!pointer || pointer === "/") return []
  return pointer
    .split("/")
    .slice(1)
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"))
}

type Cursor = { i: number }

function skipWs(text: string, c: Cursor) {
  while (c.i < text.length && /\s/.test(text[c.i])) c.i++
}

function skipString(text: string, c: Cursor): string {
  // assumes text[c.i] === '"'
  const start = c.i
  c.i++
  while (c.i < text.length) {
    const ch = text[c.i]
    if (ch === "\\") {
      c.i += 2
      continue
    }
    if (ch === '"') {
      c.i++
      break
    }
    c.i++
  }
  try {
    return JSON.parse(text.slice(start, c.i)) as string
  } catch {
    return text.slice(start + 1, c.i - 1)
  }
}

function skipValue(text: string, c: Cursor) {
  skipWs(text, c)
  const ch = text[c.i]
  if (ch === '"') {
    skipString(text, c)
    return
  }
  if (ch === "{" || ch === "[") {
    const close = ch === "{" ? "}" : "]"
    c.i++
    let depth = 1
    while (c.i < text.length && depth > 0) {
      const cur = text[c.i]
      if (cur === '"') {
        skipString(text, c)
        continue
      }
      if (cur === ch) depth++
      else if (cur === close) depth--
      c.i++
    }
    return
  }
  while (c.i < text.length && !/[\s,\]}]/.test(text[c.i])) c.i++
}

/**
 * Finds where the value at `pointer` starts in `text`. When the exact member
 * is missing (e.g. a required key), returns the deepest existing parent.
 * Returns null for unparsable input.
 */
export function locateJsonPointer(text: string, pointer: string): TextLocation | null {
  const segments = decodePointer(pointer)
  const c: Cursor = { i: 0 }
  skipWs(text, c)
  if (c.i >= text.length) return null
  let best = c.i
  for (const segment of segments) {
    skipWs(text, c)
    const ch = text[c.i]
    if (ch === "{") {
      c.i++
      let found = false
      while (c.i < text.length) {
        skipWs(text, c)
        if (text[c.i] === "}") break
        if (text[c.i] !== '"') return offsetToLocation(text, best)
        const keyStart = c.i
        const key = skipString(text, c)
        skipWs(text, c)
        if (text[c.i] === ":") c.i++
        skipWs(text, c)
        if (key === segment) {
          best = keyStart
          found = true
          break
        }
        skipValue(text, c)
        skipWs(text, c)
        if (text[c.i] === ",") c.i++
      }
      if (!found) return offsetToLocation(text, best)
    } else if (ch === "[") {
      const index = Number(segment)
      if (!Number.isInteger(index) || index < 0) return offsetToLocation(text, best)
      c.i++
      let current = 0
      let found = false
      while (c.i < text.length) {
        skipWs(text, c)
        if (text[c.i] === "]") break
        if (current === index) {
          best = c.i
          found = true
          break
        }
        skipValue(text, c)
        skipWs(text, c)
        if (text[c.i] === ",") c.i++
        current++
      }
      if (!found) return offsetToLocation(text, best)
    } else {
      return offsetToLocation(text, best)
    }
  }
  return offsetToLocation(text, best)
}

import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

export async function readJsonArrayStore<T>(input: {
  rootDir: string
  fileName: string
  key: string
  normalize?: (record: T) => T | null
}): Promise<T[]> {
  try {
    const contents = await readFile(path.join(input.rootDir, input.fileName), "utf8")
    const parsed = JSON.parse(contents) as Record<string, unknown>
    const records = parsed[input.key]
    if (!Array.isArray(records)) {
      return []
    }
    return input.normalize
      ? records.map((record) => input.normalize!(record as T)).flatMap((record) => record ? [record] : [])
      : records as T[]
  } catch {
    return []
  }
}

export async function writeJsonArrayStore<T>(input: {
  rootDir: string
  fileName: string
  key: string
  records: T[]
}) {
  await mkdir(input.rootDir, { recursive: true })
  await writeFile(path.join(input.rootDir, input.fileName), `${JSON.stringify({ [input.key]: input.records }, null, 2)}\n`)
}

import { randomUUID } from "node:crypto"
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import path from "node:path"

type JsonArrayStoreInput<T> = {
  rootDir: string
  fileName: string
  key: string
  normalize?: (record: T) => T | null
}

type JsonArrayStoreUpdate<T, R> = {
  records: T[]
  result?: R
}

const storeLocks = new Map<string, Promise<void>>()

export async function readJsonArrayStore<T>(
  input: JsonArrayStoreInput<T>
): Promise<T[]> {
  return readJsonArrayStoreUnlocked(input)
}

export async function writeJsonArrayStore<T>(input: {
  rootDir: string
  fileName: string
  key: string
  records: T[]
}) {
  const filePath = storeFilePath(input)
  await withStoreFileLock(filePath, async () => {
    await writeJsonArrayStoreUnlocked(input)
  })
}

export async function withJsonArrayStore<T, R = void>(
  input: JsonArrayStoreInput<T> & {
    update: (
      records: T[]
    ) => JsonArrayStoreUpdate<T, R> | Promise<JsonArrayStoreUpdate<T, R>>
  }
): Promise<R> {
  const filePath = storeFilePath(input)
  return withStoreFileLock(filePath, async () => {
    const records = await readJsonArrayStoreUnlocked(input)
    const next = await input.update(records)
    await writeJsonArrayStoreUnlocked({ ...input, records: next.records })
    return next.result as R
  })
}

async function readJsonArrayStoreUnlocked<T>(
  input: JsonArrayStoreInput<T>
): Promise<T[]> {
  const filePath = storeFilePath(input)
  let contents: string
  try {
    contents = await readFile(filePath, "utf8")
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return []
    }
    throw error
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(contents) as Record<string, unknown>
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse JSON store at ${filePath}: ${message}`)
  }

  const records = parsed[input.key]
  if (!Array.isArray(records)) {
    return []
  }
  return input.normalize
    ? records
        .map((record) => input.normalize!(record as T))
        .flatMap((record) => (record ? [record] : []))
    : (records as T[])
}

async function writeJsonArrayStoreUnlocked<T>(input: {
  rootDir: string
  fileName: string
  key: string
  records: T[]
}) {
  await mkdir(input.rootDir, { recursive: true })
  const filePath = storeFilePath(input)
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  const backupPath = `${filePath}.bak`
  try {
    await writeFile(
      tempPath,
      `${JSON.stringify({ [input.key]: input.records }, null, 2)}\n`
    )
    await copyFile(filePath, backupPath).catch(() => undefined)
    await rename(tempPath, filePath)
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined)
    throw error
  }
}

function storeFilePath(input: { rootDir: string; fileName: string }) {
  return path.resolve(input.rootDir, input.fileName)
}

async function withStoreFileLock<T>(
  filePath: string,
  task: () => Promise<T>
): Promise<T> {
  const previous = storeLocks.get(filePath) ?? Promise.resolve()
  const run = previous.catch(() => undefined).then(task)
  const next = run.then(
    () => undefined,
    () => undefined
  )
  storeLocks.set(filePath, next)
  await next.finally(() => {
    if (storeLocks.get(filePath) === next) {
      storeLocks.delete(filePath)
    }
  })
  return run
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}

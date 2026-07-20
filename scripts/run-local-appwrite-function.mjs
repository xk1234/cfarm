import path from "node:path"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"
import { parseEnv } from "node:util"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const functionId = process.argv[2]
const intervalMs = Number(process.argv[3])

if (!functionId || !Number.isFinite(intervalMs) || intervalMs < 1000) {
  throw new Error(
    "Usage: node scripts/run-local-appwrite-function.mjs <function-id> <interval-ms>"
  )
}

const cloud = readEnv(path.join(root, ".env"))
const local = readEnv(path.join(root, ".env.local"))
Object.assign(process.env, cloud, local, {
  APPWRITE_FUNCTION_API_ENDPOINT: local.APPWRITE_ENDPOINT,
  APPWRITE_FUNCTION_PROJECT_ID: local.APPWRITE_PROJECT_ID,
  APPWRITE_DATABASE_ID: local.APPWRITE_DATABASE_ID || "cfarm",
})

const entry = path.join(
  root,
  "appwrite",
  "functions",
  functionId,
  "src",
  "main.js"
)
if (!existsSync(entry)) throw new Error(`Unknown local function: ${functionId}`)

const handler = (await import(pathToFileURL(entry).href)).default
if (typeof handler !== "function") {
  throw new Error(`${functionId} does not export a default handler`)
}

let running = false
let stopped = false

async function tick() {
  if (running || stopped) return
  running = true
  try {
    const result = await handler({
      log: (message) => console.log(`[${functionId}] ${message}`),
      error: (message) => console.error(`[${functionId}] ${message}`),
    })
    if (result?.ok === false) process.exitCode = 1
  } catch (error) {
    console.error(
      `[${functionId}] ${error instanceof Error ? error.stack : String(error)}`
    )
    process.exitCode = 1
  } finally {
    running = false
  }
}

const timer = setInterval(() => void tick(), intervalMs)
void tick()

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopped = true
    clearInterval(timer)
    process.exit(process.exitCode ?? 0)
  })
}

function readEnv(file) {
  return existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {}
}

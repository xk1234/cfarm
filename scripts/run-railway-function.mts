import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const functionId = process.argv[2]
const intervalMs = Number(process.argv[3])

if (
  !["template-scheduler", "job-worker"].includes(functionId) ||
  !Number.isFinite(intervalMs) ||
  intervalMs < 1_000
) {
  throw new Error(
    "Usage: tsx scripts/run-railway-function.mts <template-scheduler|job-worker> <interval-ms>"
  )
}

process.env.LUMENCLIP_DATA_BACKEND ||= "railway"
process.env.LUMENCLIP_ASSET_BACKEND ||= "railway"
process.env.APPWRITE_DATABASE_ID ||= "cfarm"

const entry = path.join(
  root,
  "appwrite",
  "functions",
  functionId,
  "src",
  "main.js"
)
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
      log: (message: unknown) =>
        console.log(`[${functionId}] ${String(message)}`),
      error: (message: unknown) =>
        console.error(`[${functionId}] ${String(message)}`),
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

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopped = true
    clearInterval(timer)
    process.exit(process.exitCode ?? 0)
  })
}

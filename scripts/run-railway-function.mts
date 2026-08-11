import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import {
  flushLangfuse,
  registerLangfuse,
  shutdownLangfuse,
} from "@/lib/langfuse-node"

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

registerLangfuse(`lumenclip-${functionId}`)

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
let shuttingDown = false
let activeTick: Promise<void> | undefined

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
    await flushLangfuse().catch(() => {
      console.error(`[${functionId}] Langfuse trace flush failed`)
    })
    running = false
  }
}

function startTick() {
  if (running || stopped) return
  const pending = tick()
  activeTick = pending
  void pending.finally(() => {
    if (activeTick === pending) activeTick = undefined
  })
}

const timer = setInterval(startTick, intervalMs)
startTick()

async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  stopped = true
  clearInterval(timer)
  await activeTick?.catch(() => undefined)
  await shutdownLangfuse().catch(() => {
    console.error(`[${functionId}] Langfuse shutdown failed`)
  })
  process.exit(process.exitCode ?? 0)
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void shutdown())
}

import {
  flushLangfuse,
  registerLangfuse,
  shutdownLangfuse,
} from "@/lib/langfuse-node"
import jobWorker from "@/services/job-worker"
import templateScheduler from "@/services/template-scheduler"

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
registerLangfuse(`lumenclip-${functionId}`)

const handler = functionId === "job-worker" ? jobWorker : templateScheduler

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

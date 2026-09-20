import {
  flushLangfuse,
  registerLangfuse,
  shutdownLangfuse,
} from "@/lib/langfuse-node"
import { closeRailwayDatabase } from "@/lib/railway/database"
import jobWorker from "@/services/job-worker"
import templateScheduler from "@/services/template-scheduler"

const functionId = process.argv[2]
const once = process.argv[3] === "--once"
const check = process.argv[3] === "--check"
const intervalMs = once || check ? 5_000 : Number(process.argv[3])

if (
  !["template-scheduler", "job-worker"].includes(functionId) ||
  !Number.isFinite(intervalMs) ||
  intervalMs < 1_000
) {
  throw new Error(
    "Usage: tsx scripts/run-railway-function.ts <template-scheduler|job-worker> <interval-ms|--once|--check>"
  )
}

process.env.LUMENCLIP_DATA_BACKEND ||= "railway"
process.env.LUMENCLIP_ASSET_BACKEND ||= "railway"
const handler = functionId === "job-worker" ? jobWorker : templateScheduler
if (typeof handler !== "function")
  throw new Error(`${functionId} is not callable`)
if (check) {
  console.log(`[${functionId}] handler imports successfully`)
  process.exit(0)
}
registerLangfuse(`lumenclip-${functionId}`)

let running = false
let stopped = false
let shuttingDown = false
let activeTick: ReturnType<typeof tick> | undefined
const tickTimeoutMs = Math.max(
  30_000,
  Number(
    (functionId === "job-worker"
      ? process.env.JOB_WORKER_TICK_TIMEOUT_MS
      : process.env.SCHEDULER_TICK_TIMEOUT_MS) ??
      process.env.FUNCTION_TICK_TIMEOUT_MS ??
      (functionId === "job-worker" ? 5 * 60_000 : 20 * 60_000)
  )
)

async function tick() {
  if (running || stopped) return
  running = true
  const watchdog = setTimeout(() => {
    console.error(
      `[${functionId}] tick exceeded ${tickTimeoutMs}ms; exiting so Railway can restart the stalled worker`
    )
    process.exit(1)
  }, tickTimeoutMs)
  try {
    const result = await handler({
      log: (message: unknown) =>
        console.log(`[${functionId}] ${String(message)}`),
      error: (message: unknown) =>
        console.error(`[${functionId}] ${String(message)}`),
    })
    if (result?.ok === false) process.exitCode = 1
    return result
  } catch (error) {
    console.error(
      `[${functionId}] ${error instanceof Error ? error.stack : String(error)}`
    )
    process.exitCode = 1
  } finally {
    clearTimeout(watchdog)
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

let timer: ReturnType<typeof setInterval> | undefined

async function runOnce() {
  // Bound each cron invocation, including trace flushes and connection shutdown.
  const deadline = setTimeout(() => process.exit(1), 270_000)
  const startedAt = Date.now()
  try {
    for (let batch = 0; batch < 100 && !stopped; batch += 1) {
      const pending = tick()
      activeTick = pending
      const result = await pending
      if (activeTick === pending) activeTick = undefined
      if (
        !result?.ok ||
        !("processed" in result) ||
        (result.processed ?? 0) + (result.failed ?? 0) === 0
      )
        break
      if (Date.now() - startedAt >= 240_000) break
    }
  } finally {
    await shutdown()
    clearTimeout(deadline)
  }
}

if (once || functionId === "template-scheduler") {
  void runOnce()
} else {
  timer = setInterval(startTick, intervalMs)
  startTick()
}

async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  stopped = true
  clearInterval(timer)
  await activeTick?.catch(() => undefined)
  await closeRailwayDatabase().catch(() => {
    console.error(`[${functionId}] database shutdown failed`)
    process.exitCode = 1
  })
  await shutdownLangfuse().catch(() => {
    console.error(`[${functionId}] Langfuse shutdown failed`)
  })
  process.exit(process.exitCode ?? 0)
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void shutdown())
}

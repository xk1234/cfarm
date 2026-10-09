import "server-only"

import { PgBoss, type SendOptions, type WorkOptions } from "pg-boss"

import { serverEnv } from "@/lib/server-env"
import { logger } from "@/lib/server-logger"

let queuePromise: Promise<PgBoss> | null = null

export function railwayJobQueueEnabled() {
  return Boolean(serverEnv.DATABASE_URL)
}

/**
 * Railway-native durable queue. It is intentionally separate from the current
 * Railway worker until each worker handler is moved and parity-tested.
 */
export function getRailwayJobQueue(): Promise<PgBoss> {
  if (queuePromise) return queuePromise
  const connectionString = serverEnv.DATABASE_URL
  if (!connectionString) {
    throw new Error("Railway job queue is not configured. Set DATABASE_URL.")
  }
  queuePromise = (async () => {
    const boss = new PgBoss({
      connectionString,
      schema: serverEnv.PG_BOSS_SCHEMA ?? "lumenclip_queue",
      application_name: "lumenclip",
    })
    boss.on("error", (error) => {
      logger.error({ err: error }, "railway queue failure")
    })
    await boss.start()
    return boss
  })()
  return queuePromise
}

export async function enqueueRailwayJob<T extends object>(input: {
  name: string
  data: T
  options?: SendOptions
}) {
  const boss = await getRailwayJobQueue()
  await boss.createQueue(input.name, {
    retryLimit: input.options?.retryLimit ?? 3,
    retryDelay: input.options?.retryDelay ?? 5,
    retryBackoff: input.options?.retryBackoff ?? true,
  })
  return boss.send(input.name, input.data, input.options)
}

export async function workRailwayQueue<T extends object, R>(input: {
  name: string
  options?: WorkOptions
  handler: (data: T) => Promise<R>
}) {
  const boss = await getRailwayJobQueue()
  return boss.work<T, R>(
    input.name,
    { batchSize: 1, ...input.options },
    async (jobs) => {
      const job = jobs[0]
      if (!job) throw new Error(`Queue ${input.name} returned an empty batch.`)
      return input.handler(job.data)
    }
  )
}

export async function closeRailwayJobQueue() {
  const current = queuePromise
  queuePromise = null
  if (current) await (await current).stop({ graceful: true, timeout: 10_000 })
}

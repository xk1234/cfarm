/**
 * Railway `worker` service: one long-running process polling the Appwrite
 * `jobs` table (docs/refactor/03-appwrite-data-layer.md §4).
 *
 *   pnpm worker           run until SIGTERM/SIGINT
 *   pnpm worker --once    one sweep + one claim batch, then exit
 *   pnpm worker --check   load handlers and exit without connecting
 *
 * Optional HTTP server (WORKER_PORT, else PORT): `POST /wake` cuts the idle
 * sleep short; `GET /health` reports liveness. Env values are never printed.
 */
import { createServer } from "node:http"

import { getRepositories } from "@/lib/data"
import { registeredJobTypes } from "@/lib/jobs/handlers"
import { createWorker } from "@/lib/jobs/worker"

const args = new Set(process.argv.slice(2))

if (args.has("--check")) {
  console.log(JSON.stringify({ level: "info", message: "worker check ok", handlers: registeredJobTypes() }))
  process.exit(0)
}

const repos = getRepositories()
const worker = createWorker({
  repos,
  concurrency: Number(process.env.WORKER_CONCURRENCY) || undefined,
})

if (args.has("--once")) {
  const forcedSweep = await worker.sweep(true)
  const result = await worker.tick()
  console.log(JSON.stringify({ level: "info", message: "worker once", backend: repos.backend, forcedSweep, ...result }))
  process.exit(0)
}

const port = Number(process.env.WORKER_PORT || process.env.PORT) || 0
const server = port
  ? createServer((req, res) => {
      if (req.method === "POST" && req.url === "/wake") {
        worker.wake()
        res.writeHead(202).end()
        return
      }
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, workerId: worker.workerId }))
        return
      }
      res.writeHead(404).end()
    }).listen(port)
  : null

let signals = 0
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    signals += 1
    if (signals > 1) process.exit(1)
    worker.stop()
  })
}

await worker.run()
server?.close()
process.exit(0)

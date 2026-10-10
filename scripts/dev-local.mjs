import path from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
let stopping = false
let child = null

function stop(exitCode = 0) {
  if (stopping) return
  stopping = true
  child?.kill("SIGTERM")
  process.exit(exitCode)
}

process.on("SIGINT", () => stop(130))
process.on("SIGTERM", () => stop(143))

const envCheck = spawnSync("pnpm", ["env:check"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
})
if (envCheck.status !== 0) stop(envCheck.status ?? 1)

// `pnpm dev --port 4000` forwards its arguments to `next dev`.
child = spawn("pnpm", ["exec", "next", "dev", ...process.argv.slice(2)], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
})
child.on("exit", (code, signal) => stop(code ?? (signal ? 1 : 0)))

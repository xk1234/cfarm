import path from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
let stopping = false

function stop(exitCode = 0) {
  if (stopping) return
  stopping = true
  process.exit(exitCode)
}

process.on("SIGINT", () => stop("SIGINT", 130))
process.on("SIGTERM", () => stop("SIGTERM", 143))

const envCheck = spawnSync(
  "pnpm",
  ["env:check"],
  { cwd: root, env: process.env, stdio: "inherit" }
)
if (envCheck.status !== 0) stop("SIGTERM", envCheck.status ?? 1)

const child = spawn("pnpm", ["exec", "next", "dev"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
})
child.on("exit", (code, signal) => stop(signal || "SIGTERM", code ?? 1))

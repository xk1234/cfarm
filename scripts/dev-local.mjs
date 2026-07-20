import path from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { existsSync, rmSync } from "node:fs"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const setupScript = path.join(root, "scripts", "setup-local-appwrite.mjs")
let children = []
let stopping = false

function stop(signal = "SIGTERM", exitCode = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (!child.killed) child.kill(signal)
  }
  // The shared Appwrite stack (~/appwrite-local) stays up: other projects use
  // it too, and leaving it running is what keeps startup instant. Stop it
  // explicitly with `node ~/appwrite-local/ensure.mjs --stop` when needed.
  process.exit(exitCode)
}

process.on("SIGINT", () => stop("SIGINT", 130))
process.on("SIGTERM", () => stop("SIGTERM", 143))

const setup = spawnSync(
  process.execPath,
  [setupScript, "--ensure"],
  { cwd: root, env: process.env, stdio: "inherit" }
)

if (setup.status !== 0) {
  stop("SIGTERM", setup.status ?? 1)
}

const envCheck = spawnSync(
  "pnpm",
  ["env:check"],
  { cwd: root, env: process.env, stdio: "inherit" }
)

if (envCheck.status !== 0) {
  stop("SIGTERM", envCheck.status ?? 1)
}

// Next 16 keeps development output under `.next/dev`. If static App Router
// route files are restored while an older dev process is running, its cached
// route manifest can continue returning 404 until the process is restarted.
// Remove only the generated route manifests on startup; Turbopack's module
// cache remains intact.
const nextRouteManifests = [
  path.join(root, ".next", "app-path-routes-manifest.json"),
  path.join(root, ".next", "dev", "routes-manifest.json"),
  path.join(root, ".next", "dev", "server", "app-paths-manifest.json"),
]
if (nextRouteManifests.some((manifest) => existsSync(manifest))) {
  nextRouteManifests.forEach((manifest) => rmSync(manifest, { force: true }))
  console.log("Reset stale Next.js route manifests.")
}

children = [
  spawn(
    process.execPath,
    [
      path.join(root, "scripts", "run-local-appwrite-function.mjs"),
      "automation-scheduler",
      String(5 * 60_000),
    ],
    { cwd: root, env: process.env, stdio: "inherit" }
  ),
  spawn(
    process.execPath,
    [
      path.join(root, "scripts", "run-local-appwrite-function.mjs"),
      "job-worker",
      String(60_000),
    ],
    { cwd: root, env: process.env, stdio: "inherit" }
  ),
  spawn("pnpm", ["exec", "next", "dev"], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  }),
]

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (stopping) return
    stop(signal || "SIGTERM", code ?? (signal ? 1 : 0))
  })
}

import { execFile } from "node:child_process"
import path from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export async function buildNativeWindmillRuntime() {
  const root = path.resolve(import.meta.dirname, "..")
  await execFileAsync(
    "pnpm",
    [
      "exec",
      "esbuild",
      path.join(import.meta.dirname, "runtime", "native-stage-entry.ts"),
      "--bundle",
      "--platform=node",
      "--format=esm",
      "--target=node22",
      "--packages=external",
      "--legal-comments=none",
      `--tsconfig=${path.join(root, "tsconfig.json")}`,
      `--alias:server-only=${path.join(import.meta.dirname, "runtime", "server-only-shim.ts")}`,
      `--alias:@/lib/auth=${path.join(import.meta.dirname, "runtime", "auth-shim.ts")}`,
      `--alias:@/lib/workspace-members=${path.join(import.meta.dirname, "runtime", "workspace-members-shim.ts")}`,
      `--banner:js=${"// Generated native Windmill runtime. Do not edit by hand."}`,
      `--outfile=${path.join(import.meta.dirname, "f", "lumenclip", "workflow_stage_runtime.ts")}`,
    ],
    { cwd: root }
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await buildNativeWindmillRuntime()
}

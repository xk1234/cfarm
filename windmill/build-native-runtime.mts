import path from "node:path"
import { build } from "esbuild"

export async function buildNativeWindmillRuntime() {
  const root = path.resolve(import.meta.dirname, "..")
  await build({
    absWorkingDir: root,
    entryPoints: [
      path.join(import.meta.dirname, "runtime", "native-stage-entry.ts"),
    ],
    outfile: path.join(
      import.meta.dirname,
      "f",
      "lumenclip",
      "workflow_stage_runtime.ts"
    ),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    packages: "external",
    legalComments: "none",
    tsconfig: path.join(root, "tsconfig.json"),
    alias: {
      "server-only": path.join(
        import.meta.dirname,
        "runtime",
        "server-only-shim.ts"
      ),
      "@/lib/auth": path.join(import.meta.dirname, "runtime", "auth-shim.ts"),
      "@/lib/workspace-members": path.join(
        import.meta.dirname,
        "runtime",
        "workspace-members-shim.ts"
      ),
    },
    banner: {
      js: "// Generated native Windmill runtime. Do not edit by hand.",
    },
  })
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
) {
  await buildNativeWindmillRuntime()
}

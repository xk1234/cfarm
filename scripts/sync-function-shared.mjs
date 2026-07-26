import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import ts from "typescript"

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)
const checkOnly = process.argv.includes("--check")
const driftedTargets = []

const generatedModules = [
  {
    source: "lib/fal-client.ts",
    target: "appwrite/functions/job-worker/src/fal-client.js",
  },
  {
    source: "lib/elevenlabs-tts.ts",
    target: "appwrite/functions/job-worker/src/elevenlabs-tts.js",
  },
  {
    source: "lib/ugc-rendi-compositor.ts",
    target: "appwrite/functions/job-worker/src/ugc-rendi-compositor.js",
  },
  {
    source: "lib/ugc-automation-runner.ts",
    target: "appwrite/functions/job-worker/src/ugc-automation-runner.js",
  },
  {
    source: "lib/http.ts",
    target: "appwrite/functions/job-worker/src/http.js",
  },
  {
    source: "lib/slideshow-image-matching.ts",
    target: "appwrite/functions/job-worker/src/slideshow-image-matching.js",
    imports: {
      "@/lib/guards": "./guards.js",
      "@/lib/http": "./http.js",
      "@/lib/realfarm-generation-model-registry":
        "./realfarm-generation-model-registry.js",
    },
  },
  {
    source: "lib/openrouter.ts",
    target: "appwrite/functions/job-worker/src/openrouter.js",
    imports: { "@/lib/guards": "./guards.js" },
  },
  {
    source: "lib/slideshow-text-generation-payload.ts",
    target:
      "appwrite/functions/job-worker/src/slideshow-text-generation-payload.js",
    imports: {
      "@/lib/guards": "./guards.js",
      "@/lib/realfarm-generation-model-registry":
        "./realfarm-generation-model-registry.js",
      "@/lib/openrouter": "./openrouter.js",
      "@/lib/temp-slide-testing-shared":
        "./temp-slide-testing-shared.js",
    },
  },
  {
    source: "lib/slideshow-generation-engine.ts",
    target:
      "appwrite/functions/job-worker/src/slideshow-generation-engine.js",
    imports: {
      "@/lib/temp-slide-testing-shared":
        "./temp-slide-testing-shared.js",
      "@/lib/slideshow-text-generation-payload":
        "./slideshow-text-generation-payload.js",
      "@/lib/realfarm-generation-model-registry":
        "./realfarm-generation-model-registry.js",
      "@/lib/guards": "./guards.js",
      "@/lib/http": "./http.js",
      "@/lib/llm-slop": "./llm-slop.js",
      "@/lib/openrouter": "./openrouter.js",
    },
  },
  {
    source: "lib/ugc-video-generation.ts",
    target: "appwrite/functions/job-worker/src/ugc-video-generation.js",
    imports: {
      "@/lib/openrouter": "./openrouter.js",
      "@/lib/realfarm-generation-model-registry": "./realfarm-generation-model-registry.js",
    },
  },
  {
    source: "lib/automation-slots.ts",
    target: "appwrite/functions/automation-scheduler/src/automation-slots.js",
  },
  {
    source: "lib/guards.ts",
    target: "appwrite/functions/job-worker/src/guards.js",
  },
  {
    source: "lib/hook-casing.ts",
    target: "appwrite/functions/job-worker/src/hook-casing.js",
  },
  {
    source: "lib/hook-variables.ts",
    target: "appwrite/functions/job-worker/src/hook-variables.js",
  },
  {
    source: "lib/hook-expansion.ts",
    target: "appwrite/functions/job-worker/src/hook-expansion.js",
    imports: {
      "@/lib/guards": "./guards.js",
      "@/lib/hook-casing": "./hook-casing.js",
      "@/lib/hook-variables": "./hook-variables.js",
    },
  },
  {
    source: "lib/realfarm-slideshow-text-style-config.ts",
    target:
      "appwrite/functions/job-worker/src/realfarm-slideshow-text-style-config.js",
  },
  {
    source: "lib/realfarm-generation-model-registry.ts",
    target:
      "appwrite/functions/job-worker/src/realfarm-generation-model-registry.js",
  },
  {
    source: "lib/llm-slop.ts",
    target: "appwrite/functions/job-worker/src/llm-slop.js",
  },
  {
    source: "lib/social-post-metadata.ts",
    target: "appwrite/functions/job-worker/src/social-post-metadata.js",
    imports: { "@/lib/guards": "./guards.js" },
  },
  {
    source: "lib/temp-slide-testing-shared.ts",
    target: "appwrite/functions/job-worker/src/temp-slide-testing-shared.js",
    imports: {
      "@/lib/guards": "./guards.js",
      "@/lib/llm-slop": "./llm-slop.js",
      "@/lib/social-post-metadata": "./social-post-metadata.js",
    },
  },
  {
    source: "lib/slideshow-font-family.ts",
    target: "appwrite/functions/job-worker/src/slideshow-font-family.js",
  },
  {
    source: "lib/slideshow-renderer.ts",
    target: "appwrite/functions/job-worker/src/slideshow-renderer.js",
    imports: {
      "@/lib/guards": "./guards.js",
      "@/lib/slideshow-font-family": "./slideshow-font-family.js",
      "@/lib/realfarm-slideshow-text-style-config":
        "./realfarm-slideshow-text-style-config.js",
    },
  },
  {
    source: "lib/font-config.ts",
    target: "appwrite/functions/job-worker/src/font-config.js",
    imports: {
      "@/lib/slideshow-font-family": "./slideshow-font-family.js",
    },
  },
  {
    source: "lib/postfast-provider-controls.ts",
    target: "appwrite/functions/job-worker/src/postfast-provider-controls.js",
  },
]

for (const definition of generatedModules) {
  syncModule(definition)
}

// The bundled TTF must ship inside the job-worker tar (deploy.mjs bundles
// appwrite/functions/job-worker/. only), so mirror it next to the generated
// font-config.js and verify byte-equality in --check mode.
syncFontAsset({
  source: "assets/fonts/Inter-Variable.ttf",
  target: "appwrite/functions/job-worker/assets/fonts/Inter-Variable.ttf",
})

if (driftedTargets.length > 0) {
  throw new Error(
    `Generated Appwrite modules are out of date:\n${driftedTargets
      .map((target) => `- ${target}`)
      .join("\n")}\nRun pnpm appwrite:sync-shared.`
  )
}

function syncModule({ source, target, imports = {} }) {
  const sourcePath = path.join(repoRoot, source)
  const targetPath = path.join(repoRoot, target)
  const output = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
    fileName: sourcePath,
  })
  const withInlinedJson = inlineLocalJsonImports(output.outputText, sourcePath)
  const generated = Object.entries(imports).reduce(
    (code, [from, to]) => code.replaceAll(`from "${from}"`, `from "${to}"`),
    withInlinedJson
  )

  const expected = `// Generated from ${source}. Do not edit by hand.\n${generated}`
  if (checkOnly) {
    if (
      !fs.existsSync(targetPath) ||
      fs.readFileSync(targetPath, "utf8") !== expected
    ) {
      driftedTargets.push(target)
    }
    return
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, expected)
}

function inlineLocalJsonImports(code, sourcePath) {
  return code.replace(
    /^import\s+([A-Za-z_$][\w$]*)\s+from\s+(["'])([^"']+\.json)\2(?:\s+(?:with|assert)\s+\{[^}]*\})?;?\s*$/gm,
    (statement, localName, _quote, specifier) => {
      const jsonPath = resolveLocalJsonImport(sourcePath, specifier)
      if (!jsonPath) return statement
      const json = JSON.parse(fs.readFileSync(jsonPath, "utf8"))
      const literal = JSON.stringify(json, null, 2)
        .replaceAll("\u2028", "\\u2028")
        .replaceAll("\u2029", "\\u2029")
      return `const ${localName} = ${literal};`
    }
  )
}

function resolveLocalJsonImport(sourcePath, specifier) {
  if (specifier.startsWith("@/")) {
    return path.join(repoRoot, specifier.slice(2))
  }
  if (specifier.startsWith(".")) {
    return path.resolve(path.dirname(sourcePath), specifier)
  }
  return null
}

function syncFontAsset({ source, target }) {
  const sourcePath = path.join(repoRoot, source)
  const targetPath = path.join(repoRoot, target)
  const sourceBytes = fs.readFileSync(sourcePath)
  if (checkOnly) {
    if (
      !fs.existsSync(targetPath) ||
      !fs.readFileSync(targetPath).equals(sourceBytes)
    ) {
      driftedTargets.push(target)
    }
    return
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, sourceBytes)
}

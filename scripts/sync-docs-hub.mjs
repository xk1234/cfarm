import { existsSync } from "node:fs"
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

const repoRoot = path.resolve(import.meta.dirname, "..")
const docsHubRoot = path.resolve(
  process.env.DOCS_HUB_ROOT || "/Users/yexinkang/Desktop/docs-hub"
)
const targetRoot = path.join(docsHubRoot, "content", "docs", "cfarm")
const targetAssetsRoot = path.join(docsHubRoot, "public", "images", "cfarm")
const check = process.argv.includes("--check")
const expectedTargets = new Set()

if (!existsSync(docsHubRoot)) {
  throw new Error(`Docs hub not found: ${docsHubRoot}`)
}

const writes = []

await syncDocs()
await syncMcp()
await syncMcpMeta()
await syncPublicDocsAssets()
await checkOrRemoveStaleRootFiles()
await checkForStaleGeneratedFiles()
await checkOrRemoveStaleAssetFiles()

if (check && writes.length > 0) {
  console.error(
    [
      "docs-hub cfarm docs are out of sync. Run pnpm docs:hub:sync.",
      ...writes.map((item) => `- ${path.relative(docsHubRoot, item)}`),
    ].join("\n")
  )
  process.exitCode = 1
} else {
  console.log(
    check
      ? "docs-hub cfarm docs are in sync."
      : `Synced ${writes.length} docs-hub files.`
  )
}

async function syncDocs() {
  const sourceRoot = path.join(repoRoot, "docs")
  const entries = await listFiles(sourceRoot)
  const topLevel = new Set()
  for (const file of entries) {
    const relative = path.relative(sourceRoot, file)
    if (relative === "README.md") continue
    topLevel.add(relative.split(path.sep)[0])
  }
  for (const entry of topLevel) {
    if (!check) {
      await removeGeneratedPath(path.join(targetRoot, entry))
      await removeGeneratedPath(
        path.join(targetRoot, entry.replace(/\.mdx$/, ".md"))
      )
    }
  }
  for (const file of entries) {
    const relative = path.relative(sourceRoot, file)
    if (relative === "README.md") continue
    const target = path.join(targetRoot, relative)
    if (relative === "meta.json") {
      await syncGenerated(target, await docsHubRootMeta(file))
    } else {
      await syncFile(file, target, { docsHub: true })
    }
  }
}

async function syncMcp() {
  const sourceRoot = path.join(repoRoot, "mcp")
  const target = path.join(targetRoot, "mcp")
  if (!check) await removeGeneratedPath(target)
  for (const file of await listFiles(sourceRoot)) {
    const relative = path.relative(sourceRoot, file)
    const targetRelative =
      path.basename(relative) === "README.md"
        ? path.join(path.dirname(relative), "index.md")
        : relative
    await syncFile(file, path.join(target, targetRelative), {
      docsHub: true,
      addFrontmatter: markdownLike(file),
    })
  }
}

async function syncMcpMeta() {
  await syncGenerated(
    path.join(targetRoot, "mcp", "meta.json"),
    `${JSON.stringify(
      {
        title: "MCP reference",
        pages: [
          "index",
          "tool-index",
          "workspace",
          "templates",
          "automations",
          "collections",
          "slideshow",
          "videos",
          "social-media",
          "outputs",
          "publishing",
          "scheduling",
          "analytics",
          "exports",
          "shared-contracts",
        ],
      },
      null,
      2
    )}\n`
  )
}

async function syncPublicDocsAssets() {
  const sourceRoot = path.join(repoRoot, "public", "docs")
  if (!existsSync(sourceRoot)) return
  for (const file of await listFiles(sourceRoot)) {
    const relative = path.relative(sourceRoot, file)
    await syncFile(file, path.join(targetAssetsRoot, relative))
  }
}

async function docsHubRootMeta(source) {
  const sourceMeta = JSON.parse(await readFile(source, "utf8"))
  const pages = [...sourceMeta.pages]
  if (!pages.includes("mcp")) pages.push("mcp")
  const projectReferencePages = [
    ["project-setup", "project-setup.md"],
    ["design-system", "design-system.md"],
    ["browser-test-setup", "browser-test-setup.md"],
  ].filter(([, file]) => existsSync(path.join(targetRoot, file)))
  if (projectReferencePages.length > 0) {
    pages.push("---Project reference---")
    pages.push(...projectReferencePages.map(([page]) => page))
  }
  return `${JSON.stringify({ ...sourceMeta, pages }, null, 2)}\n`
}

async function syncFile(source, target, options = {}) {
  expectedTargets.add(path.resolve(target))
  if (markdownLike(source)) {
    let text = await readFile(source, "utf8")
    if (options.docsHub) text = toDocsHubText(text)
    if (options.addFrontmatter) text = ensureFrontmatter(text)
    await syncGenerated(target, text)
    return
  }
  const current = existsSync(target) ? await readFile(target) : null
  const next = await readFile(source)
  if (!current || !current.equals(next)) {
    writes.push(target)
    if (!check) {
      await mkdir(path.dirname(target), { recursive: true })
      await cp(source, target)
    }
  }
}

async function syncGenerated(target, next) {
  expectedTargets.add(path.resolve(target))
  const current = existsSync(target) ? await readFile(target, "utf8") : null
  if (current !== next) {
    writes.push(target)
    if (!check) {
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, next)
    }
  }
}

async function removeGeneratedPath(target) {
  if (!existsSync(target)) return
  writes.push(target)
  if (!check) await rm(target, { recursive: true, force: true })
}

async function checkForStaleGeneratedFiles() {
  if (!check) return
  for (const root of [
    path.join(targetRoot, "automations"),
    path.join(targetRoot, "mcp"),
  ]) {
    if (!existsSync(root)) continue
    for (const file of await listFiles(root)) {
      if (!expectedTargets.has(path.resolve(file))) writes.push(file)
    }
  }
}

async function checkOrRemoveStaleRootFiles() {
  const preservedRootFiles = new Set([
    "project-setup.md",
    "design-system.md",
    "browser-test-setup.md",
    "ui-ux-audit-2026-07.md",
  ])
  if (!existsSync(targetRoot)) return
  const entries = await readdir(targetRoot, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const file = path.join(targetRoot, entry.name)
    if (expectedTargets.has(path.resolve(file))) continue
    if (preservedRootFiles.has(entry.name)) continue
    writes.push(file)
    if (!check) await rm(file, { force: true })
  }
}

async function checkOrRemoveStaleAssetFiles() {
  if (!existsSync(targetAssetsRoot)) return
  for (const file of await listFiles(targetAssetsRoot)) {
    if (expectedTargets.has(path.resolve(file))) continue
    writes.push(file)
    if (!check) await rm(file, { force: true })
  }
}

async function listFiles(root) {
  const out = []
  const entries = await import("node:fs/promises").then((fs) =>
    fs.readdir(root, { withFileTypes: true })
  )
  for (const entry of entries) {
    const file = path.join(root, entry.name)
    if (entry.isDirectory()) out.push(...(await listFiles(file)))
    else if (entry.isFile()) out.push(file)
  }
  return out.sort()
}

function toDocsHubText(text) {
  return text
    .replaceAll("../docs/", "../")
    .replaceAll("[../../e2e/README.md](../../e2e/README.md)", "`e2e/README.md`")
    .replaceAll("../README.md", "/cfarm/project-setup")
    .replaceAll("../DESIGN.md", "/cfarm/design-system")
    .replaceAll("../../../mcp/README.md", "../../mcp/index.md")
    .replaceAll(
      /\/docs\/([^)\s"']+\.(?:png|jpg|jpeg|webp|gif))/gi,
      "/images/cfarm/$1"
    )
    .replaceAll("/docs", "/cfarm")
    .replaceAll("README.md", "index.md")
    .replaceAll(/^import\s+.*\s+from\s+["']@\/.*["']\s*\n+/gm, "")
    .replaceAll(
      /^\s*<([A-Z][A-Za-z0-9_]*)\s*\/>\s*$/gm,
      "\n> Interactive preview is available in the app docs only.\n"
    )
}

function ensureFrontmatter(text) {
  if (text.startsWith("---\n")) return text
  const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() || "Reference"
  return `---\ntitle: ${JSON.stringify(title)}\n---\n\n${text}`
}

function markdownLike(file) {
  return file.endsWith(".md") || file.endsWith(".mdx")
}

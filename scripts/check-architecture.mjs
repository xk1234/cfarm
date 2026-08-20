import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const sourceRoots = [
  "app",
  "components",
  "features",
  "lib",
  "services",
  "windmill",
]
const ignoredDirectories = new Set(["node_modules", ".next", ".git", ".vercel"])
const sourcePattern = /\.(?:ts|tsx|mts)$/
const testPattern = /(?:\.test\.|\.spec\.)/
const generatedRuntime = path.normalize(
  path.join(root, "windmill/f/lumenclip/workflow_stage_runtime.ts")
)

const files = sourceRoots.flatMap((directory) =>
  collect(path.join(root, directory))
)
const sourceFiles = new Set(files)
const graph = new Map(files.map((file) => [file, importsFor(file)]))
const failures = []

for (const cycle of dependencyCycles(graph)) {
  failures.push(
    `Dependency cycle: ${cycle.map((file) => path.relative(root, file)).join(" -> ")}`
  )
}

for (const file of files) {
  const relative = path.relative(root, file)
  const imports = graph.get(file) ?? []
  if (relative.includes(`${path.sep}domain${path.sep}`)) {
    const violation = imports.find((dependency) => {
      const target = path.relative(root, dependency)
      return (
        target.startsWith(`app${path.sep}`) ||
        target.startsWith(`components${path.sep}`) ||
        target.includes(`${path.sep}server${path.sep}`) ||
        target.includes(`${path.sep}ui${path.sep}`)
      )
    })
    if (violation) {
      failures.push(
        `Domain boundary: ${relative} imports ${path.relative(root, violation)}`
      )
    }
  }
  if (
    relative.includes(`${path.sep}server${path.sep}`) ||
    relative.startsWith(`lib${path.sep}`) ||
    relative.startsWith(`services${path.sep}`)
  ) {
    const violation = imports.find((dependency) => {
      const target = path.relative(root, dependency)
      return (
        target.startsWith(`app${path.sep}`) ||
        target.startsWith(`components${path.sep}`) ||
        target.includes(`${path.sep}ui${path.sep}`)
      )
    })
    if (violation) {
      failures.push(
        `Server boundary: ${relative} imports ${path.relative(root, violation)}`
      )
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"))
  process.exitCode = 1
} else {
  console.log(
    `Architecture check passed (${files.length} production modules, no cycles).`
  )
}

function collect(directory) {
  if (!fs.existsSync(directory)) return []
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...collect(target))
    } else if (
      sourcePattern.test(entry.name) &&
      !testPattern.test(entry.name) &&
      path.normalize(target) !== generatedRuntime
    ) {
      files.push(path.normalize(target))
    }
  }
  return files
}

function importsFor(file) {
  const source = fs.readFileSync(file, "utf8")
  const patterns = [
    /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/g,
  ]
  const imports = []
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const resolved = resolveImport(file, match[1])
      if (resolved) imports.push(resolved)
    }
  }
  return [...new Set(imports)]
}

function resolveImport(from, specifier) {
  let base
  if (specifier.startsWith("@/")) {
    base = path.join(root, specifier.slice(2))
  } else if (specifier.startsWith(".")) {
    base = path.resolve(path.dirname(from), specifier)
  } else {
    return null
  }
  const extensionless = base.replace(/\.(?:js|mjs)$/, "")
  const candidates = [
    base,
    extensionless,
    `${extensionless}.ts`,
    `${extensionless}.tsx`,
    `${extensionless}.mts`,
    path.join(extensionless, "index.ts"),
    path.join(extensionless, "index.tsx"),
  ]
  return (
    candidates
      .map(path.normalize)
      .find((candidate) => sourceFiles.has(candidate)) ?? null
  )
}

function dependencyCycles(dependencies) {
  let nextIndex = 0
  const stack = []
  const onStack = new Set()
  const indexByFile = new Map()
  const lowLinkByFile = new Map()
  const cycles = []

  function visit(file) {
    indexByFile.set(file, nextIndex)
    lowLinkByFile.set(file, nextIndex)
    nextIndex += 1
    stack.push(file)
    onStack.add(file)

    for (const dependency of dependencies.get(file) ?? []) {
      if (!indexByFile.has(dependency)) {
        visit(dependency)
        lowLinkByFile.set(
          file,
          Math.min(lowLinkByFile.get(file), lowLinkByFile.get(dependency))
        )
      } else if (onStack.has(dependency)) {
        lowLinkByFile.set(
          file,
          Math.min(lowLinkByFile.get(file), indexByFile.get(dependency))
        )
      }
    }

    if (lowLinkByFile.get(file) !== indexByFile.get(file)) return
    const component = []
    let dependency
    do {
      dependency = stack.pop()
      onStack.delete(dependency)
      component.push(dependency)
    } while (dependency !== file)
    if (component.length > 1) cycles.push(component)
  }

  for (const file of dependencies.keys()) {
    if (!indexByFile.has(file)) visit(file)
  }
  return cycles
}

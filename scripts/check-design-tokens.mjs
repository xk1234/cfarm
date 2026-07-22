import { readdir, readFile } from "node:fs/promises"
import { extname, join, relative } from "node:path"

const roots = ["components", "app"]
const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx", ".css"])
const checks = [
  { name: "raw hex color", pattern: /#[\da-fA-F]{3,8}\b/g },
  { name: "arbitrary radius", pattern: /rounded-\[[^\]]+\]/g },
  { name: "arbitrary pixel text", pattern: /text-\[[\d.]+px\]/g },
]

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name)
      return entry.isDirectory()
        ? sourceFiles(path)
        : sourceExtensions.has(extname(entry.name))
          ? [path]
          : []
    })
  )
  return nested.flat()
}

const violations = []
for (const root of roots) {
  for (const file of await sourceFiles(root)) {
    const lines = (await readFile(file, "utf8")).split("\n")
    lines.forEach((line, index) => {
      for (const check of checks) {
        for (const match of line.matchAll(check.pattern)) {
          violations.push({
            file: relative(process.cwd(), file),
            line: index + 1,
            name: check.name,
            value: match[0],
          })
        }
      }
    })
  }
}

for (const violation of violations) {
  console.warn(
    `WARN ${violation.file}:${violation.line} ${violation.name}: ${violation.value}`
  )
}

const totals = Object.fromEntries(
  checks.map((check) => [
    check.name,
    violations.filter((violation) => violation.name === check.name).length,
  ])
)
console.log(
  `Design token guard: ${violations.length} warning(s) ` +
    `(${totals["raw hex color"]} raw hex, ` +
    `${totals["arbitrary radius"]} arbitrary radius, ` +
    `${totals["arbitrary pixel text"]} arbitrary pixel text).`
)
if (process.argv.includes("--strict") && violations.length > 0) process.exitCode = 1

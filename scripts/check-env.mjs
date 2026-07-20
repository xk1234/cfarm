import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"

const root = process.cwd()
const verbose = process.argv.includes("--verbose")
const pruneUnused = process.argv.includes("--prune-unused")
const requiredLocal = new Set([
  "APPWRITE_ENDPOINT",
  "APPWRITE_PROJECT_ID",
  "APPWRITE_API_KEY",
  "APPWRITE_DATABASE_ID",
  "OPENROUTER_API_KEY",
])
const runtimeProvided = new Set([
  "NODE_ENV",
  "NEXT_PHASE",
  "NEXT_RUNTIME",
  "APPWRITE_FUNCTION_API_ENDPOINT",
  "APPWRITE_FUNCTION_PROJECT_ID",
  "BATCH",
  "LEASE_MS",
  "LOOKBACK_MINUTES",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "BASE_URL",
  "LUMENCLIP_SESSION_COOKIE",
  "X_EVAL_GENERATIONS",
  "UGC_COLLECTION_OWNER_EMAIL",
  "UGC_VIDEO_ANALYSIS_MODEL",
  "UGC_VIDEO_SOURCE_FILE",
])
const scanTargets = [
  "app",
  "lib",
  "scripts",
  "appwrite",
  "proxy.ts",
  "vitest.setup.ts",
]
const sourceExtensions = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx"])

const actualEnv = loadActualEnvironment(root)
const documentedEnv = parseEnvFile(path.join(root, ".env.example"))
const usedEnv = findUsedEnvironmentVariables(root)

const missingRequired = sortedDifference(requiredLocal, actualEnv.setKeys)
const undocumented = sortedDifference(
  usedEnv,
  new Set([...documentedEnv.keys, ...runtimeProvided])
)
const missingOptional = sortedDifference(
  new Set([...documentedEnv.keys].filter((key) => !requiredLocal.has(key))),
  actualEnv.setKeys
)
const unusedLocal = sortedDifference(actualEnv.keys, usedEnv)

if (pruneUnused && unusedLocal.length > 0) {
  pruneEnvironmentFiles(root, actualEnv.files, new Set(unusedLocal))
  console.log(`Removed unused local variables: ${unusedLocal.join(", ")}`)
}

if (missingRequired.length > 0) {
  printList("Missing required local variables", missingRequired)
  process.exitCode = 1
}

if (undocumented.length > 0) {
  console.warn(
    `Optional code variables missing from .env.example: ${undocumented.join(", ")}`
  )
}

if (missingRequired.length === 0 && undocumented.length === 0) {
  console.log("Environment check passed")
}

if (verbose) {
  console.log(`Environment source: ${actualEnv.files.join(", ") || "none"}`)
  console.log(`Code-referenced variables: ${usedEnv.size}`)
  console.log(`Locally declared variables: ${actualEnv.keys.size}`)
  console.log(`Locally populated variables: ${actualEnv.setKeys.size}`)
  printList("Optional variables not set locally", missingOptional)
  printList("Locally declared but unused variables", unusedLocal)
}

function loadActualEnvironment(directory) {
  const mode = process.env.NODE_ENV || "development"
  const candidates = [
    ".env",
    `.env.${mode}`,
    ...(mode === "test" ? [] : [".env.local"]),
    `.env.${mode}.local`,
  ]
  const files = candidates.filter((file) =>
    existsSync(path.join(directory, file))
  )
  const states = new Map()
  for (const file of files) {
    for (const [key, populated] of parseEnvFile(path.join(directory, file))
      .states) {
      states.set(key, populated)
    }
  }
  const populatedRuntimeKeys = Object.entries(process.env)
    .filter(([, value]) => Boolean(value?.trim()))
    .map(([key]) => key)
  return {
    files,
    keys: new Set(states.keys()),
    setKeys: new Set([
      ...[...states].filter(([, populated]) => populated).map(([key]) => key),
      ...populatedRuntimeKeys,
    ]),
  }
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return { keys: new Set(), states: new Map() }
  }
  const keys = new Set()
  const states = new Map()
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)
    if (match?.[1]) {
      keys.add(match[1])
      const rawValue = line.slice(line.indexOf("=") + 1).trim()
      states.set(
        match[1],
        rawValue.length > 0 && rawValue !== '""' && rawValue !== "''"
      )
    }
  }
  return { keys, states }
}

function findUsedEnvironmentVariables(directory) {
  const keys = new Set()
  for (const target of scanTargets) {
    const absoluteTarget = path.join(directory, target)
    if (!existsSync(absoluteTarget)) {
      continue
    }
    for (const file of sourceFiles(absoluteTarget)) {
      const source = readFileSync(file, "utf8")
      for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
        keys.add(match[1])
      }
      for (const match of source.matchAll(
        /process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g
      )) {
        keys.add(match[1])
      }
    }
  }
  return keys
}

function sourceFiles(target) {
  if (statSync(target).isFile()) {
    return sourceExtensions.has(path.extname(target)) ? [target] : []
  }
  return readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    if (
      entry.name === "node_modules" ||
      entry.name === ".next" ||
      entry.name === ".local"
    ) {
      return []
    }
    return sourceFiles(path.join(target, entry.name))
  })
}

function sortedDifference(left, right) {
  return [...left].filter((key) => !right.has(key)).sort()
}

function printList(label, keys) {
  if (keys.length === 0) {
    console.log(`${label}: none`)
    return
  }
  console.log(`${label}: ${keys.join(", ")}`)
}

function pruneEnvironmentFiles(directory, files, keys) {
  for (const file of files) {
    const filePath = path.join(directory, file)
    const source = readFileSync(filePath, "utf8")
    const lines = source.split(/\r?\n/)
    const next = lines.filter((line) => {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)
      return !match?.[1] || !keys.has(match[1])
    })
    if (next.length !== lines.length) {
      writeFileSync(filePath, next.join("\n"), "utf8")
    }
  }
}

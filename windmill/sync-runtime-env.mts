import { execFile, execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const root = path.resolve(import.meta.dirname, "..")
const commonGitDirectory = execFileSync(
  "git",
  ["rev-parse", "--path-format=absolute", "--git-common-dir"],
  { cwd: root, encoding: "utf8" }
).trim()
const primaryCheckout = path.dirname(commonGitDirectory)

for (const directory of [primaryCheckout, root]) {
  for (const file of [".env", ".env.local"]) {
    const target = path.join(directory, file)
    if (existsSync(target)) process.loadEnvFile(target)
  }
}

const allowed = [
  "APPWRITE_API_KEY",
  "APPWRITE_DATABASE_ID",
  "APPWRITE_ENDPOINT",
  "APPWRITE_PROJECT_ID",
  "BASE_URL",
  "DATABASE_URL",
  "DEEPL_KEY",
  "ELEVENLABS_API_KEY",
  "ENABLE_GENERATION_CHAIN",
  "ENABLE_UGC_AUTOMATION",
  "EXA_API_KEY",
  "FAL_KEY",
  "KIE_KEY",
  "LUMENCLIP_ASSET_BACKEND",
  "LUMENCLIP_DATA_BACKEND",
  "LUMENCLIP_SYSTEM_OWNER_ID",
  "OPENROUTER_API_KEY",
  "POSTFAST_API_KEY",
  "POSTGRES_POOL_SIZE",
  "POST_REPOSITORY_READ_MODE",
  "POST_REPOSITORY_WRITE_MODE",
  "RAILWAY_BUCKET_ACCESS_KEY_ID",
  "RAILWAY_BUCKET_ENDPOINT",
  "RAILWAY_BUCKET_NAME",
  "RAILWAY_BUCKET_REGION",
  "RAILWAY_BUCKET_SECRET_ACCESS_KEY",
  "RENDI_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "WINDMILL_BASE_URL",
  "WINDMILL_TOKEN",
  "WINDMILL_WORKSPACE_ID",
] as const

let railwayEnvironment: Record<string, string> = {}
try {
  const captureScript = `const names=${JSON.stringify(allowed)};process.stdout.write(JSON.stringify(Object.fromEntries(names.flatMap(name=>process.env[name] ? [[name,process.env[name]]] : []))))`
  const payload = JSON.parse(
    execFileSync("railway", ["run", "node", "-e", captureScript], {
      cwd: primaryCheckout,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
  ) as unknown
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    railwayEnvironment = Object.fromEntries(
      Object.entries(payload).flatMap(([name, value]) =>
        typeof value === "string" && value.trim() ? [[name, value.trim()]] : []
      )
    )
  }
} catch {
  // Local-only setup can still sync from checked-out env files.
}

if (railwayEnvironment.DATABASE_URL) {
  const databaseUrl = new URL(railwayEnvironment.DATABASE_URL)
  if (databaseUrl.hostname.endsWith(".railway.internal")) {
    try {
      const payload = JSON.parse(
        execFileSync(
          "railway",
          ["tcp-proxy", "list", "--service", "Postgres", "--json"],
          {
            cwd: primaryCheckout,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
          }
        )
      ) as { proxies?: Array<{ domain?: string; proxyPort?: number }> }
      const proxy = payload.proxies?.[0]
      if (proxy?.domain && proxy.proxyPort) {
        databaseUrl.hostname = proxy.domain
        databaseUrl.port = String(proxy.proxyPort)
        railwayEnvironment.DATABASE_URL = databaseUrl.toString()
      }
    } catch {
      // Keep the service-private URL for same-project deployments.
    }
  }
}

const runtimeEnvironment = Object.fromEntries(
  allowed.flatMap((name) => {
    const value = railwayEnvironment[name] || process.env[name]?.trim()
    return value ? [[name, value]] : []
  })
)

const legacyProjectId = process.env.APPWRITE_FUNCTION_PROJECT_ID?.trim()
if (!runtimeEnvironment.APPWRITE_PROJECT_ID && legacyProjectId) {
  runtimeEnvironment.APPWRITE_PROJECT_ID = legacyProjectId
}
// Windmill is now the sole UGC executor. Keep its native runtime enabled even
// when a legacy Appwrite/Railway service still carries the old kill-switch.
runtimeEnvironment.ENABLE_UGC_AUTOMATION = "true"
runtimeEnvironment.WINDMILL_BASE_URL ??=
  "https://windmill-server-production-5856.up.railway.app"
runtimeEnvironment.WINDMILL_WORKSPACE_ID ??= "main"

for (const required of [
  "APPWRITE_API_KEY",
  "APPWRITE_ENDPOINT",
  "APPWRITE_PROJECT_ID",
  "OPENROUTER_API_KEY",
]) {
  if (!runtimeEnvironment[required]) {
    throw new Error(
      `Cannot sync Windmill runtime environment: ${required} is missing`
    )
  }
}

await execFileAsync(
  "wmill",
  [
    "variable",
    "add",
    JSON.stringify(runtimeEnvironment),
    "f/lumenclip/runtime_env_json",
    "--secret",
    "--yes",
    "--description",
    "Secret environment for native LumenClip workflow stages. Managed by windmill/sync-runtime-env.mts.",
  ],
  { cwd: path.join(root, "windmill") }
)

console.log(
  `Synced f/lumenclip/runtime_env_json with ${Object.keys(runtimeEnvironment).length} named values.`
)

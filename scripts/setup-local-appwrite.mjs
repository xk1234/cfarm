import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { parseEnv } from "node:util"
import { Client, TablesDB } from "node-appwrite"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const localEnvPath = path.join(root, ".env.local")
const cloudEnvPath = path.join(root, ".env")
// The local backend is the machine-wide shared Appwrite stack (one instance,
// one project per app). See ~/appwrite-local/README.md.
const sharedStackDir = path.join(os.homedir(), "appwrite-local")
const sharedEnsureScript = path.join(sharedStackDir, "ensure.mjs")
const sharedBootstrapPath = path.join(sharedStackDir, "bootstrap.json")
const localHttpPort = 9080
const localEndpoint = `http://localhost:${localHttpPort}/v1`
const localProjectId = "cfarm-local"
const databaseId = "cfarm"
const ensureOnly = process.argv.includes("--ensure")
const rotateKey = process.argv.includes("--rotate-key")
const stopOnly = process.argv.includes("--stop")
const skipReferenceSync = process.argv.includes("--skip-reference-sync")

process.on("SIGINT", () => process.exit(130))
process.on("SIGTERM", () => process.exit(143))

const apiScopes = [
  "users.read",
  "users.write",
  "sessions.read",
  "sessions.write",
  "teams.read",
  "teams.write",
  "databases.read",
  "databases.write",
  "collections.read",
  "collections.write",
  "attributes.read",
  "attributes.write",
  "indexes.read",
  "indexes.write",
  "documents.read",
  "documents.write",
  "tables.read",
  "tables.write",
  "columns.read",
  "columns.write",
  "rows.read",
  "rows.write",
  "files.read",
  "files.write",
  "buckets.read",
  "buckets.write",
  "functions.read",
  "functions.write",
  "execution.read",
  "execution.write",
]

if (stopOnly) {
  // Stopping the shared stack affects every project using it; only do this
  // when asked explicitly.
  run(process.execPath, [sharedEnsureScript, "--stop"], process.env)
  process.exit(0)
}

await ensureDockerStack()

const cloudEnv = readEnvFile(cloudEnvPath)
let localEnv = readEnvFile(localEnvPath)
let ready = await localBackendReady(localEnv)

if (!ready) {
  localEnv = await ensureLocalProject(localEnv)
  writeLocalEnvironment(localEnv)
} else if (rotateKey) {
  localEnv = await ensureLocalProject({
    ...localEnv,
    APPWRITE_API_KEY: "",
  })
  writeLocalEnvironment(localEnv)
}

if (ensureOnly && ready) {
  console.log("Local Appwrite is ready.")
  process.exit(0)
}

requireCloudSource(cloudEnv)
run(
  process.execPath,
  [path.join(root, "scripts", "clone-appwrite-schema.mjs")],
  runtimeEnvironment(cloudEnv, localEnv)
)
run(
  process.execPath,
  [path.join(root, "scripts", "provision-consolidated-stores.mjs")],
  runtimeEnvironment(cloudEnv, localEnv)
)
if (!skipReferenceSync) {
  run(
    process.execPath,
    [path.join(root, "scripts", "sync-local-reference-data.mjs")],
    runtimeEnvironment(cloudEnv, localEnv)
  )
}

ready = await localBackendReady(localEnv)
if (!ready)
  throw new Error("Local Appwrite setup completed but verification failed.")

console.log(
  skipReferenceSync
    ? "Local Appwrite schema is ready (reference sync skipped)."
    : "Local Appwrite schema and reference data are ready."
)

async function ensureDockerStack() {
  if (!existsSync(sharedEnsureScript)) {
    throw new Error(
      `The shared Appwrite stack is missing (${sharedEnsureScript}). See ~/appwrite-local/README.md.`
    )
  }
  run(process.execPath, [sharedEnsureScript], process.env)
}

async function localBackendReady(env) {
  if (
    env.APPWRITE_ENDPOINT !== localEndpoint ||
    env.APPWRITE_PROJECT_ID !== localProjectId ||
    !env.APPWRITE_API_KEY
  ) {
    return false
  }

  try {
    const client = new Client()
      .setEndpoint(localEndpoint)
      .setProject(localProjectId)
      .setKey(env.APPWRITE_API_KEY)
    const tables = new TablesDB(client)
    await Promise.all([
      tables.getTable(databaseId, "automations"),
      tables.getTable(databaseId, "jobs"),
      tables.getTable(databaseId, "outputs"),
    ])
    return true
  } catch {
    return false
  }
}

async function ensureLocalProject(existing) {
  if (existing.APPWRITE_API_KEY) {
    try {
      const client = new Client()
        .setEndpoint(localEndpoint)
        .setProject(localProjectId)
        .setKey(existing.APPWRITE_API_KEY)
      await new TablesDB(client).listTables(databaseId)
      return {
        ...existing,
        APPWRITE_ENDPOINT: localEndpoint,
        APPWRITE_PROJECT_ID: localProjectId,
        APPWRITE_DATABASE_ID: databaseId,
        ENABLE_LOCAL_AUTOMATION_WORKER: "true",
      }
    } catch {
      // The stored local key is missing or invalid; create a replacement below.
    }
  }

  const sharedCredentials = existsSync(sharedBootstrapPath)
    ? JSON.parse(readFileSync(sharedBootstrapPath, "utf8"))
    : {}
  const consoleEmail =
    process.env.LOCAL_APPWRITE_CONSOLE_EMAIL ||
    sharedCredentials.email ||
    "lab@local.test"
  const consolePassword =
    process.env.LOCAL_APPWRITE_CONSOLE_PASSWORD ||
    sharedCredentials.password ||
    "cfarm-local-console"
  let cookie = ""

  async function consoleApi(method, pathname, body) {
    const response = await fetch(`${localEndpoint}${pathname}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-appwrite-project": "console",
        "x-appwrite-response-format": "1.9.5",
        ...(cookie ? { cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const session = response.headers
      .getSetCookie?.()
      .find((value) => value.startsWith("a_session_console="))
    if (session) cookie = session.split(";", 1)[0]
    const text = await response.text()
    let payload
    try {
      payload = text ? JSON.parse(text) : {}
    } catch {
      payload = { message: text }
    }
    return { response, payload }
  }

  let login = await consoleApi("POST", "/account/sessions/email", {
    email: consoleEmail,
    password: consolePassword,
  })
  if (login.response.status !== 201) {
    const account = await consoleApi("POST", "/account", {
      userId: "cfarmlocalroot",
      email: consoleEmail,
      password: consolePassword,
      name: "LumenClip Local",
    })
    if (![201, 409, 501].includes(account.response.status)) {
      throw new Error(
        `Could not create the local Appwrite console account (${account.response.status}): ${account.payload.message ?? "unknown error"}`
      )
    }
    login = await consoleApi("POST", "/account/sessions/email", {
      email: consoleEmail,
      password: consolePassword,
    })
  }
  if (login.response.status !== 201) {
    throw new Error(
      `Could not sign into the local Appwrite console (${login.response.status}). Set LOCAL_APPWRITE_CONSOLE_EMAIL and LOCAL_APPWRITE_CONSOLE_PASSWORD.`
    )
  }

  const teams = await consoleApi("GET", "/teams")
  const teamId = teams.payload.teams?.[0]?.$id
  if (!teamId) throw new Error("The local Appwrite console has no team.")

  const current = await consoleApi("GET", `/projects/${localProjectId}`)
  if (current.response.status === 404) {
    const created = await consoleApi("POST", "/projects", {
      projectId: localProjectId,
      name: "LumenClip Local",
      teamId,
      region: "default",
    })
    if (created.response.status !== 201) {
      throw new Error(
        `Could not create local Appwrite project (${created.response.status}): ${created.payload.message ?? "unknown error"}`
      )
    }
  } else if (!current.response.ok) {
    throw new Error(
      `Could not read local Appwrite project (${current.response.status}).`
    )
  }

  const key = await consoleApi("POST", `/projects/${localProjectId}/keys`, {
    keyId: `cfarmserver${Date.now()}`,
    name: "cfarm-server",
    scopes: apiScopes,
  })
  if (key.response.status !== 201 || !key.payload.secret) {
    throw new Error(
      `Could not create local Appwrite API key (${key.response.status}): ${key.payload.message ?? "unknown error"}`
    )
  }

  const keys = await consoleApi("GET", `/projects/${localProjectId}/keys`)
  if (keys.response.ok) {
    for (const existingKey of keys.payload.keys ?? []) {
      if (
        existingKey.name === "cfarm-server" &&
        existingKey.$id !== key.payload.$id
      ) {
        await consoleApi(
          "DELETE",
          `/projects/${localProjectId}/keys/${existingKey.$id}`
        )
      }
    }
  }

  return {
    ...existing,
    APPWRITE_ENDPOINT: localEndpoint,
    APPWRITE_PROJECT_ID: localProjectId,
    APPWRITE_API_KEY: key.payload.secret,
    APPWRITE_DATABASE_ID: databaseId,
    ENABLE_LOCAL_AUTOMATION_WORKER: "true",
  }
}

function writeLocalEnvironment(env) {
  const keys = [
    "APPWRITE_ENDPOINT",
    "APPWRITE_PROJECT_ID",
    "APPWRITE_API_KEY",
    "APPWRITE_DATABASE_ID",
    "ENABLE_LOCAL_AUTOMATION_WORKER",
  ]
  const previous = existsSync(localEnvPath)
    ? readFileSync(localEnvPath, "utf8")
    : ""
  const retained = previous
    .split(/\r?\n/)
    .filter(
      (line) =>
        !keys.some((key) =>
          new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`).test(line)
        )
    )
    .join("\n")
    .trimEnd()
  const generated = keys.map((key) => `${key}=${JSON.stringify(env[key])}`)
  writeFileSync(
    localEnvPath,
    `${retained ? `${retained}\n\n` : ""}# Managed by scripts/setup-local-appwrite.mjs\n${generated.join("\n")}\n`,
    { mode: 0o600 }
  )
}

function runtimeEnvironment(cloud, local) {
  return {
    ...process.env,
    ...cloud,
    APPWRITE_ENDPOINT: localEndpoint,
    APPWRITE_PROJECT_ID: localProjectId,
    APPWRITE_API_KEY: local.APPWRITE_API_KEY,
    APPWRITE_DATABASE_ID: databaseId,
    ENABLE_LOCAL_AUTOMATION_WORKER: "true",
    SRC_APPWRITE_ENDPOINT: cloud.APPWRITE_ENDPOINT,
    SRC_APPWRITE_PROJECT_ID: cloud.APPWRITE_PROJECT_ID,
    SRC_APPWRITE_API_KEY: cloud.APPWRITE_API_KEY,
  }
}

function requireCloudSource(env) {
  const missing = [
    "APPWRITE_ENDPOINT",
    "APPWRITE_PROJECT_ID",
    "APPWRITE_API_KEY",
  ].filter((key) => !env[key])
  if (missing.length > 0) {
    throw new Error(
      `The cloud schema source is missing from .env: ${missing.join(", ")}`
    )
  }
  if (env.APPWRITE_ENDPOINT === localEndpoint) {
    throw new Error(
      ".env must retain the cloud APPWRITE_* values; local overrides belong in .env.local."
    )
  }
}

function readEnvFile(file) {
  if (!existsSync(file)) return {}
  return parseEnv(readFileSync(file, "utf8"))
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

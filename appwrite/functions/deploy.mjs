// Self-contained deploy for the LumenClip Appwrite Functions (template-scheduler + job-worker).
// Usage (from repo root):
//   APPWRITE_ENDPOINT=... APPWRITE_PROJECT_ID=... APPWRITE_API_KEY=... \
//   APPWRITE_DATABASE_ID=cfarm node appwrite/functions/deploy.mjs
//
// Creates/updates each function, sets its variables (incl. APPWRITE_API_KEY so the
// function can reach TablesDB), uploads a code deployment, and waits for the build.
// Requires `node-appwrite`.
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { fileURLToPath } from "node:url"
import { execFileSync, execSync } from "node:child_process"
import { Client, Functions } from "node-appwrite"
import { InputFile } from "node-appwrite/file"

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "..", "..")
const productionEnvPath = path.join(repoRoot, ".env")
if (
  (!process.env.APPWRITE_ENDPOINT ||
    !process.env.APPWRITE_PROJECT_ID ||
    !process.env.APPWRITE_API_KEY) &&
  fs.existsSync(productionEnvPath)
) {
  process.loadEnvFile(productionEnvPath)
}

const ENDPOINT = process.env.APPWRITE_ENDPOINT
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID
const API_KEY = process.env.APPWRITE_API_KEY
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || "cfarm"
const PUBLIC_BASE_URL =
  process.env.BASE_URL || "https://web-production-bd480.up.railway.app"
if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
  throw new Error(
    "APPWRITE_ENDPOINT/PROJECT_ID/API_KEY required in the process environment or repo-root .env"
  )
}

const RUNTIME = "node-22",
  ENTRY = "src/main.js",
  COMMANDS = "npm install"
const optionalProviderVars = Object.fromEntries(
  [
    "APIFY_KEY",
    "OPENROUTER_API_KEY",
    "DATAFORSEO_LOGIN",
    "DATAFORSEO_PASSWORD",
    "OPENAI_API_KEY",
    "OPENAI_TRANSCRIPTION_MODEL",
    "FAL_KEY",
    "FAL_WHISPER_MODEL",
    "ELEVENLABS_API_KEY",
    "ENABLE_UGC_AUTOMATION",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
    "BASE_URL",
    "SLIDESHOW_SHARE_SECRET",
    "POSTFAST_API_KEY",
    "RENDI_API_KEY",
    "DEEPL_KEY",
    "LUMENCLIP_SYSTEM_OWNER_ID",
    "APIFY_YOUTUBE_ACTOR",
    "APIFY_REDDIT_ACTOR",
    "APIFY_TWITTER_ACTOR",
    "APIFY_TIKTOK_ACTOR",
  ]
    .filter((key) => process.env[key])
    .map((key) => [key, process.env[key]])
)
const FUNCTIONS = [
  {
    id: "template-scheduler",
    schedule: "*/5 * * * *",
    timeout: 120,
    vars: {
      APPWRITE_API_KEY: API_KEY,
      APPWRITE_ENDPOINT: ENDPOINT,
      APPWRITE_DATABASE_ID: DATABASE_ID,
      ...(process.env.SLIDESHOW_TEXT_MODEL
        ? { SLIDESHOW_TEXT_MODEL: process.env.SLIDESHOW_TEXT_MODEL }
        : {}),
      LOOKBACK_MINUTES: "10",
      ...(process.env.LUMENCLIP_SYSTEM_OWNER_ID
        ? { LUMENCLIP_SYSTEM_OWNER_ID: process.env.LUMENCLIP_SYSTEM_OWNER_ID }
        : {}),
      // The scheduler decides whether to enqueue UGC slots at all
      // (template-scheduler/src/main.js checks this flag), so it needs the
      // value too. Forwarding it only to the job-worker meant scheduled UGC
      // was skipped silently no matter how the worker was configured.
      ...(process.env.ENABLE_UGC_AUTOMATION
        ? { ENABLE_UGC_AUTOMATION: process.env.ENABLE_UGC_AUTOMATION }
        : {}),
    },
  },
  {
    id: "job-worker",
    // Must match appwrite.json, which is the other deployment source for this
    // function. They previously disagreed (*/2 here vs every minute), so the
    // effective cadence depended on which deploy path ran last.
    schedule: "*/2 * * * *",
    timeout: 900,
    vars: {
      APPWRITE_API_KEY: API_KEY,
      APPWRITE_ENDPOINT: ENDPOINT,
      APPWRITE_DATABASE_ID: DATABASE_ID,
      ...(process.env.SLIDESHOW_TEXT_MODEL
        ? { SLIDESHOW_TEXT_MODEL: process.env.SLIDESHOW_TEXT_MODEL }
        : {}),
      BATCH: "1",
      LEASE_MS: "960000",
      BASE_URL: PUBLIC_BASE_URL,
      ...optionalProviderVars,
    },
  },
]

const fx = new Functions(
  new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY)
)

execFileSync(process.execPath, [
  path.join(path.dirname(here), "..", "scripts", "sync-function-shared.mjs"),
])

async function ensureFn(f) {
  try {
    await fx.create(
      f.id,
      f.id,
      RUNTIME,
      [],
      [],
      f.schedule,
      f.timeout,
      true,
      true,
      ENTRY,
      COMMANDS
    )
    console.log("created", f.id)
  } catch (e) {
    if (e.code === 409) {
      await fx.update(
        f.id,
        f.id,
        RUNTIME,
        [],
        [],
        f.schedule,
        f.timeout,
        true,
        true,
        ENTRY,
        COMMANDS
      )
      console.log("updated", f.id)
    } else throw e
  }
}
async function setVars(f) {
  const { variables } = await fx.listVariables(f.id)
  for (const [key, value] of Object.entries(f.vars)) {
    const found = variables.find((v) => v.key === key)
    if (found)
      await fx.updateVariable({
        functionId: f.id,
        variableId: found.$id,
        key,
        value,
      })
    else
      await fx.createVariable({
        functionId: f.id,
        variableId:
          "v" +
          crypto
            .createHash("sha256")
            .update(`${f.id}:${key}`)
            .digest("hex")
            .slice(0, 30),
        key,
        value,
      })
  }
}
async function deployFn(f) {
  const src = path.join(here, f.id)
  const tar = path.join(here, `${f.id}.tar.gz`)
  // Exclude local node_modules (Appwrite runs `npm install` server-side during
  // the build) and any stray archive, so a stray local install never bloats the
  // upload.
  execSync(
    `tar --exclude='./node_modules' --exclude='./*.tar.gz' -czf ${tar} -C ${src} .`
  )
  const dep = await fx.createDeployment(
    f.id,
    InputFile.fromPath(tar, "code.tar.gz"),
    true,
    ENTRY,
    COMMANDS
  )
  try {
    fs.rmSync(tar, { force: true })
  } catch {
    /* ignore */
  }
  process.stdout.write(`  building ${f.id} `)
  for (let i = 0; i < 72; i++) {
    const d = await fx.getDeployment(f.id, dep.$id)
    if (d.status === "ready") {
      // Some Appwrite releases leave a ready deployment as `latest` without
      // promoting it, even when createDeployment received activate=true.
      await fx.updateFunctionDeployment({
        functionId: f.id,
        deploymentId: dep.$id,
      })
      const active = await fx.get(f.id)
      if (active.deploymentId !== dep.$id) {
        throw new Error(`deployment ${dep.$id} built but was not activated`)
      }
      console.log("-> ready + active")
      return
    }
    if (d.status === "failed") {
      console.log("-> FAILED\n", (d.buildLogs || "").slice(-2500))
      process.exit(1)
    }
    process.stdout.write(".")
    await new Promise((r) => setTimeout(r, 5000))
  }
}
async function main() {
  for (const f of FUNCTIONS) {
    console.log(`\n== ${f.id} ==`)
    await ensureFn(f)
    await setVars(f)
    await deployFn(f)
  }
  console.log("\nall functions deployed")
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})

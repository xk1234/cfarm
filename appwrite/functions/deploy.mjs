// Self-contained deploy for the Cfarm Appwrite Functions (automation-scheduler + job-worker).
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
import { execSync } from "node:child_process"
import { Client, Functions } from "node-appwrite"
import { InputFile } from "node-appwrite/file"

const ENDPOINT = process.env.APPWRITE_ENDPOINT
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID
const API_KEY = process.env.APPWRITE_API_KEY
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || "cfarm"
if (!ENDPOINT || !PROJECT_ID || !API_KEY) throw new Error("APPWRITE_ENDPOINT/PROJECT_ID/API_KEY required")

const here = path.dirname(fileURLToPath(import.meta.url))
const RUNTIME = "node-22", ENTRY = "src/main.js", COMMANDS = "npm install"
const FUNCTIONS = [
  { id: "automation-scheduler", schedule: "*/5 * * * *", timeout: 120, vars: { APPWRITE_API_KEY: API_KEY, APPWRITE_DATABASE_ID: DATABASE_ID, LOOKBACK_MINUTES: "10" } },
  { id: "job-worker", schedule: "* * * * *", timeout: 300, vars: { APPWRITE_API_KEY: API_KEY, APPWRITE_DATABASE_ID: DATABASE_ID, BATCH: "10", LEASE_MS: "120000" } },
]

const fx = new Functions(new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY))

async function ensureFn(f) {
  try { await fx.create(f.id, f.id, RUNTIME, [], [], f.schedule, f.timeout, true, true, ENTRY, COMMANDS); console.log("created", f.id) }
  catch (e) { if (e.code === 409) { await fx.update(f.id, f.id, RUNTIME, [], [], f.schedule, f.timeout, true, true, ENTRY, COMMANDS); console.log("updated", f.id) } else throw e }
}
async function setVars(f) {
  const { variables } = await fx.listVariables(f.id)
  for (const [key, value] of Object.entries(f.vars)) {
    const found = variables.find((v) => v.key === key)
    if (found) await fx.updateVariable({ functionId: f.id, variableId: found.$id, key, value })
    else await fx.createVariable({ functionId: f.id, variableId: "v" + crypto.createHash("sha256").update(`${f.id}:${key}`).digest("hex").slice(0, 30), key, value })
  }
}
async function deployFn(f) {
  const src = path.join(here, f.id)
  const tar = path.join(here, `${f.id}.tar.gz`)
  execSync(`tar -czf ${tar} -C ${src} .`)
  const dep = await fx.createDeployment(f.id, InputFile.fromPath(tar, "code.tar.gz"), true, ENTRY, COMMANDS)
  try { fs.rmSync(tar, { force: true }) } catch { /* ignore */ }
  process.stdout.write(`  building ${f.id} `)
  for (let i = 0; i < 72; i++) {
    const d = await fx.getDeployment(f.id, dep.$id)
    if (d.status === "ready") { console.log("-> ready"); return }
    if (d.status === "failed") { console.log("-> FAILED\n", (d.buildLogs || "").slice(-2500)); process.exit(1) }
    process.stdout.write("."); await new Promise((r) => setTimeout(r, 5000))
  }
}
async function main() {
  for (const f of FUNCTIONS) { console.log(`\n== ${f.id} ==`); await ensureFn(f); await setVars(f); await deployFn(f) }
  console.log("\nall functions deployed")
}
main().catch((e) => { console.error(e); process.exit(1) })

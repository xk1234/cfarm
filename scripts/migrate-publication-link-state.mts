import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { parseEnv } from "node:util"

const root = path.resolve(import.meta.dirname, "..")
const envFile = argumentValue("--env-file") || ".env.local"
const apply = process.argv.includes("--apply")
const environment = parseEnv(readFileSync(path.resolve(root, envFile), "utf8"))
for (const [key, value] of Object.entries(environment)) process.env[key] = value

// Owner precedence matches scripts/lumenclip-mcp.mts, and --owner-id overrides
// both: an env file can name a system owner that holds no publications, and a
// run against the wrong owner reports zero records, which reads exactly like
// "nothing to migrate". The owner is echoed in the output for the same reason.
const ownerId =
  argumentValue("--owner-id") ||
  environment.LUMENCLIP_MCP_OWNER_ID?.trim() ||
  environment.LUMENCLIP_SYSTEM_OWNER_ID?.trim()
if (!ownerId) {
  throw new Error(
    `${envFile} must define LUMENCLIP_MCP_OWNER_ID or LUMENCLIP_SYSTEM_OWNER_ID, or pass --owner-id.`
  )
}
process.env.LUMENCLIP_SYSTEM_OWNER_ID = ownerId

const [
  { migratePublicationLinkState, publicationStateCounts },
  { listMetricSnapshots },
  { listOutputPublications, writeOutputPublications },
  { withSystemOwner },
] = await Promise.all([
  import("@/lib/publication-link-state-migration"),
  import("@/lib/postfast-metric-snapshots"),
  import("@/lib/output-publications"),
  import("@/lib/system-owner-context"),
])

const result = await withSystemOwner(ownerId, async () => {
  const [publications, snapshots] = await Promise.all([
    listOutputPublications(),
    listMetricSnapshots(),
  ])
  const before = publicationStateCounts(publications)
  const migrated = migratePublicationLinkState(publications, snapshots)
  const after = publicationStateCounts(migrated.records)
  let backupFile: string | undefined

  if (apply && migrated.changed > 0) {
    const backupDir = path.resolve(root, "data", "backups")
    mkdirSync(backupDir, { recursive: true })
    backupFile = path.join(
      backupDir,
      `publication-link-state-${new Date().toISOString().replaceAll(":", "-")}.json`
    )
    writeFileSync(
      backupFile,
      JSON.stringify({ ownerId, publications }, null, 2) + "\n",
      { flag: "wx" }
    )
    await writeOutputPublications(migrated.records)
  }

  return {
    environment: envFile,
    ownerId,
    dryRun: !apply,
    publicationsScanned: publications.length,
    snapshotsScanned: snapshots.length,
    recordsChanged: migrated.changed,
    before,
    after,
    backupFile,
  }
})

console.log(JSON.stringify(result, null, 2))

function argumentValue(name: string) {
  const exact = process.argv.find((argument) => argument.startsWith(`${name}=`))
  if (exact) return exact.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

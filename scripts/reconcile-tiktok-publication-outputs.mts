import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { parseEnv } from "node:util"

const root = path.resolve(import.meta.dirname, "..")
const requestedEnvFile = argumentValue("--env-file")
const envFile =
  requestedEnvFile ||
  (existsSync(path.resolve(root, ".env.local")) ? ".env.local" : ".env")
const apply = process.argv.includes("--apply")
const environment = parseEnv(readFileSync(path.resolve(root, envFile), "utf8"))
for (const [key, value] of Object.entries(environment)) process.env[key] = value

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
  { listAutomationRuns },
  { listPosts },
  { reconcileTikTokPublicationOutput },
  { withSystemOwner },
] = await Promise.all([
  import("@/lib/automation-runner"),
  import("@/lib/post-repository"),
  import("@/lib/publication-output-reconciliation"),
  import("@/lib/system-owner-context"),
])

const result = await withSystemOwner(ownerId, async () => {
  const [posts, runs] = await Promise.all([
    listPosts(),
    listAutomationRuns({ limit: 2_000, postRecords: [] }),
  ])
  const publications = posts.filter(
    (post) => post.provider === "tiktok" && post.lifecycleStatus === "published"
  )
  const matches = []
  const skipped: Record<string, number> = {}

  for (const post of publications) {
    const reconciliation = await reconcileTikTokPublicationOutput({
      post,
      runs,
      apply,
    })
    if (reconciliation.match.status === "matched") {
      matches.push({
        postId: post.id,
        externalPostId: post.externalPostId,
        outputId: reconciliation.match.outputId,
        runId: reconciliation.match.run.id,
        evidence: reconciliation.match.evidence,
        delaySeconds: Math.round(reconciliation.match.delayMs / 1_000),
        updated: reconciliation.updated,
      })
    } else {
      skipped[reconciliation.match.reason] =
        (skipped[reconciliation.match.reason] ?? 0) + 1
    }
  }

  return {
    environment: envFile,
    ownerId,
    dryRun: !apply,
    publicationsScanned: publications.length,
    runsScanned: runs.length,
    exactMatches: matches.length,
    recordsUpdated: matches.filter((match) => match.updated).length,
    skipped,
    matches,
  }
})

console.log(JSON.stringify(result, null, 2))

function argumentValue(name: string) {
  const exact = process.argv.find((argument) => argument.startsWith(`${name}=`))
  if (exact) return exact.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

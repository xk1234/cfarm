import { readFileSync } from "node:fs"
import path from "node:path"
import { parseEnv } from "node:util"

const root = path.resolve(import.meta.dirname, "..")
const envFile = argumentValue("--env-file") || ".env.local"
const dryRun = process.argv.includes("--dry-run")
const environment = parseEnv(readFileSync(path.resolve(root, envFile), "utf8"))

for (const [key, value] of Object.entries(environment)) {
  process.env[key] = value
}

const ownerId =
  environment.LUMENCLIP_SYSTEM_OWNER_ID?.trim() ||
  environment.LUMENCLIP_MCP_OWNER_ID?.trim()
if (!ownerId) {
  throw new Error(
    `${envFile} must define LUMENCLIP_SYSTEM_OWNER_ID or LUMENCLIP_MCP_OWNER_ID.`
  )
}
process.env.LUMENCLIP_SYSTEM_OWNER_ID = ownerId

const [
  { listMetricSnapshots, upsertMetricSnapshot },
  { listPostFastPostRecords, patchPostFastPostRecord },
  { canonicalTikTokPostUrl },
  { withSystemOwner },
] = await Promise.all([
  import("@/lib/postfast-metric-snapshots"),
  import("@/lib/postfast-posts"),
  import("@/lib/tiktok-studio-analytics"),
  import("@/lib/system-owner-context"),
])

const result = await withSystemOwner(ownerId, async () => {
  const [snapshots, publications] = await Promise.all([
    listMetricSnapshots(),
    listPostFastPostRecords(),
  ])
  const canonicalByPost = new Map<string, string>()

  for (const snapshot of snapshots) {
    if (snapshot.source !== "tiktok_studio") continue
    const releaseUrl = canonicalTikTokPostUrl({
      externalPostId: snapshot.platformPostId || "",
      authorUsername: snapshot.tiktokStudio?.overview?.authorUsername,
      photoCount: snapshot.tiktokStudio?.overview?.photoCount,
    })
    if (releaseUrl && !canonicalByPost.has(snapshot.postId)) {
      canonicalByPost.set(snapshot.postId, releaseUrl)
    }
  }

  let publicationUpdates = 0
  for (const publication of publications) {
    const releaseUrl = canonicalByPost.get(publication.id)
    if (!releaseUrl || publication.releaseUrl === releaseUrl) continue
    if (dryRun) {
      publicationUpdates += 1
    } else if (
      await patchPostFastPostRecord({
        id: publication.id,
        releaseUrl,
      })
    ) {
      publicationUpdates += 1
    }
  }

  let snapshotUpdates = 0
  for (const snapshot of snapshots) {
    const releaseUrl = canonicalByPost.get(snapshot.postId)
    if (!releaseUrl || snapshot.releaseUrl === releaseUrl) continue
    if (!dryRun) {
      await upsertMetricSnapshot({ ...snapshot, releaseUrl })
    }
    snapshotUpdates += 1
  }

  return {
    environment: envFile,
    ownerId,
    dryRun,
    candidatePosts: canonicalByPost.size,
    publicationUpdates,
    snapshotUpdates,
  }
})

console.log(JSON.stringify(result, null, 2))

function argumentValue(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

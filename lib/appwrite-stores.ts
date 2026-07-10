// Mapping + helpers shared by the Appwrite-backed json-store and asset serving.
// Kept in sync with the one-time migration scripts so row/file ids are deterministic.
import crypto from "node:crypto"
import path from "node:path"

/** Relative-to-`data/` JSON file path -> TablesDB table id. Unmapped stores fall back to the filesystem. */
export const STORE_TABLES: Record<string, string> = {
  "image-collections.json": "image_collections",
  "characters.json": "characters",
  "characters/images.json": "character_generations",
  "assets/assets.json": "assets",
  "automations/automations.json": "automations",
  "automations/runs.json": "automation_runs",
  "automation-templates/templates.json": "automation_templates",
  "automation-templates/example-runs.json": "automation_template_runs",
  "results/results.json": "results",
  "slideshows/slideshows.json": "slideshows",
  "usage-ledger.json": "usage_ledger",
  "word-collections/word-collections.json": "word_collections",
  "postfast-posts.json": "postfast_posts",
  "swipes/swipes.json": "swipes",
  "generated-videos/exports.json": "generated_video_exports",
}

export function dataRoot(): string {
  return path.join(process.cwd(), "data")
}

/** Resolve (rootDir, fileName) to a table id, or null when the store isn't migrated. */
export function tableForStore(rootDir: string, fileName: string): string | null {
  const abs = path.resolve(rootDir, fileName)
  const rel = path.relative(dataRoot(), abs).split(path.sep).join("/")
  return STORE_TABLES[rel] ?? null
}

const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/

/** Deterministic Appwrite row id from a record's own id (hash fallback), matching the migration. */
export function rowIdFor(table: string, rid: string | null, index: number): string {
  if (rid && ID_RE.test(rid)) return rid
  const basis = `${table}:${rid ?? "idx-" + index}`
  return "r" + crypto.createHash("sha256").update(basis).digest("hex").slice(0, 35)
}

export function pickField(rec: unknown, keys: string[]): string | null {
  if (!rec || typeof rec !== "object") return null
  const obj = rec as Record<string, unknown>
  for (const k of keys) {
    const v = obj[k]
    if (v != null && v !== "") return String(v)
  }
  return null
}

export const ID_KEYS = ["id", "$id", "uuid", "slug", "key"]
export const NAME_KEYS = ["name", "title", "label", "prompt", "slug"]
export const STATUS_KEYS = ["status", "state"]
export const CREATED_KEYS = ["createdAt", "created_at", "$createdAt", "created", "timestamp"]

// ----- Storage asset helpers -----

/** Map a data-relative asset path (e.g. "music/Extra/Song.mp3") to its bucket id. */
export function bucketForPath(relPath: string): string {
  const top = relPath.split("/")[0]
  switch (top) {
    case "music": return "music"
    case "image-collections": return "image_collections"
    case "greenscreen_memes": return "greenscreen"
    case "characters": return "characters"
    case "slideshows": return "slideshows"
    case "ugc_avatar_videos": return "ugc_videos"
    case "backgrounds": return "backgrounds"
    case "assets": return "assets"
    default: return "misc"
  }
}

/** Deterministic Appwrite file id for a data-relative asset path (matches the migration upload). */
export function fileIdForPath(relPath: string): string {
  return crypto.createHash("sha256").update(relPath).digest("hex").slice(0, 36)
}

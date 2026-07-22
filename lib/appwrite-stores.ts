// Mapping + helpers shared by the Appwrite-backed json-store and asset serving.
// Kept in sync with the one-time migration scripts so row/file ids are deterministic.
import crypto from "node:crypto"
import path from "node:path"

export type StoreRoute = {
  table: string
  sourceKey: string
  public: boolean
  shareable?: boolean
}

/**
 * Relative-to-`data/` logical store -> canonical Appwrite table route.
 *
 * The path remains the application-facing compatibility boundary, but records
 * are physically consolidated into outputs/permanent_assets. `sourceKey`
 * scopes reads and deterministic ids inside those polymorphic tables.
 */
const RAW_STORE_ROUTES: Record<string, StoreRoute | string> = {
  "image-collections.json": {
    table: "permanent_assets",
    sourceKey: "image_collection",
    public: false,
  },
  "assets/assets.json": {
    table: "permanent_assets",
    sourceKey: "uploaded_asset",
    public: false,
  },
  "automations/automations.json": "automations",
  "automations/runs.json": "automation_runs",
  "x-automations/automations.json": "x_automations",
  "x-automations/runs.json": {
    table: "outputs",
    sourceKey: "x_automation_run",
    public: false,
    shareable: true,
  },
  "automation-templates/templates.json": {
    table: "permanent_assets",
    sourceKey: "automation_template",
    public: true,
  },
  "automation-templates/example-runs.json": {
    table: "permanent_assets",
    sourceKey: "automation_template_example",
    public: true,
  },
  "results/results.json": {
    table: "outputs",
    sourceKey: "result",
    public: false,
    shareable: true,
  },
  "usage-ledger.json": "usage_ledger",
  "word-collections/word-collections.json": {
    table: "permanent_assets",
    sourceKey: "word_collection",
    public: false,
  },
  "postfast-metric-snapshots.json": "postfast_metric_snapshots",
  "account-follower-snapshots.json": "account_follower_snapshots",
  "generated-videos/exports.json": {
    table: "outputs",
    sourceKey: "generated_video",
    public: false,
    shareable: true,
  },
  "product-collections/product-collections.json": {
    table: "permanent_assets",
    sourceKey: "product_collection",
    public: false,
  },
  "media-library/assets.json": {
    table: "permanent_assets",
    sourceKey: "media_library_asset",
    public: true,
  },
  "settings/reminders.json": {
    table: "permanent_assets",
    sourceKey: "reminder_settings",
    public: false,
  },
  "brand-profile/brand-profile.json": {
    table: "permanent_assets",
    sourceKey: "brand_profile",
    public: false,
  },
}

export const STORE_ROUTES: Record<string, StoreRoute> = Object.fromEntries(
  Object.entries(RAW_STORE_ROUTES).map(([pathKey, value]) => [
    pathKey,
    typeof value === "string"
      ? {
          table: value,
          sourceKey: pathKey.replace(/\.json$/, "").replaceAll("/", "_"),
          public: false,
        }
      : value,
  ])
)

/** Relative-to-`data/` JSON file path -> physical TablesDB table id. */
export const STORE_TABLES: Record<string, string> = Object.fromEntries(
  Object.entries(STORE_ROUTES).map(([key, route]) => [key, route.table])
)

/** Tables that are intentionally shared between every authenticated user. */
export const PUBLIC_STORE_TABLES = new Set<string>()

export function dataRoot(): string {
  return path.join(process.cwd(), "data")
}

/** Resolve (rootDir, fileName) to a table id, or null when the store isn't migrated. */
export function tableForStore(
  rootDir: string,
  fileName: string
): string | null {
  const abs = path.resolve(rootDir, fileName)
  const rel = path.relative(dataRoot(), abs).split(path.sep).join("/")
  return STORE_TABLES[rel] ?? null
}

export function routeForStore(
  rootDir: string,
  fileName: string
): StoreRoute | null {
  const abs = path.resolve(rootDir, fileName)
  const rel = path.relative(dataRoot(), abs).split(path.sep).join("/")
  return STORE_ROUTES[rel] ?? null
}

const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/

/** Deterministic Appwrite row id from a record's own id (hash fallback), matching the migration. */
export function rowIdFor(
  table: string,
  rid: string | null,
  index: number
): string {
  if (rid && ID_RE.test(rid)) return rid
  const basis = `${table}:${rid ?? "idx-" + index}`
  return (
    "r" + crypto.createHash("sha256").update(basis).digest("hex").slice(0, 35)
  )
}

/** User-scoped row id. Never reuse a domain id across different owners. */
export function ownedRowIdFor(
  table: string,
  ownerId: string,
  rid: string | null,
  index: number
): string {
  const basis = `${table}:${ownerId}:${rid ?? `idx-${index}`}`
  return `u${crypto.createHash("sha256").update(basis).digest("hex").slice(0, 35)}`
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
export const CREATED_KEYS = [
  "createdAt",
  "created_at",
  "capturedAt",
  "$createdAt",
  "created",
  "timestamp",
]

// ----- Storage asset helpers -----

/** Map a data-relative asset path (e.g. "music/Extra/Song.mp3") to its bucket id. */
export function bucketForPath(relPath: string): string {
  const top = relPath.split("/")[0]
  switch (top) {
    case "music":
      return "music"
    case "image-collections":
      return "image_collections"
    case "greenscreen_memes":
      return "greenscreen"
    case "slideshows":
      return "slideshows"
    case "ugc_avatar_videos":
      return "ugc_videos"
    case "backgrounds":
      return "backgrounds"
    case "assets":
      return "assets"
    case "product-collections":
      return "product_images"
    default:
      return "misc"
  }
}

/** Deterministic Appwrite file id for a data-relative asset path (matches the migration upload). */
export function fileIdForPath(relPath: string): string {
  return crypto.createHash("sha256").update(relPath).digest("hex").slice(0, 36)
}

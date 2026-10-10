// Single declarative Appwrite schema (docs/refactor/03-appwrite-data-layer.md §3, §5).
//
// Read by the runtime adapter (lib/data/appwrite/*) for table/bucket ids and by
// scripts/appwrite-provision.mjs, which creates or checks everything here.
// Plain ESM so the provisioning script runs with `node` and no TypeScript step.
//
// Conventions:
// - `varchar` is the only indexable text type; keep indexed strings ≤ 128.
// - JSON lives in `longtext` (validated with zod in the adapter).
// - Times are `datetime` columns; `$createdAt` / `$updatedAt` are system fields.
// - Tables have rowSecurity off and no permissions: only the server key reads
//   or writes. Ownership (`workspace_id`) is enforced by the repositories.

export const DATABASE_ID_DEFAULT = "lumenclip"
export const DATABASE_NAME = "LumenClip"

/** @typedef {"varchar"|"text"|"mediumtext"|"longtext"|"integer"|"float"|"boolean"|"datetime"} ColumnType */
/**
 * @typedef {{ key: string, type: ColumnType, size?: number, required?: boolean, array?: boolean, default?: unknown }} ColumnDef
 * @typedef {{ key: string, type: "key"|"unique", columns: string[], orders?: ("asc"|"desc")[] }} IndexDef
 * @typedef {{ id: string, name: string, columns: ColumnDef[], indexes: IndexDef[] }} TableDef
 * @typedef {{ id: string, name: string, maximumFileSize: number, allowedFileExtensions: string[], encryption: boolean, antivirus: boolean, compression: "none"|"gzip"|"zstd", transformations: boolean }} BucketDef
 */

const varchar = (key, size, required = false) => ({ key, type: "varchar", size, required })
const text = (key, required = false) => ({ key, type: "text", required })
const longtext = (key, required = false) => ({ key, type: "longtext", required })
const integer = (key, required = false) => ({ key, type: "integer", required })
const float = (key, required = false) => ({ key, type: "float", required })
const boolean = (key, required = false) => ({ key, type: "boolean", required })
const datetime = (key, required = false) => ({ key, type: "datetime", required })
const key = (name, columns, orders) => ({ key: name, type: "key", columns, ...(orders ? { orders } : {}) })
const unique = (name, columns, orders) => ({ key: name, type: "unique", columns, ...(orders ? { orders } : {}) })

const WS = varchar("workspace_id", 64, true)
const CREATED_BY = varchar("created_by", 64, true)

/** Logical table ids used by the adapter. */
export const TABLES = {
  templates: "specs",
  renders: "renders",
  collections: "collections",
  media: "media",
  posts: "posts",
  batches: "batches",
  settings: "workspace_settings",
  notifications: "notifications",
  apiKeys: "api_keys",
  jobs: "jobs",
  leases: "job_leases",
}

/** @type {TableDef[]} */
export const TABLE_DEFS = [
  {
    id: TABLES.templates,
    name: "Slideshow templates",
    columns: [
      WS,
      varchar("name", 255, true),
      longtext("spec", true),
      integer("spec_version", true),
      varchar("aspect_ratio", 32, true),
      integer("slide_count", true),
      integer("image_slot_count", true),
      varchar("thumbnail_file_id", 36),
      CREATED_BY,
      datetime("archived_at"),
    ],
    indexes: [key("ws_updated", ["workspace_id", "$updatedAt"], ["asc", "desc"])],
  },
  {
    id: TABLES.renders,
    name: "Renders",
    columns: [
      WS,
      varchar("template_id", 36),
      longtext("slot_values"),
      longtext("spec", true),
      varchar("status", 16, true),
      varchar("source", 16, true),
      varchar("api_key_id", 36),
      varchar("idempotency_key", 128),
      varchar("title", 512),
      varchar("format", 8, true),
      float("scale", true),
      integer("slide_count", true),
      integer("width", true),
      integer("height", true),
      longtext("output"),
      longtext("warnings"),
      text("error"),
      varchar("job_id", 36),
      varchar("render_hash", 64),
      CREATED_BY,
      datetime("completed_at"),
      datetime("deleted_at"),
      datetime("purge_after"),
      varchar("batch_id", 36),
      integer("batch_index"),
    ],
    indexes: [
      key("ws_created", ["workspace_id", "$createdAt"], ["asc", "desc"]),
      key("ws_status", ["workspace_id", "status"]),
      key("ws_template", ["workspace_id", "template_id"]),
      key("ws_batch", ["workspace_id", "batch_id"]),
    ],
  },
  {
    id: TABLES.collections,
    name: "Collections",
    columns: [
      WS,
      varchar("name", 255, true),
      varchar("media_kind", 16, true),
      boolean("pinned"),
      integer("item_count"),
      varchar("cover_media_id", 36),
      CREATED_BY,
      datetime("deleted_at"),
      datetime("purge_after"),
    ],
    indexes: [
      unique("ws_name", ["workspace_id", "name"]),
      key("ws_updated", ["workspace_id", "$updatedAt"], ["asc", "desc"]),
    ],
  },
  {
    id: TABLES.media,
    name: "Media",
    columns: [
      WS,
      varchar("collection_id", 36),
      varchar("kind", 16, true),
      varchar("bucket_id", 36, true),
      varchar("file_id", 36, true),
      varchar("mime_type", 100, true),
      integer("size_bytes", true),
      integer("width"),
      integer("height"),
      varchar("sha256", 64, true),
      varchar("name", 255),
      text("caption"),
      varchar("source", 16, true),
      text("source_url"),
      text("attribution"),
      integer("position"),
      CREATED_BY,
      datetime("deleted_at"),
      datetime("purge_after"),
    ],
    indexes: [
      key("ws_coll_pos", ["workspace_id", "collection_id", "position"]),
      key("ws_created", ["workspace_id", "$createdAt"], ["asc", "desc"]),
      key("ws_hash", ["workspace_id", "sha256"]),
      key("ws_file", ["workspace_id", "file_id"]),
    ],
  },
  {
    id: TABLES.posts,
    name: "Posts",
    columns: [
      WS,
      varchar("render_id", 36, true),
      varchar("provider", 32, true),
      varchar("account_id", 64, true),
      varchar("status", 16, true),
      datetime("publish_at"),
      datetime("published_at"),
      text("caption"),
      longtext("platform_options"),
      varchar("provider_post_id", 128),
      varchar("external_post_id", 255),
      text("permalink"),
      text("error"),
      varchar("intent_key", 128, true),
      CREATED_BY,
      varchar("batch_id", 36),
      integer("batch_index"),
    ],
    indexes: [
      unique("ws_intent", ["workspace_id", "intent_key"]),
      key("ws_publish", ["workspace_id", "publish_at"]),
      key("ws_published", ["workspace_id", "published_at"]),
      key("status_publish", ["status", "publish_at"]),
      key("ws_render", ["workspace_id", "render_id"]),
      key("ws_batch", ["workspace_id", "batch_id"]),
    ],
  },
  {
    // One batch of carousel items: frozen template spec + items (slot values,
    // caption, computed slot). Per-item progress lives on the renders/posts
    // rows (batch_id, batch_index); `counts`/`results` are a refreshed snapshot.
    id: TABLES.batches,
    name: "Batches",
    columns: [
      WS,
      varchar("name", 255, true),
      varchar("status", 24, true),
      varchar("mode", 16, true),
      varchar("template_id", 36),
      longtext("spec", true),
      longtext("items", true),
      integer("item_count", true),
      longtext("schedule", true),
      text("output"),
      text("counts"),
      longtext("results"),
      longtext("item_errors"),
      integer("retry_count"),
      varchar("source", 16, true),
      varchar("api_key_id", 36),
      varchar("idempotency_key", 128),
      CREATED_BY,
      datetime("completed_at"),
      datetime("canceled_at"),
    ],
    indexes: [
      key("ws_created", ["workspace_id", "$createdAt"], ["asc", "desc"]),
      key("ws_status", ["workspace_id", "status"]),
      key("status_updated", ["status", "$updatedAt"]),
    ],
  },
  {
    id: TABLES.settings,
    name: "Workspace settings",
    columns: [
      WS,
      varchar("timezone", 64),
      text("disabled_account_ids"),
      text("mcp_disabled_tools"),
      text("reminders"),
      longtext("render_defaults"),
    ],
    indexes: [unique("ws", ["workspace_id"])],
  },
  {
    id: TABLES.notifications,
    name: "Notifications",
    columns: [
      WS,
      varchar("event", 48, true),
      varchar("post_id", 36),
      varchar("render_id", 36),
      varchar("title", 255, true),
      text("body"),
      datetime("deliver_at", true),
      varchar("channel", 16, true),
      varchar("status", 16, true),
      datetime("read_at"),
      varchar("dedupe_key", 128, true),
    ],
    indexes: [
      unique("ws_dedupe", ["workspace_id", "dedupe_key"]),
      key("ws_status_deliver", ["workspace_id", "status", "deliver_at"]),
      key("ws_post", ["workspace_id", "post_id"]),
      key("due", ["status", "deliver_at"]),
    ],
  },
  {
    id: TABLES.apiKeys,
    name: "API keys",
    columns: [
      WS,
      varchar("name", 128, true),
      varchar("prefix", 16, true),
      varchar("key_hash", 64, true),
      { key: "scopes", type: "varchar", size: 32, required: false, array: true },
      CREATED_BY,
      datetime("last_used_at"),
      datetime("expires_at"),
      datetime("revoked_at"),
    ],
    indexes: [unique("hash", ["key_hash"]), key("ws", ["workspace_id"])],
  },
  {
    id: TABLES.jobs,
    name: "Jobs",
    columns: [
      varchar("workspace_id", 64),
      varchar("type", 32, true),
      varchar("status", 16, true),
      longtext("payload", true),
      longtext("result"),
      text("error"),
      integer("attempt", true),
      integer("max_attempts", true),
      datetime("run_at", true),
      datetime("lease_expires_at"),
      varchar("worker_id", 64),
      datetime("completed_at"),
    ],
    indexes: [
      key("claimable", ["status", "run_at"]),
      key("expired", ["status", "lease_expires_at"]),
      key("ws_created", ["workspace_id", "$createdAt"], ["asc", "desc"]),
    ],
  },
  {
    id: TABLES.leases,
    name: "Job leases",
    columns: [
      varchar("job_id", 36, true),
      integer("attempt", true),
      varchar("worker_id", 64, true),
      datetime("expires_at", true),
    ],
    indexes: [key("created", ["$createdAt"])],
  },
]

/** Logical bucket ids (match `BUCKETS` in lib/data/types.ts). */
export const BUCKET_DEFS = [
  {
    id: "media",
    name: "Media",
    maximumFileSize: 25 * 1024 * 1024,
    allowedFileExtensions: ["jpg", "jpeg", "png", "webp", "gif", "avif", "heic", "mp4", "mov", "webm"],
    encryption: true,
    antivirus: true,
    compression: "none",
    transformations: true,
  },
  {
    id: "renders",
    name: "Renders",
    maximumFileSize: 50 * 1024 * 1024,
    allowedFileExtensions: ["png", "jpg", "jpeg", "webp", "zip"],
    encryption: true,
    antivirus: false,
    compression: "none",
    transformations: true,
  },
]

/** Default ids, overridable with APPWRITE_DATABASE_ID / APPWRITE_BUCKET_MEDIA / APPWRITE_BUCKET_RENDERS. */
export function appwriteIdsFromEnv(env = process.env) {
  return {
    databaseId: env.APPWRITE_DATABASE_ID?.trim() || DATABASE_ID_DEFAULT,
    buckets: {
      media: env.APPWRITE_BUCKET_MEDIA?.trim() || "media",
      renders: env.APPWRITE_BUCKET_RENDERS?.trim() || "renders",
    },
  }
}

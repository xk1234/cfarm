import { Client, Query, TablesDB } from "node-appwrite"

const databaseId = process.env.APPWRITE_DATABASE_ID || "cfarm"
const tables = new TablesDB(
  new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY)
)

const schemas = {
  permanent_assets: [
    string("rid", 1024),
    string("owner_id", 36),
    string("source_key", 255),
    string("name", 2048),
    string("status", 255),
    string("created_raw", 64),
    longtext("data"),
    integer("ord"),
    string("visibility", 32),
    string("asset_type", 255),
    string("kind", 255),
    string("parent_id", 255),
    mediumtext("description"),
    mediumtext("text"),
    longtext("tags"),
    string("storage_bucket", 255),
    string("storage_file_id", 255),
    mediumtext("storage_path"),
    mediumtext("url"),
    string("mime_type", 255),
    integer("bytes"),
    integer("width"),
    integer("height"),
    integer("duration_ms"),
    string("checksum", 255),
    mediumtext("source_url"),
    integer("position"),
    string("updated_at", 64),
    string("migration_source", 255),
  ],
  outputs: [
    string("rid", 1024),
    string("owner_id", 36),
    string("source_key", 255),
    string("name", 2048),
    string("status", 255),
    string("created_raw", 64),
    longtext("data"),
    integer("ord"),
    string("kind", 255),
    string("subtype", 255),
    string("storage_class", 64),
    string("origin", 64),
    string("title", 2048),
    mediumtext("hook"),
    mediumtext("caption"),
    longtext("hashtags"),
    mediumtext("text"),
    longtext("text_data"),
    string("source_automation_id", 255),
    string("source_run_id", 255),
    string("source_entity_id", 255),
    boolean("has_video"),
    string("publication_status", 64),
    string("scheduled_at", 64),
    string("published_at", 64),
    string("primary_post_id", 255),
    mediumtext("primary_release_url"),
    longtext("publications"),
    longtext("evaluation"),
    mediumtext("error"),
    string("updated_at", 64),
    string("migration_source", 255),
  ],
  output_media: [
    string("output_id", 36),
    string("owner_id", 36),
    string("permanent_asset_id", 36),
    string("kind", 64),
    string("role", 255),
    integer("position"),
    string("storage_bucket", 255),
    string("storage_file_id", 255),
    mediumtext("storage_path"),
    mediumtext("url"),
    string("mime_type", 255),
    integer("bytes"),
    integer("width"),
    integer("height"),
    integer("duration_ms"),
    string("checksum", 255),
    longtext("data"),
    string("created_at", 64),
  ],
}

const indexes = {
  permanent_assets: [
    index("idx_rid", ["rid"], undefined, [255]),
    index("idx_owner", ["owner_id"]),
    index("idx_source", ["source_key"], undefined, [64]),
    index("idx_ord", ["ord"]),
    index(
      "idx_owner_source_ord",
      ["owner_id", "source_key", "ord"],
      ["ASC", "ASC", "ASC"],
      [0, 64, 0]
    ),
    index("idx_source_ord", ["source_key", "ord"], ["ASC", "ASC"], [64, 0]),
  ],
  outputs: [
    index("idx_rid", ["rid"], undefined, [255]),
    index("idx_owner", ["owner_id"]),
    index("idx_source", ["source_key"], undefined, [64]),
    index("idx_ord", ["ord"]),
    index("idx_publication", ["publication_status"]),
    index("idx_source_automation", ["source_automation_id"]),
    index("idx_source_run", ["source_run_id"]),
    index("idx_source_entity", ["source_entity_id"]),
    index("idx_has_video", ["has_video"]),
    index(
      "idx_owner_source_ord",
      ["owner_id", "source_key", "ord"],
      ["ASC", "ASC", "ASC"],
      [0, 64, 0]
    ),
    index(
      "idx_owner_publication",
      ["owner_id", "publication_status"],
      ["ASC", "ASC"]
    ),
    index(
      "idx_owner_source_entity",
      ["owner_id", "source_key", "source_entity_id"],
      ["ASC", "ASC", "ASC"],
      [0, 64, 0]
    ),
    index(
      "idx_owner_source_automation",
      ["owner_id", "source_key", "source_automation_id"],
      ["ASC", "ASC", "ASC"],
      [0, 64, 0]
    ),
    index(
      "idx_owner_source_run",
      ["owner_id", "source_key", "source_run_id"],
      ["ASC", "ASC", "ASC"],
      [0, 64, 0]
    ),
    index(
      "idx_owner_source_kind",
      ["owner_id", "source_key", "kind"],
      ["ASC", "ASC", "ASC"],
      [0, 64, 0]
    ),
    index(
      "idx_owner_source_kind_video",
      ["owner_id", "source_key", "kind", "has_video"],
      ["ASC", "ASC", "ASC", "ASC"],
      [0, 64, 0, 0]
    ),
  ],
  output_media: [
    index("idx_output", ["output_id"]),
    index("idx_owner", ["owner_id"]),
    index("idx_asset", ["permanent_asset_id"]),
    index("idx_output_position", ["output_id", "position"], ["ASC", "ASC"]),
  ],
}

for (const [tableId, columns] of Object.entries(schemas)) {
  await tables.createTable(databaseId, tableId, tableId).catch(ignoreConflict)

  for (const column of columns) {
    await createColumn(tableId, column).catch(ignoreConflict)
  }
  await waitForColumns(tableId)

  for (const definition of indexes[tableId]) {
    await tables
      .createIndex(
        databaseId,
        tableId,
        definition.key,
        "key",
        definition.columns,
        definition.orders,
        definition.lengths
      )
      .catch(ignoreConflict)
  }
  console.log(`consolidated table ${tableId}: ready`)
}

await backfillOutputVideoFlags()

function string(key, size) {
  return { type: "string", key, size }
}

function mediumtext(key) {
  return { type: "mediumtext", key }
}

function longtext(key) {
  return { type: "longtext", key }
}

function integer(key) {
  return { type: "integer", key }
}

function boolean(key) {
  return { type: "boolean", key }
}

function index(key, columns, orders, lengths) {
  return { key, columns, orders, lengths }
}

function createColumn(tableId, column) {
  if (column.type === "string") {
    return tables.createStringColumn(
      databaseId,
      tableId,
      column.key,
      column.size,
      false
    )
  }
  if (column.type === "mediumtext") {
    return tables.createMediumtextColumn(databaseId, tableId, column.key, false)
  }
  if (column.type === "longtext") {
    return tables.createLongtextColumn(databaseId, tableId, column.key, false)
  }
  if (column.type === "boolean") {
    return tables.createBooleanColumn(databaseId, tableId, column.key, false)
  }
  return tables.createIntegerColumn(databaseId, tableId, column.key, false)
}

async function backfillOutputVideoFlags() {
  let cursor
  let updated = 0
  for (;;) {
    const queries = [Query.limit(100)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const response = await tables.listRows(databaseId, "outputs", queries)
    for (const row of response.rows) {
      if (typeof row.has_video === "boolean") continue
      const record = safeJson(row.data)
      const artifacts = asRecord(record?.artifacts)
      const payload = asRecord(record?.payload)
      const settings = asRecord(payload?.settings)
      const hasVideo = Boolean(
        artifacts?.videoUrl ||
        settings?.export_as_video === true ||
        row.source_key === "generated_video"
      )
      await tables.updateRow(databaseId, "outputs", row.$id, {
        has_video: hasVideo,
      })
      updated += 1
    }
    if (response.rows.length < 100) break
    cursor = response.rows.at(-1)?.$id
  }
  console.log(`outputs: ${updated} video flags backfilled`)
}

function safeJson(value) {
  if (typeof value !== "string") return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null
}

async function waitForColumns(tableId) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const response = await tables.listColumns(databaseId, tableId)
    if (response.columns.every((column) => column.status === "available"))
      return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Columns for ${tableId} did not become available.`)
}

function ignoreConflict(error) {
  if (
    Number(error?.code) !== 409 &&
    !(
      Number(error?.code) === 400 &&
      error?.type === "column_index_invalid" &&
      /already an index with the same attributes and orders/i.test(
        String(error?.message)
      )
    )
  ) {
    throw error
  }
}

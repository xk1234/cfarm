import { createHash } from "node:crypto"

import postgres from "postgres"

type Definition = {
  reference: string
  name: string
  createdAt: string
  fileNamePattern: string
  expectedFiles: number
}

const apply = process.argv.includes("--apply")
const definitions: Definition[] = [
  {
    reference: "collection-tumblr-nar-r-2026-07-03t00-01-21-000z",
    name: "Tumblr Nar R",
    createdAt: "2026-07-03T00:01:21.000Z",
    fileNamePattern: "tumblr-nar-r-%",
    expectedFiles: 131,
  },
  {
    reference: "White of Squarish Icons",
    name: "White of Squarish Icons",
    createdAt: "2026-07-24T11:11:00.000Z",
    fileNamePattern: "white-squarish-icon-%",
    expectedFiles: 10,
  },
]

const databaseUrl = new URL(required("DATABASE_URL"))
if (process.env.MIGRATION_DB_TUNNEL_PORT) {
  databaseUrl.hostname = "127.0.0.1"
  databaseUrl.port = process.env.MIGRATION_DB_TUNNEL_PORT
}
const sql = postgres(databaseUrl.toString(), { max: 2, prepare: false })

try {
  const report = []
  for (const definition of definitions) {
    const templates = await sql<Array<{ owner_id: string }>>`
      SELECT DISTINCT owner_id
      FROM domain_records
      WHERE table_name = 'templates'
        AND owner_id IS NOT NULL
        AND payload::text LIKE ${`%${definition.reference}%`}
    `
    const files = await sql<
      Array<{
        source_file_id: string
        name: string
        checksum: string | null
        verified_at: Date | null
      }>
    >`
      SELECT source_file_id, name, checksum, verified_at
      FROM object_manifest
      WHERE source_bucket_id = 'image_collections'
        AND lower(name) LIKE ${definition.fileNamePattern}
      ORDER BY name, source_file_id
    `

    const invalidPaths = files.filter(
      (file) => file.source_file_id !== fileIdForCollectionFile(file.name)
    )
    const unverified = files.filter((file) => !file.verified_at)
    if (files.length !== definition.expectedFiles) {
      throw new Error(
        `${definition.name} expected ${definition.expectedFiles} files, found ${files.length}. Finish the Appwrite asset migration first.`
      )
    }
    if (invalidPaths.length > 0 || unverified.length > 0) {
      throw new Error(
        `${definition.name} has ${invalidPaths.length} path mismatches and ${unverified.length} unverified files.`
      )
    }

    const images = files.map((file) => ({
      image_link: `/api/local-assets/image-collections/files/${encodeURIComponent(file.name)}`,
      caption: "",
      ...(file.checksum ? { hash: file.checksum } : {}),
    }))

    let recoveredOwners = 0
    for (const { owner_id: ownerId } of templates) {
      const id = definition.reference
      const payload = {
        id,
        ownerId,
        name: definition.name,
        created_at: definition.createdAt,
        images,
      }
      const [existing] = await sql<Array<{ row_id: string }>>`
        SELECT row_id
        FROM domain_records
        WHERE table_name = 'permanent_assets'
          AND source_key = 'image_collection'
          AND owner_id = ${ownerId}
          AND (name = ${definition.name} OR rid = ${id})
        LIMIT 1
      `
      const rowId =
        existing?.row_id ??
        ownedRowId("permanent_assets:image_collection", ownerId, id)
      const now = new Date().toISOString()
      const sourceRow = {
        $id: rowId,
        $createdAt: now,
        $updatedAt: now,
        $permissions: [],
        rid: id,
        owner_id: ownerId,
        source_key: "image_collection",
        name: definition.name,
        status: null,
        created_raw: definition.createdAt,
        data: JSON.stringify(payload),
        ord: 0,
        visibility: "private",
        asset_type: "image_collection",
        kind: "collection",
        description: null,
        updated_at: now,
        migration_source: "recovered:appwrite-storage",
      }

      if (apply) {
        await sql`
          INSERT INTO domain_records (
            table_name, row_id, owner_id, source_key, rid, name, status, ord,
            payload, source_row, permissions, appwrite_created_at,
            appwrite_updated_at, migrated_at
          ) VALUES (
            'permanent_assets', ${rowId}, ${ownerId}, 'image_collection',
            ${id}, ${definition.name}, NULL, 0, ${sql.json(payload)},
            ${sql.json(sourceRow)}, ${sql.json([])}, ${now}, ${now}, now()
          )
          ON CONFLICT (table_name, row_id) DO UPDATE SET
            owner_id = excluded.owner_id,
            source_key = excluded.source_key,
            rid = excluded.rid,
            name = excluded.name,
            status = excluded.status,
            ord = excluded.ord,
            payload = excluded.payload,
            source_row = excluded.source_row,
            permissions = excluded.permissions,
            appwrite_updated_at = excluded.appwrite_updated_at,
            migrated_at = now()
        `
      }
      recoveredOwners += 1
    }

    report.push({
      reference: definition.reference,
      files: files.length,
      owners: templates.length,
      recoveredOwners: apply ? recoveredOwners : 0,
    })
  }

  console.log(
    JSON.stringify({ mode: apply ? "apply" : "preview", report }, null, 2)
  )
} finally {
  await sql.end({ timeout: 5 })
}

function fileIdForCollectionFile(name: string) {
  return createHash("sha256")
    .update(`image-collections/files/${name}`)
    .digest("hex")
    .slice(0, 36)
}

function ownedRowId(namespace: string, ownerId: string, rid: string) {
  return `u${createHash("sha256")
    .update(`${namespace}:${ownerId}:${rid}`)
    .digest("hex")
    .slice(0, 35)}`
}

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

import {
  bigint,
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

type JsonObject = Record<string, unknown>

export const appUsers = pgTable(
  "app_users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("app_users_email_unique").on(sql`lower(${table.email})`),
  ]
)

export const domainRecords = pgTable(
  "domain_records",
  {
    tableName: text("table_name").notNull(),
    rowId: text("row_id").notNull(),
    ownerId: text("owner_id"),
    sourceKey: text("source_key"),
    rid: text("rid"),
    name: text("name"),
    status: text("status"),
    ord: bigint("ord", { mode: "number" }),
    payload: jsonb("payload").$type<JsonObject>().notNull().default({}),
    sourceRow: jsonb("source_row").$type<JsonObject>().notNull(),
    permissions: jsonb("permissions").$type<unknown[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    migratedAt: timestamp("migrated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tableName, table.rowId] }),
    index("domain_records_owner").on(table.ownerId),
    index("domain_records_source").on(table.tableName, table.sourceKey),
    index("domain_records_owner_source_ord").on(
      table.tableName,
      table.ownerId,
      table.sourceKey,
      table.ord
    ),
    index("domain_records_rid").on(table.tableName, table.rid),
  ]
)

export const objectManifest = pgTable(
  "object_manifest",
  {
    sourceBucketId: text("source_bucket_id").notNull(),
    sourceFileId: text("source_file_id").notNull(),
    objectKey: text("object_key").notNull(),
    name: text("name").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    checksum: text("checksum"),
    migratedAt: timestamp("migrated_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    sourceFile: jsonb("source_file").$type<JsonObject>().notNull().default({}),
  },
  (table) => [
    primaryKey({ columns: [table.sourceBucketId, table.sourceFileId] }),
    uniqueIndex("object_manifest_object_key_unique").on(table.objectKey),
    index("object_manifest_migration_state").on(
      table.migratedAt,
      table.verifiedAt
    ),
  ]
)

export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id"),
    jobType: text("job_type").notNull(),
    status: text("status").notNull(),
    payload: jsonb("payload").$type<JsonObject>().notNull().default({}),
    result: jsonb("result").$type<unknown>(),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("jobs_claimable").on(table.status, table.runAt, table.leaseExpiresAt),
    index("jobs_owner_recent").on(table.ownerId, table.createdAt),
  ]
)

export const outputMedia = pgTable(
  "output_media",
  {
    id: text("id").primaryKey(),
    outputId: text("output_id").notNull(),
    ownerId: text("owner_id").notNull(),
    kind: text("kind").notNull(),
    role: text("role").notNull(),
    position: integer("position").notNull().default(0),
    storageBucket: text("storage_bucket"),
    storageFileId: text("storage_file_id"),
    storagePath: text("storage_path"),
    url: text("url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("output_media_output_position").on(table.outputId, table.position),
    index("output_media_owner").on(table.ownerId),
  ]
)

export const migrationFailures = pgTable("migration_failures", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  migrationRunId: text("migration_run_id").notNull(),
  sourceScope: text("source_scope").notNull(),
  sourceId: text("source_id"),
  message: text("message").notNull(),
  details: jsonb("details").$type<JsonObject>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseEnv } from "node:util"

import {
  assertValidChecksum,
  buildApplyResultManifest,
  compareMigrationInputHashes,
  planUnifiedPostApply,
  planUnifiedPostMigration,
  planUnifiedPostRollback,
  postRowId,
  stableHash,
  verifyUnifiedPostMigration,
  type ApplyActionPlan,
  type ApplyResultManifest,
  type MigrationIdentity,
  type MigrationOutput,
  type MigrationSnapshot,
  type MigrationSource,
  type ProposedClaim,
  type ProposedPost,
  type UnifiedPostsPlanManifest,
} from "@/lib/migrate-unified-posts-core"
import { normalizePost, type Post } from "@/lib/posts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const pageSize = 100

type Mode = "dry-run" | "apply" | "verify" | "rollback"

type CliOptions = {
  mode: Mode
  envFile: string
  ownerId: string
  manifestPath?: string
  confirmProject?: string
}

type AppwriteRow = Record<string, unknown> & { $id: string }

type Tables = {
  listRows(
    databaseId: string,
    tableId: string,
    queries?: string[]
  ): Promise<{ rows: AppwriteRow[] }>
  getRow(
    databaseId: string,
    tableId: string,
    rowId: string
  ): Promise<AppwriteRow>
  createRow(
    databaseId: string,
    tableId: string,
    rowId: string,
    data: Record<string, unknown>
  ): Promise<AppwriteRow>
  updateRow(
    databaseId: string,
    tableId: string,
    rowId: string,
    data: Record<string, unknown>
  ): Promise<AppwriteRow>
  deleteRow(
    databaseId: string,
    tableId: string,
    rowId: string
  ): Promise<unknown>
}

type MigrationState = {
  outputs: MigrationOutput[]
  snapshots: MigrationSnapshot[]
  automationRuns: MigrationSource[]
  sources: MigrationSource[]
  posts: Post[]
  claims: MigrationIdentity[]
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const options = parseArguments(argv)
  const envPath = path.resolve(root, options.envFile)
  const environment = parseEnv(readFileSync(envPath, "utf8"))
  for (const [key, value] of Object.entries(environment))
    process.env[key] = value

  const endpoint = requiredEnvironment("APPWRITE_ENDPOINT")
  const projectId = requiredEnvironment("APPWRITE_PROJECT_ID")
  const apiKey = requiredEnvironment("APPWRITE_API_KEY")
  const databaseId = process.env.APPWRITE_DATABASE_ID?.trim() || "cfarm"
  if (options.confirmProject && options.confirmProject !== projectId) {
    throw new Error(
      `--confirm-project "${options.confirmProject}" does not match APPWRITE_PROJECT_ID "${projectId}".`
    )
  }
  if (options.mode === "apply" && options.confirmProject !== projectId) {
    throw new Error(
      "Apply requires --confirm-project with the exact configured Appwrite project id."
    )
  }

  const configuration = {
    mode: options.mode,
    endpoint,
    projectId,
    databaseId,
    ownerId: options.ownerId,
    environment: options.envFile,
  }
  // This line deliberately precedes every migration or manifest write.
  console.log(
    JSON.stringify({ migrationConfiguration: configuration }, null, 2)
  )

  const { Client, Query, TablesDB } = await import("node-appwrite")
  const tables = new TablesDB(
    new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
  ) as unknown as Tables

  if (options.mode === "dry-run") {
    const state = await readMigrationState(
      tables,
      Query,
      databaseId,
      options.ownerId
    )
    const manifest = planUnifiedPostMigration({
      ownerId: options.ownerId,
      plannedAt: new Date().toISOString(),
      endpoint,
      projectId,
      databaseId,
      ...state,
      existingPosts: state.posts,
      existingClaims: state.claims,
    })
    const manifestPath = options.manifestPath
      ? path.resolve(root, options.manifestPath)
      : defaultManifestPath("plan")
    writeJsonExclusive(manifestPath, manifest)
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          manifestPath,
          checksum: manifest.checksum,
          expected: manifest.expected,
          materialConflictCount: manifest.conflicts.filter(
            (conflict) => conflict.material
          ).length,
          conflicts: manifest.conflicts,
        },
        null,
        2
      )
    )
    return
  }

  const manifestPath = path.resolve(
    root,
    required(options.manifestPath, "--manifest")
  )
  const manifestFile = readJsonFile(manifestPath)
  if (options.mode === "apply") {
    const manifest = requirePlanManifest(manifestFile)
    assertManifestScope(manifest, {
      endpoint,
      projectId,
      databaseId,
      ownerId: options.ownerId,
    })
    const materialConflicts = manifest.conflicts.filter(
      (conflict) => conflict.material
    )
    if (materialConflicts.length) {
      throw new Error(
        `Apply blocked by ${materialConflicts.length} material dry-run conflict(s).`
      )
    }

    const state = await readMigrationState(
      tables,
      Query,
      databaseId,
      options.ownerId
    )
    const drift = compareMigrationInputHashes(manifest, state)
    if (drift.length) {
      throw new Error(
        `Apply aborted because ${drift.length} migration input row(s) drifted.`
      )
    }
    const actions = planUnifiedPostApply({
      manifest,
      currentPosts: state.posts,
      currentClaims: state.claims,
    })
    if (actions.conflicts.length) {
      throw new Error(
        `Apply blocked by ${actions.conflicts.length} divergent target row(s).`
      )
    }

    const appliedAt = new Date().toISOString()
    const executedActions = await executeApply({
      tables,
      databaseId,
      ownerId: options.ownerId,
      appliedAt,
      actions,
    })
    const finalState = await readMigrationTargets(
      tables,
      Query,
      databaseId,
      options.ownerId
    )
    const result = buildApplyResultManifest({
      manifest,
      appliedAt,
      actions: executedActions,
      finalPosts: finalState.posts,
      finalClaims: finalState.claims,
    })
    const resultPath = siblingManifestPath(manifestPath, "result")
    writeJsonExclusive(resultPath, result)
    console.log(
      JSON.stringify(
        {
          applied: true,
          resultManifestPath: resultPath,
          checksum: result.checksum,
          created: result.created,
          unchanged: result.unchanged,
          enriched: result.enriched.postIds,
          conflicted: result.conflicted,
        },
        null,
        2
      )
    )
    return
  }

  if (options.mode === "verify") {
    const plan = isApplyResultManifest(manifestFile)
      ? requireApplyResultManifest(manifestFile).plan
      : requirePlanManifest(manifestFile)
    assertManifestScope(plan, {
      endpoint,
      projectId,
      databaseId,
      ownerId: options.ownerId,
    })
    const state = await readMigrationState(
      tables,
      Query,
      databaseId,
      options.ownerId
    )
    const analyticsRange = rangeIncludingSnapshots(state.snapshots)
    const analyticsPostIds = canonicalAnalyticsProjection(
      state.posts,
      state.snapshots,
      analyticsRange
    )
    const report = verifyUnifiedPostMigration({
      manifest: plan,
      outputs: state.outputs,
      snapshots: state.snapshots,
      posts: state.posts,
      claims: state.claims,
      analyticsPostIds,
      analyticsRange: analyticsRange ?? undefined,
    })
    console.log(JSON.stringify({ verified: report.ok, ...report }, null, 2))
    if (!report.ok) process.exitCode = 1
    return
  }

  const result = requireApplyResultManifest(manifestFile)
  assertManifestScope(result, {
    endpoint,
    projectId,
    databaseId,
    ownerId: options.ownerId,
  })
  const targets = await readMigrationTargets(
    tables,
    Query,
    databaseId,
    options.ownerId
  )
  const rollback = planUnifiedPostRollback({
    result,
    currentPosts: targets.posts,
    currentClaims: targets.claims,
  })
  if (rollback.conflicts.length) {
    throw new Error(
      `Rollback refused ${rollback.conflicts.length} row(s) that changed since apply.`
    )
  }
  await executeRollback({
    tables,
    databaseId,
    ownerId: options.ownerId,
    result,
    rollback,
  })
  const rollbackPath = siblingManifestPath(manifestPath, "rollback")
  writeJsonExclusive(rollbackPath, {
    kind: "unified-posts-rollback-result",
    rolledBackAt: new Date().toISOString(),
    applyResultChecksum: result.checksum,
    deleted: {
      postIds: rollback.deletePostIds,
      claimIds: rollback.deleteClaimIds,
    },
    restored: { postIds: rollback.restorePosts.map((item) => item.postId) },
  })
  console.log(
    JSON.stringify(
      {
        rolledBack: true,
        rollbackManifestPath: rollbackPath,
        deleted: {
          postIds: rollback.deletePostIds,
          claimIds: rollback.deleteClaimIds,
        },
        restoredPostIds: rollback.restorePosts.map((item) => item.postId),
      },
      null,
      2
    )
  )
}

export function parseArguments(argv: string[]): CliOptions {
  const valueOptions = new Set([
    "--env-file",
    "--owner-id",
    "--confirm-project",
    "--manifest",
  ])
  const modeOptions = new Set([
    "--dry-run",
    "--apply",
    "--verify",
    "--rollback",
  ])
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? ""
    const name = argument.split("=", 1)[0] ?? ""
    if (modeOptions.has(name)) continue
    if (!valueOptions.has(name)) {
      throw new Error(`Unknown migration argument "${argument}".`)
    }
    if (argument.includes("=")) {
      if (!argument.slice(argument.indexOf("=") + 1)) {
        throw new Error(`${name} requires a value.`)
      }
      continue
    }
    const value = argv[index + 1]
    if (!value || value.startsWith("--")) {
      throw new Error(`${name} requires a value.`)
    }
    index += 1
  }
  const modes = [
    argv.includes("--dry-run") ? "dry-run" : null,
    argv.includes("--apply") ? "apply" : null,
    argv.includes("--verify") ? "verify" : null,
    argv.includes("--rollback") ? "rollback" : null,
  ].filter((mode): mode is Mode => Boolean(mode))
  if (modes.length > 1) {
    throw new Error(
      "Choose exactly one of --dry-run, --apply, --verify, or --rollback."
    )
  }
  const mode = modes[0] ?? "dry-run"
  const ownerId = required(argumentValue(argv, "--owner-id"), "--owner-id")
  const manifestPath = argumentValue(argv, "--manifest")
  const confirmProject = argumentValue(argv, "--confirm-project")
  if (mode !== "dry-run" && !manifestPath) {
    throw new Error(`${mode} requires --manifest <path>.`)
  }
  if (mode === "apply" && !confirmProject) {
    throw new Error(
      "Apply requires --confirm-project <project-id> in addition to --apply."
    )
  }
  return {
    mode,
    envFile: argumentValue(argv, "--env-file") || ".env",
    ownerId,
    manifestPath,
    confirmProject,
  }
}

async function readMigrationState(
  tables: Tables,
  Query: typeof import("node-appwrite").Query,
  databaseId: string,
  ownerId: string
): Promise<MigrationState> {
  const [
    outputRows,
    mediaRows,
    snapshotRows,
    automationRunRows,
    automationRows,
    xAutomationRows,
    targets,
  ] = await Promise.all([
    listOwnerRows(tables, Query, databaseId, "outputs", ownerId),
    listOwnerRows(tables, Query, databaseId, "output_media", ownerId),
    listOwnerRows(
      tables,
      Query,
      databaseId,
      "postfast_metric_snapshots",
      ownerId
    ),
    listOwnerRows(tables, Query, databaseId, "automation_runs", ownerId),
    listOwnerRows(tables, Query, databaseId, "automations", ownerId),
    listOwnerRows(tables, Query, databaseId, "x_automations", ownerId),
    readMigrationTargets(tables, Query, databaseId, ownerId),
  ])
  const mediaByOutput = new Map<string, AppwriteRow[]>()
  for (const row of mediaRows) {
    const outputId = text(row.output_id)
    mediaByOutput.set(outputId, [...(mediaByOutput.get(outputId) ?? []), row])
  }
  for (const media of mediaByOutput.values()) {
    media.sort((left, right) => left.$id.localeCompare(right.$id))
  }
  const outputs = outputRows.map((row): MigrationOutput => {
    const media = mediaByOutput.get(row.$id) ?? []
    return {
      rowId: row.$id,
      rid: required(text(row.rid), `outputs/${row.$id}.rid`),
      sourceKey: text(row.source_key),
      sourceAutomationId: optionalText(row.source_automation_id),
      sourceRunId: optionalText(row.source_run_id),
      sourceEntityId: optionalText(row.source_entity_id),
      status: optionalText(row.status),
      title: optionalText(row.title),
      caption: optionalText(row.caption),
      text: optionalText(row.text),
      hashtags: parseJson(row.hashtags),
      createdAt: optionalText(row.created_raw) ?? optionalText(row.$createdAt),
      updatedAt: optionalText(row.updated_at) ?? optionalText(row.$updatedAt),
      publications: parseJson(row.publications),
      data: parseJson(row.data),
      media: media.map((item) => ({
        kind: optionalText(item.kind),
        role: optionalText(item.role),
        position: number(item.position),
        url: optionalText(item.url),
      })),
      raw: { row, media },
    }
  })
  const snapshots = snapshotRows.map((row): MigrationSnapshot => {
    const snapshot = parseRecord(row.data)
    return {
      ...(snapshot as unknown as Omit<MigrationSnapshot, "rowId" | "raw">),
      rowId: row.$id,
      raw: row,
    }
  })
  const automationRuns = automationRunRows.map((row) =>
    sourceRow("automation_runs", row)
  )
  const allSources = [
    ...automationRows.map((row) => sourceRow("automations", row)),
    ...xAutomationRows.map((row) => sourceRow("x_automations", row)),
    ...outputRows
      .filter((row) =>
        ["result", "generated_video", "x_automation_run"].includes(
          text(row.source_key)
        )
      )
      .map((row) => sourceRow("outputs", row)),
  ]
  const relevantIds = new Set(
    outputs.flatMap((output) =>
      [
        output.rid,
        output.sourceAutomationId,
        output.sourceRunId,
        output.sourceEntityId,
      ].filter((value): value is string => Boolean(value))
    )
  )
  const sourceIsRelevant = (source: MigrationSource) => {
    const data = parseRecord(source.data)
    return [
      source.rid,
      text(data.id),
      text(data.automationId),
      text(data.runId),
    ]
      .filter(Boolean)
      .some((id) => relevantIds.has(id))
  }
  return {
    outputs,
    snapshots,
    automationRuns: automationRuns.filter(sourceIsRelevant),
    sources: allSources.filter(sourceIsRelevant),
    ...targets,
  }
}

async function readMigrationTargets(
  tables: Tables,
  Query: typeof import("node-appwrite").Query,
  databaseId: string,
  ownerId: string
): Promise<Pick<MigrationState, "posts" | "claims">> {
  const [postRows, identityRows] = await Promise.all([
    listOwnerRows(tables, Query, databaseId, "posts", ownerId),
    listOwnerRows(tables, Query, databaseId, "post_identities", ownerId),
  ])
  const posts = postRows.map((row) => {
    const post = normalizePost(parseJson(row.data))
    if (!post || post.ownerId !== ownerId) {
      throw new Error(`Stored canonical post row "${row.$id}" is invalid.`)
    }
    return post
  })
  const claims = identityRows.map((row): MigrationIdentity => {
    const data = parseRecord(row.data)
    const claim = parseRecord(data.claim)
    const kind = text(row.identity_kind)
    const key = text(claim.key)
    if (
      ![
        "post_id",
        "postfast",
        "provider_external",
        "intent",
        "legacy_source",
      ].includes(kind) ||
      !key
    ) {
      throw new Error(`Stored post identity row "${row.$id}" is invalid.`)
    }
    return {
      rowId: row.$id,
      ownerId: text(row.owner_id),
      postId: text(row.post_id),
      claim: {
        kind: kind as MigrationIdentity["claim"]["kind"],
        key,
      },
      createdAt: optionalText(row.created_at),
    }
  })
  return { posts, claims }
}

async function executeApply(input: {
  tables: Tables
  databaseId: string
  ownerId: string
  appliedAt: string
  actions: ApplyActionPlan
}): Promise<ApplyActionPlan> {
  const executed: ApplyActionPlan = {
    createPosts: [],
    unchangedPostIds: [...input.actions.unchangedPostIds],
    enrichPosts: [],
    createClaims: [],
    unchangedClaimIds: [...input.actions.unchangedClaimIds],
    conflicts: [],
  }
  for (const proposal of input.actions.createPosts) {
    const created = await createOrComparePost(
      input.tables,
      input.databaseId,
      proposal,
      input.appliedAt
    )
    if (created) executed.createPosts.push(proposal)
    else executed.unchangedPostIds.push(proposal.post.id)
  }
  for (const proposal of input.actions.enrichPosts) {
    await enrichPost(
      input.tables,
      input.databaseId,
      input.ownerId,
      proposal,
      input.appliedAt
    )
    executed.enrichPosts.push(proposal)
  }
  for (const proposal of input.actions.createClaims) {
    const created = await createOrCompareClaim(
      input.tables,
      input.databaseId,
      proposal
    )
    if (created) executed.createClaims.push(proposal)
    else executed.unchangedClaimIds.push(proposal.rowId)
  }
  executed.unchangedPostIds = [...new Set(executed.unchangedPostIds)].sort()
  executed.unchangedClaimIds = [...new Set(executed.unchangedClaimIds)].sort()
  return executed
}

async function createOrComparePost(
  tables: Tables,
  databaseId: string,
  proposal: ProposedPost,
  appliedAt: string
): Promise<boolean> {
  try {
    await tables.createRow(
      databaseId,
      "posts",
      proposal.rowId,
      postRowFields(proposal.post, appliedAt)
    )
    return true
  } catch (error) {
    if (appwriteStatus(error) !== 409) throw error
    const existing = await readPostRow(tables, databaseId, proposal.rowId)
    if (!existing || stableHash(existing) !== stableHash(proposal.post)) {
      throw new Error(
        `Post "${proposal.post.id}" raced with a divergent create; it was not overwritten.`
      )
    }
    return false
  }
}

async function enrichPost(
  tables: Tables,
  databaseId: string,
  ownerId: string,
  proposal: ProposedPost,
  appliedAt: string
) {
  const current = await readPostRow(tables, databaseId, proposal.rowId)
  if (
    !current ||
    !proposal.preimageHash ||
    stableHash(current) !== proposal.preimageHash
  ) {
    throw new Error(
      `Post "${proposal.post.id}" changed before enrichment; it was not overwritten.`
    )
  }
  if (proposal.post.ownerId !== ownerId) {
    throw new Error(`Post "${proposal.post.id}" has the wrong owner.`)
  }
  await tables.updateRow(
    databaseId,
    "posts",
    proposal.rowId,
    postRowFields(proposal.post, appliedAt)
  )
}

async function createOrCompareClaim(
  tables: Tables,
  databaseId: string,
  proposal: ProposedClaim
): Promise<boolean> {
  try {
    await tables.createRow(
      databaseId,
      "post_identities",
      proposal.rowId,
      claimRowFields(proposal)
    )
    return true
  } catch (error) {
    if (appwriteStatus(error) !== 409) throw error
    const existing = await readClaimRow(tables, databaseId, proposal.rowId)
    if (!existing || !sameClaim(existing, proposal)) {
      throw new Error(
        `Identity "${proposal.rowId}" raced with a divergent create; it was not overwritten.`
      )
    }
    return false
  }
}

async function executeRollback(input: {
  tables: Tables
  databaseId: string
  ownerId: string
  result: ApplyResultManifest
  rollback: ReturnType<typeof planUnifiedPostRollback>
}) {
  const hashes = new Map(
    input.result.appliedRowHashes.map((row) => [
      `${row.table}:${row.rowId}`,
      row.hash,
    ])
  )
  for (const rowId of input.rollback.deleteClaimIds) {
    const current = await readClaimRow(input.tables, input.databaseId, rowId)
    if (
      !current ||
      stableHash(claimRowComparable(current)) !==
        hashes.get(`post_identities:${rowId}`)
    ) {
      throw new Error(`Identity "${rowId}" changed during rollback.`)
    }
    await input.tables.deleteRow(input.databaseId, "post_identities", rowId)
  }
  for (const postId of input.rollback.deletePostIds) {
    const rowId = postRowId(input.ownerId, postId)
    const current = await readPostRow(input.tables, input.databaseId, rowId)
    if (!current || stableHash(current) !== hashes.get(`posts:${rowId}`)) {
      throw new Error(`Post "${postId}" changed during rollback.`)
    }
    await input.tables.deleteRow(input.databaseId, "posts", rowId)
  }
  for (const restoration of input.rollback.restorePosts) {
    const rowId = postRowId(input.ownerId, restoration.postId)
    const current = await readPostRow(input.tables, input.databaseId, rowId)
    if (!current || stableHash(current) !== hashes.get(`posts:${rowId}`)) {
      throw new Error(`Post "${restoration.postId}" changed during rollback.`)
    }
    await input.tables.updateRow(
      input.databaseId,
      "posts",
      rowId,
      postRowFields(restoration.post, new Date().toISOString())
    )
  }
}

async function listOwnerRows(
  tables: Tables,
  Query: typeof import("node-appwrite").Query,
  databaseId: string,
  table: string,
  ownerId: string
) {
  const rows: AppwriteRow[] = []
  let cursor: string | null = null
  for (;;) {
    const queries = [Query.equal("owner_id", [ownerId]), Query.limit(pageSize)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const response = await tables.listRows(databaseId, table, queries)
    rows.push(...response.rows)
    if (response.rows.length < pageSize) break
    cursor = response.rows.at(-1)?.$id ?? null
  }
  return rows
}

async function readPostRow(
  tables: Tables,
  databaseId: string,
  rowId: string
): Promise<Post | null> {
  try {
    const row = await tables.getRow(databaseId, "posts", rowId)
    return normalizePost(parseJson(row.data))
  } catch (error) {
    if (appwriteStatus(error) === 404) return null
    throw error
  }
}

async function readClaimRow(
  tables: Tables,
  databaseId: string,
  rowId: string
): Promise<MigrationIdentity | null> {
  try {
    const row = await tables.getRow(databaseId, "post_identities", rowId)
    const data = parseRecord(row.data)
    const claim = parseRecord(data.claim)
    return {
      rowId,
      ownerId: text(row.owner_id),
      postId: text(row.post_id),
      claim: {
        kind: text(row.identity_kind) as MigrationIdentity["claim"]["kind"],
        key: text(claim.key),
      },
      createdAt: optionalText(row.created_at),
    }
  } catch (error) {
    if (appwriteStatus(error) === 404) return null
    throw error
  }
}

function postRowFields(post: Post, reconciledAt: string) {
  return {
    rid: post.id.slice(0, 1024),
    owner_id: post.ownerId,
    source_key: "canonical_post",
    schema_version: post.schemaVersion,
    intent_id: post.intentId.slice(0, 1024),
    origin: post.origin,
    source_type: post.sourceType ?? null,
    source_id: post.sourceId?.slice(0, 1024) ?? null,
    output_id: post.outputId?.slice(0, 255) ?? null,
    source_automation_id: post.automationId?.slice(0, 255) ?? null,
    source_run_id: post.runId?.slice(0, 255) ?? null,
    source_entity_id: post.sourceEntityId?.slice(0, 255) ?? null,
    integration_id: post.integrationId?.slice(0, 255) ?? null,
    provider: post.provider ?? null,
    lifecycle_status: post.lifecycleStatus,
    link_state: post.linkState,
    postfast_post_id: post.postfastPostId?.slice(0, 255) ?? null,
    external_post_id: post.externalPostId?.slice(0, 1024) ?? null,
    scheduled_at: post.scheduledAt ?? null,
    published_at: post.publishedAt ?? null,
    created_at: post.createdAt,
    updated_at: post.updatedAt,
    release_url: post.releaseUrl ?? null,
    write_state: "reconciled",
    reconciled_at: reconciledAt,
    repair_data: null,
    data: JSON.stringify(post),
  }
}

function claimRowFields(claim: ProposedClaim) {
  return {
    rid: claim.identityHash,
    owner_id: claim.ownerId,
    source_key: "post_identity",
    identity_kind: claim.claim.kind,
    identity_hash: claim.identityHash,
    post_id: claim.postId,
    created_at: claim.createdAt,
    data: JSON.stringify({ claim: claim.claim }),
  }
}

function sourceRow(table: string, row: AppwriteRow): MigrationSource {
  return {
    table,
    rowId: row.$id,
    rid: text(row.rid),
    sourceKey: optionalText(row.source_key),
    data: parseJson(row.data),
    raw: row,
  }
}

function canonicalAnalyticsProjection(
  posts: Post[],
  snapshots: MigrationSnapshot[],
  range: { from: string; to: string } | null
): string[] {
  if (!range) return []
  const postIds = new Set(
    posts.filter((post) => !post.mergedIntoId).map((post) => post.id)
  )
  return snapshots
    .filter(
      (snapshot) =>
        postIds.has(snapshot.postId) &&
        Date.parse(snapshot.capturedAt) >= Date.parse(range.from) &&
        Date.parse(snapshot.capturedAt) <= Date.parse(range.to)
    )
    .map((snapshot) => snapshot.postId)
}

function rangeIncludingSnapshots(
  snapshots: MigrationSnapshot[]
): { from: string; to: string } | null {
  const captured = snapshots
    .map((snapshot) => Date.parse(snapshot.capturedAt))
    .filter(Number.isFinite)
  if (!captured.length) return null
  return {
    from: new Date(Math.min(...captured)).toISOString(),
    to: new Date(Math.max(Date.now(), ...captured)).toISOString(),
  }
}

function requirePlanManifest(value: unknown): UnifiedPostsPlanManifest {
  if (!isPlanManifest(value)) {
    throw new Error("The supplied file is not a unified-posts plan manifest.")
  }
  assertValidChecksum(value)
  return value
}

function requireApplyResultManifest(value: unknown): ApplyResultManifest {
  if (!isApplyResultManifest(value)) {
    throw new Error(
      "Rollback requires a checksummed unified-posts apply-result manifest."
    )
  }
  assertValidChecksum(value)
  assertValidChecksum(value.plan)
  return value
}

function isPlanManifest(value: unknown): value is UnifiedPostsPlanManifest {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "unified-posts-plan"
  )
}

function isApplyResultManifest(value: unknown): value is ApplyResultManifest {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "unified-posts-apply-result"
  )
}

function assertManifestScope(
  manifest:
    | UnifiedPostsPlanManifest
    | Pick<
        ApplyResultManifest,
        "endpoint" | "projectId" | "databaseId" | "ownerId"
      >,
  expected: {
    endpoint: string
    projectId: string
    databaseId: string
    ownerId: string
  }
) {
  for (const key of [
    "endpoint",
    "projectId",
    "databaseId",
    "ownerId",
  ] as const) {
    if (manifest[key] !== expected[key]) {
      throw new Error(
        `Manifest ${key} "${manifest[key]}" does not match active ${key} "${expected[key]}".`
      )
    }
  }
}

function writeJsonExclusive(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function defaultManifestPath(kind: string) {
  return path.join(
    root,
    "data",
    "backups",
    `unified-posts-${kind}-${safeTimestamp()}.json`
  )
}

function siblingManifestPath(filePath: string, suffix: string) {
  const extension = path.extname(filePath)
  const base = extension ? filePath.slice(0, -extension.length) : filePath
  return `${base}.${suffix}.json`
}

function safeTimestamp() {
  return new Date().toISOString().replaceAll(":", "-")
}

function argumentValue(argv: string[], name: string) {
  const exact = argv.find((argument) => argument.startsWith(`${name}=`))
  if (exact) return exact.slice(name.length + 1)
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

function requiredEnvironment(name: string) {
  return required(process.env[name]?.trim(), name)
}

function required(value: string | undefined, label: string): string {
  const normalized = value?.trim()
  if (!normalized) throw new Error(`${label} is required.`)
  return normalized
}

function optionalText(value: unknown): string | undefined {
  return text(value) || undefined
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function number(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function parseRecord(value: unknown): Record<string, unknown> {
  const parsed = parseJson(value)
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {}
}

function appwriteStatus(error: unknown) {
  if (!error || typeof error !== "object") return null
  const value = (error as { code?: unknown }).code
  return typeof value === "number" ? value : Number(value) || null
}

function sameClaim(left: MigrationIdentity, right: MigrationIdentity) {
  return (
    stableHash(claimComparable(left)) === stableHash(claimComparable(right))
  )
}

function claimComparable(identity: MigrationIdentity) {
  return {
    rowId: identity.rowId,
    ownerId: identity.ownerId,
    postId: identity.postId,
    claim: identity.claim,
  }
}

function claimRowComparable(identity: MigrationIdentity) {
  return {
    ...claimComparable(identity),
    createdAt: identity.createdAt,
  }
}

function isDirectExecution() {
  const entry = process.argv[1]
  return Boolean(
    entry && path.resolve(entry) === fileURLToPath(import.meta.url)
  )
}

if (isDirectExecution()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}

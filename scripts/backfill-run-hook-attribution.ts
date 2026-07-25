/**
 * Backup-first, dry-run-by-default repair for orphaned run hook attribution.
 *
 * Preview:
 *   pnpm tsx scripts/backfill-run-hook-attribution.ts --env-file=.env.local
 *
 * Apply (writes a validated backup before changing any run):
 *   pnpm tsx scripts/backfill-run-hook-attribution.ts --env-file=.env.local --apply
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { parseEnv } from "node:util"

const allowedFlags = new Set(["--env-file", "--apply"])
for (const argument of process.argv.slice(2)) {
  if (
    argument.startsWith("--") &&
    !allowedFlags.has(argument.split("=", 1)[0])
  ) {
    throw new Error(`Unknown flag: ${argument.split("=", 1)[0]}`)
  }
}

const envFile = argumentValue("--env-file")
if (!envFile) throw new Error("Pass --env-file=<path> explicitly.")
const apply = process.argv.includes("--apply")
const environment = parseEnv(readFileSync(envFile, "utf8"))
for (const [key, value] of Object.entries(environment)) process.env[key] = value

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
  { listAutomationRecords },
  { listAutomationRunsForMigration, upsertRecoveredAutomationRun },
  { uniqueHookTemplateMatch },
  { automationHookItems },
  { withSystemOwner },
] = await Promise.all([
  import("@/lib/automations"),
  import("@/lib/automation-runner"),
  import("@/lib/hook-expansion"),
  import("@/lib/realfarm-automation"),
  import("@/lib/system-owner-context"),
])

const result = await withSystemOwner(ownerId, async () => {
  const [automations, runs] = await Promise.all([
    listAutomationRecords(),
    listAutomationRunsForMigration(),
  ])
  const hooksByAutomation = new Map(
    automations.map((automation) => [
      automation.id,
      automationHookItems(automation.schema),
    ])
  )
  const repairs = runs.flatMap((run) => {
    const hooks = hooksByAutomation.get(run.automationId) ?? []
    const match =
      hooks.find((hook) => hook.id === run.plan.hookId) ??
      uniqueHookTemplateMatch(hooks, {
        hookTemplate: run.plan.hookTemplate,
        renderedHook: run.plan.hook,
      })
    if (!match) return []
    if (
      run.plan.hookId === match.id &&
      normalizedText(run.plan.hookTemplate) === normalizedText(match.text)
    ) {
      return []
    }
    return [
      {
        before: run,
        after: {
          ...run,
          plan: {
            ...run.plan,
            hookId: match.id,
            hookTemplate: match.text,
          },
          updatedAt: new Date().toISOString(),
        },
      },
    ]
  })

  let backupFile: string | undefined
  if (apply && repairs.length > 0) {
    mkdirSync("backups/hook-attribution", { recursive: true })
    backupFile = path.join(
      "backups/hook-attribution",
      `runs-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
    )
    writeFileSync(
      backupFile,
      `${JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          ownerId,
          runs: repairs.map((repair) => repair.before),
        },
        null,
        2
      )}\n`,
      { flag: "wx" }
    )
    const backup = JSON.parse(readFileSync(backupFile, "utf8")) as {
      runs?: unknown[]
    }
    if (backup.runs?.length !== repairs.length) {
      throw new Error("Backup validation failed; no runs were changed.")
    }
    for (const repair of repairs) {
      await upsertRecoveredAutomationRun(repair.after)
    }
  }

  return {
    environment: envFile,
    ownerId,
    dryRun: !apply,
    automationsScanned: automations.length,
    runsScanned: runs.length,
    repairCandidates: repairs.length,
    backupFile,
    repairs: repairs.map(({ before, after }) => ({
      runId: before.id,
      automationId: before.automationId,
      previousHookId: before.plan.hookId,
      canonicalHookId: after.plan.hookId,
      hookTemplate: after.plan.hookTemplate,
    })),
  }
})

console.log(JSON.stringify(result, null, 2))

function argumentValue(name: string) {
  const exact = process.argv.find((argument) => argument.startsWith(`${name}=`))
  if (exact) return exact.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function normalizedText(value: string | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ")
}

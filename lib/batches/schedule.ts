/**
 * Publish-slot planner for batches. Pure and deterministic: the same config,
 * occupied posts, clock and seed always give the same slots, so a preview and
 * the create that follows it agree.
 *
 * Model:
 * - Items are dealt round-robin across `accountIds` (item i → account i mod A).
 * - Every account posts on the same local grid: `timesOfDay` (or `postsPerDay`
 *   evenly spaced inside `window`) on each calendar day from `startDate` in
 *   `timezone`, at most `maxPerAccountPerDay` per day.
 * - Each slot gets a deterministic jitter of `jitterMinutes.min..max` minutes.
 * - With `skipOccupied`, an account's existing posts count toward its daily
 *   cap, and no slot lands closer than `minGapMinutes` to another post of the
 *   same account (existing or planned in this batch).
 * - Slots before `now + minLeadMinutes` are skipped (render + upload time).
 *
 * DST: local times are converted with Luxon in the target zone. A time that
 * does not exist (spring-forward gap) moves forward by the gap (02:30 → 03:30);
 * an ambiguous time (fall-back overlap) uses the earlier offset.
 */
import { DateTime, IANAZone } from "luxon"
import { z } from "zod"

import { sha256Hex } from "@/lib/data/crypto"
import { BATCH_MODES, type BatchScheduleConfig } from "@/lib/data/types"

export const DEFAULT_TIMES_OF_DAY = ["09:00", "13:00", "19:00"] as const
export const DEFAULT_WINDOW = { start: "09:00", end: "21:00" } as const
export const DEFAULT_MAX_PER_ACCOUNT_PER_DAY = 3
export const DEFAULT_JITTER_MINUTES = { min: 0, max: 10 } as const
export const DEFAULT_MIN_GAP_MINUTES = 30
export const DEFAULT_MIN_LEAD_MINUTES = 15
/** The planner never looks further ahead than this (SocialBu/LumenClip accept ≤ 1 year). */
export const MAX_SCHEDULE_DAYS = 365

export type BatchIssue = { code: string; path: string; message: string }

const HHMM = z
  .string()
  .regex(
    /^([01]\d|2[0-3]):[0-5]\d$/,
    'Use 24-hour "HH:MM" local times, e.g. "09:00".'
  )

/** Request shape of `schedule` (POST /batches, /batches/preview, MCP). */
export const ScheduleInputSchema = z.strictObject({
  accountIds: z.array(z.string().trim().min(1).max(64)).min(1).max(50),
  timezone: z.string().min(1).max(64).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use "YYYY-MM-DD".')
    .optional(),
  timesOfDay: z.array(HHMM).min(1).max(24).optional(),
  postsPerDay: z.number().int().min(1).max(24).optional(),
  window: z.strictObject({ start: HHMM, end: HHMM }).optional(),
  maxPerAccountPerDay: z.number().int().min(1).max(24).optional(),
  skipOccupied: z.boolean().optional(),
  minGapMinutes: z.number().int().min(0).max(720).optional(),
  jitterMinutes: z
    .union([
      z.number().int().min(0).max(120),
      z.strictObject({
        min: z.number().int().min(0).max(120),
        max: z.number().int().min(0).max(120),
      }),
    ])
    .optional(),
  minLeadMinutes: z.number().int().min(0).max(1440).optional(),
  mode: z.enum(BATCH_MODES).optional(),
  privacyStatus: z.string().min(1).max(64).optional(),
})
export type ScheduleInput = z.input<typeof ScheduleInputSchema>

export function isValidTimezone(zone: string): boolean {
  return IANAZone.isValidZone(zone)
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return h! * 60 + m!
}

function hhmmOf(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
}

/** `n` times evenly spaced inside [start, end): the centres of n equal bins. */
export function evenlySpacedTimes(
  n: number,
  window: { start: string; end: string }
): string[] {
  const start = minutesOf(window.start)
  const span = minutesOf(window.end) - start
  return Array.from({ length: n }, (_, k) =>
    hhmmOf(start + Math.floor((span * (2 * k + 1)) / (2 * n)))
  )
}

/**
 * Validates and fills defaults. `defaultTimezone` is the workspace timezone;
 * `now` picks the default start date (today in the timezone).
 */
export function normalizeScheduleConfig(
  input: unknown,
  options: { defaultTimezone?: string; now: Date; path?: string }
):
  | { ok: true; config: BatchScheduleConfig }
  | { ok: false; errors: BatchIssue[] } {
  const base = options.path ?? "/schedule"
  const parsed = ScheduleInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        code: `schedule.${issue.code}`,
        path: `${base}${issue.path.length ? "/" + issue.path.map(String).join("/") : ""}`,
        message: issue.message,
      })),
    }
  }
  const s = parsed.data
  const errors: BatchIssue[] = []
  const timezone = s.timezone ?? options.defaultTimezone ?? "UTC"
  if (!isValidTimezone(timezone)) {
    errors.push({
      code: "schedule.timezone",
      path: `${base}/timezone`,
      message: `"${timezone}" is not an IANA timezone, e.g. "America/New_York".`,
    })
  }
  const zone = isValidTimezone(timezone) ? timezone : "UTC"
  let startDate =
    s.startDate ?? DateTime.fromJSDate(options.now, { zone }).toISODate()!
  if (s.startDate) {
    const start = DateTime.fromISO(s.startDate, { zone })
    if (!start.isValid) {
      errors.push({
        code: "schedule.start_date",
        path: `${base}/startDate`,
        message: `${s.startDate} is not a real date.`,
      })
    } else {
      startDate = start.toISODate()!
    }
  }
  if (s.timesOfDay && s.postsPerDay !== undefined) {
    errors.push({
      code: "schedule.times_conflict",
      path: `${base}/postsPerDay`,
      message: "Give either timesOfDay or postsPerDay (with window), not both.",
    })
  }
  if (s.window && !s.postsPerDay) {
    errors.push({
      code: "schedule.window_unused",
      path: `${base}/window`,
      message: "window only applies with postsPerDay.",
    })
  }
  const window = s.postsPerDay ? (s.window ?? { ...DEFAULT_WINDOW }) : null
  if (window && minutesOf(window.end) <= minutesOf(window.start)) {
    errors.push({
      code: "schedule.window",
      path: `${base}/window`,
      message: "window.end must be later than window.start on the same day.",
    })
  }
  const timesOfDay =
    s.postsPerDay && window
      ? [...new Set(evenlySpacedTimes(s.postsPerDay, window))]
      : [...new Set(s.timesOfDay ?? DEFAULT_TIMES_OF_DAY)].sort()
  const jitter =
    typeof s.jitterMinutes === "number"
      ? { min: 0, max: s.jitterMinutes }
      : (s.jitterMinutes ?? { ...DEFAULT_JITTER_MINUTES })
  if (jitter.min > jitter.max) {
    errors.push({
      code: "schedule.jitter",
      path: `${base}/jitterMinutes`,
      message: "jitterMinutes.min must not exceed max.",
    })
  }
  const accountIds = [...new Set(s.accountIds)]
  if (accountIds.length !== s.accountIds.length) {
    errors.push({
      code: "schedule.duplicate_account",
      path: `${base}/accountIds`,
      message: "accountIds contains duplicates.",
    })
  }
  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    config: {
      accountIds,
      timezone,
      startDate,
      timesOfDay,
      postsPerDay: s.postsPerDay ?? null,
      window,
      maxPerAccountPerDay:
        s.maxPerAccountPerDay ?? DEFAULT_MAX_PER_ACCOUNT_PER_DAY,
      skipOccupied: s.skipOccupied ?? true,
      minGapMinutes: s.minGapMinutes ?? DEFAULT_MIN_GAP_MINUTES,
      jitterMinutes: jitter,
      minLeadMinutes: s.minLeadMinutes ?? DEFAULT_MIN_LEAD_MINUTES,
      mode: s.mode ?? "schedule",
      privacyStatus: s.privacyStatus ?? null,
    },
  }
}

/** An existing post that may block a slot. */
export type OccupiedSlot = { accountId: string; at: string }

export type ScheduledSlot = {
  index: number
  accountId: string
  /** UTC ISO instant (jitter included). */
  publishAt: string
  /** Local wall time in the schedule timezone, `YYYY-MM-DD HH:mm`. */
  localTime: string
}

export class ScheduleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ScheduleError"
  }
}

export type ComputeScheduleInput = {
  itemCount: number
  config: BatchScheduleConfig
  occupied?: readonly OccupiedSlot[]
  now: Date
  /** Seeds the jitter. */
  seed: string
  /** Account per item (overrides round-robin; used when retrying one item). */
  accountForItem?: (index: number) => string
}

function jitterMinutes(
  seed: string,
  accountId: string,
  day: string,
  time: string,
  range: { min: number; max: number }
) {
  const width = range.max - range.min + 1
  if (width <= 1) return range.min
  const n = Number.parseInt(
    sha256Hex(`${seed}|${accountId}|${day}|${time}`).slice(0, 8),
    16
  )
  return range.min + (n % width)
}

/** Deterministic publish slots for `itemCount` items (see module doc). */
export function computeSchedule(input: ComputeScheduleInput): ScheduledSlot[] {
  const { config, now, seed } = input
  if (input.itemCount <= 0) return []
  if (!config.accountIds.length)
    throw new ScheduleError("Choose at least one account.")
  const zone = config.timezone
  const earliest = now.getTime() + config.minLeadMinutes * 60_000
  const gapMs = config.minGapMinutes * 60_000
  const times = [...config.timesOfDay].sort()
  const cap = Math.min(config.maxPerAccountPerDay, times.length)
  const start = DateTime.fromISO(config.startDate, { zone }).startOf("day")
  if (!start.isValid)
    throw new ScheduleError(`Invalid start date ${config.startDate}.`)

  const accountOf =
    input.accountForItem ??
    ((index: number) => config.accountIds[index % config.accountIds.length]!)
  const itemsByAccount = new Map<string, number[]>()
  for (let index = 0; index < input.itemCount; index++) {
    const account = accountOf(index)
    const list = itemsByAccount.get(account) ?? []
    list.push(index)
    itemsByAccount.set(account, list)
  }

  const taken = new Map<string, number[]>()
  const perDay = new Map<string, number>()
  if (config.skipOccupied) {
    for (const slot of input.occupied ?? []) {
      const ms = Date.parse(slot.at)
      if (!Number.isFinite(ms) || !itemsByAccount.has(slot.accountId)) continue
      const list = taken.get(slot.accountId) ?? []
      list.push(ms)
      taken.set(slot.accountId, list)
      const day = DateTime.fromMillis(ms, { zone }).toISODate()!
      const key = `${slot.accountId}|${day}`
      perDay.set(key, (perDay.get(key) ?? 0) + 1)
    }
  }
  const blocked = (accountId: string, at: number) =>
    (taken.get(accountId) ?? []).some(
      (other) => Math.abs(other - at) < Math.max(gapMs, 1)
    )

  const result: ScheduledSlot[] = new Array(input.itemCount)
  for (const [accountId, indexes] of itemsByAccount) {
    let next = 0
    for (let offset = 0; next < indexes.length; offset++) {
      if (offset > MAX_SCHEDULE_DAYS) {
        throw new ScheduleError(
          `Not enough free slots for account ${accountId} within ${MAX_SCHEDULE_DAYS} days; add times, accounts or raise maxPerAccountPerDay.`
        )
      }
      const day = start.plus({ days: offset })
      const dayKey = day.toISODate()!
      const capKey = `${accountId}|${dayKey}`
      let used = perDay.get(capKey) ?? 0
      for (const time of times) {
        if (next >= indexes.length || used >= cap) break
        const [hour, minute] = time.split(":").map(Number)
        const local = DateTime.fromObject(
          { year: day.year, month: day.month, day: day.day, hour, minute },
          { zone }
        )
        const base = local.toMillis()
        if (base < earliest) continue
        const at =
          base +
          jitterMinutes(seed, accountId, dayKey, time, config.jitterMinutes) *
            60_000
        if (config.skipOccupied && blocked(accountId, at)) continue
        const index = indexes[next++]!
        result[index] = {
          index,
          accountId,
          publishAt: new Date(at).toISOString(),
          localTime: DateTime.fromMillis(at, { zone }).toFormat(
            "yyyy-MM-dd HH:mm"
          ),
        }
        used++
        const list = taken.get(accountId) ?? []
        list.push(at)
        taken.set(accountId, list)
      }
      perDay.set(capKey, used)
    }
  }
  return result
}

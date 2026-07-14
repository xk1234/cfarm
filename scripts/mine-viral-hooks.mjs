/**
 * Search the 46K-hook viral corpus (data/viral-hooks/hooks.jsonl) for proven
 * overperformers on a topic. Hooks are ranked by "lift": log10(views) minus
 * log10(that account's median views) — i.e. how hard the hook outperformed
 * its own account, which removes account-size bias. lift 1.0 = 10x the
 * account's median, 2.0 = 100x.
 *
 * Usage:
 *   node scripts/mine-viral-hooks.mjs zodiac astrology            # any-keyword match
 *   node scripts/mine-viral-hooks.mjs --all "red flags"           # phrase match
 *   node scripts/mine-viral-hooks.mjs --limit 40 love soulmate
 *   node scripts/mine-viral-hooks.mjs --min-lift 1 --limit 50 women
 */
import { createInterface } from "node:readline"
import { createReadStream } from "node:fs"
import path from "node:path"

const args = process.argv.slice(2)
const terms = []
let limit = 25
let minLift = 0.3
let matchAll = false
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--limit") limit = Number(args[++i]) || limit
  else if (args[i] === "--min-lift") minLift = Number(args[++i]) ?? minLift
  else if (args[i] === "--all") matchAll = true
  else terms.push(args[i].toLowerCase())
}
if (terms.length === 0) {
  console.error("Usage: node scripts/mine-viral-hooks.mjs [--limit N] [--min-lift X] [--all] <keyword|phrase>...")
  process.exit(1)
}

const file = path.join(process.cwd(), "data", "viral-hooks", "hooks.jsonl")
const matches = []
const rl = createInterface({ input: createReadStream(file, "utf8") })
for await (const line of rl) {
  if (!line.trim()) continue
  const row = JSON.parse(line)
  const text = row.t.toLowerCase()
  const hit = matchAll
    ? terms.every((term) => text.includes(term))
    : terms.some((term) => text.includes(term))
  if (hit && row.l >= minLift) matches.push(row)
}
matches.sort((a, b) => b.l - a.l)

console.log(`${matches.length} hooks matched [${terms.join(", ")}] with lift >= ${minLift} (showing ${Math.min(limit, matches.length)})\n`)
for (const row of matches.slice(0, limit)) {
  const mult = Math.round(10 ** row.l)
  console.log(`${row.l.toFixed(2).padStart(5)} (~${mult}x) ${String(row.v).padStart(9)} views @${row.u} [${row.c}]`)
  console.log(`      ${row.t}\n`)
}

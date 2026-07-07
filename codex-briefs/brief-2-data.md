# Task: Data-integrity fixes for cfarm

Work in the current repo. Verify with `npx tsc --noEmit` after each item. Do NOT run vitest (native bindings broken in this VM). Do not commit. Keep existing tests updated where they exist.

## 1. Harden lib/json-store.ts
Current problems: any read failure returns `[]` (so a corrupt/partially-written file leads to the next write persisting an empty store = data wipe), and writes use a plain `writeFile` (non-atomic).
- Read: only return the default/empty value on ENOENT. Rethrow all other errors (corrupt JSON should throw a descriptive error, not silently return []).
- Write: write to a temp file in the same directory (e.g. `${file}.${pid}.${random}.tmp`) then `fs.rename` over the target (atomic on same fs). Before renaming, if the target exists, copy it to `${file}.bak` (best-effort).
- Add an in-process write mutex per file path (a simple promise-chain map keyed by absolute path) and expose a `withStore(file, fn)` style helper (or equivalent given the existing API — inspect the current exports and preserve the public API used by ~11 lib modules; extend rather than break).
- Update `lib/json-store.test.ts` to cover: corrupt JSON throws; ENOENT returns default; concurrent updates serialize.

## 2. Fix the automation-runner race (overlapping cron invocations)
File: `lib/automation-runner.ts` (see `runDueAutomations`, the `already_ran` dedupe, and the final runs write).
Current problem: reads runs file, does minutes of generation work, writes runs at the end. Two overlapping invocations both pass dedupe → duplicate posts; second write clobbers first.
- Claim slots up front: immediately after the dedupe check identifies a due slot, persist a run record with status "pending"/"running" for that slot (using the hardened json-store write) BEFORE starting generation work. Update that same record (by id) with the outcome at the end instead of appending at the end.
- Re-read the runs file at claim time (read-check-claim under the json-store mutex) rather than trusting state read at function start.
- Also add a simple lock file or in-store "runner started at" guard so a second invocation within N minutes skips slots already claimed. Keep it simple; per-slot claiming is the main fix.
- Update `lib/automation-runner.test.ts` accordingly.

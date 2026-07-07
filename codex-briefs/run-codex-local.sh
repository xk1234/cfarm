#!/bin/bash
# Runs codex on the 4 improvement briefs sequentially, committing after each.
# Usage: bash codex-briefs/run-codex-local.sh   (from the cfarm repo root)
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
BRIEFS="$REPO/codex-briefs"
cd "$REPO" || exit 1

run_group() {
  local name="$1" brief="$2" msg="$3"
  echo ""
  echo "================ $name ================"
  codex exec --cd "$REPO" --full-auto "$(cat "$BRIEFS/$brief")" || {
    echo "codex failed on $name — stopping so you can inspect."; exit 1; }
  npx tsc --noEmit || echo "WARNING: typecheck failed after $name (committing anyway for review)"
  git add -A
  git commit -m "$msg" || echo "(nothing to commit for $name)"
}

run_group "1-security"   "brief-1-security.md"   "security: cron auth, api middleware, ssrf guards, apify key"
run_group "2-data"       "brief-2-data.md"       "data integrity: atomic json-store, automation runner race fix"
run_group "3-robustness" "brief-3-robustness.md" "robustness: fetch timeouts, shared poll helper, dedupe guards"
run_group "4-hygiene"    "brief-4-hygiene.md"    "hygiene: lint errors, lockfiles, workspace config, metadata, extension perms"

echo ""
echo "All 4 groups done. Review with: git log --oneline -5 && git diff HEAD~4"

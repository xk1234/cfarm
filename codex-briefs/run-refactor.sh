#!/bin/bash
# Runs the component-split refactor via codex, one brief at a time.
# Usage: bash codex-briefs/run-refactor.sh   (from the cfarm repo root)
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
BRIEFS="$REPO/codex-briefs"
cd "$REPO" || exit 1

echo "== Preflight: install + tests must pass before refactoring =="
pnpm install || { echo "pnpm install failed - stopping."; exit 1; }
pnpm vitest run --silent || {
  echo "Tests are failing BEFORE the refactor - stopping. Show Claude the output."; exit 1; }
git add -A && git commit -m "chore: pre-refactor checkpoint" 2>/dev/null

run_brief() {
  local name="$1" brief="$2"
  echo ""
  echo "================ $name ================"
  codex exec --cd "$REPO" --sandbox workspace-write "$(cat "$BRIEFS/$brief")" || {
    echo "codex failed on $name - stopping so you can inspect."; exit 1; }
  npx tsc --noEmit || { echo "Typecheck broken after $name - stopping."; exit 1; }
  pnpm vitest run --silent || { echo "Tests broken after $name - stopping."; exit 1; }
  git add -A && git commit -m "refactor: finalize $name" 2>/dev/null
}

run_brief "5-characters-view"      "brief-5-characters-view.md"
run_brief "6-automation-settings"  "brief-6-automation-settings.md"

echo ""
echo "Refactor complete. Review: git log --oneline -30"

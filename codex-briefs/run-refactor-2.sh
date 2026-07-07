#!/bin/bash
# Round 2: finish the characters-view split.
# Usage: bash codex-briefs/run-refactor-2.sh   (from the cfarm repo root)
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO" || exit 1

pnpm vitest run --silent || { echo "Tests failing before start - stopping."; exit 1; }

codex exec --cd "$REPO" --sandbox workspace-write "$(cat "$REPO/codex-briefs/brief-5b-characters-view.md")" || {
  echo "codex failed - stopping."; exit 1; }

npx tsc --noEmit || { echo "Typecheck broken - inspect before committing."; exit 1; }
pnpm vitest run --silent || { echo "Tests broken - inspect before committing."; exit 1; }
git add -A && git commit -m "refactor: finalize characters-view split (round 2)" 2>/dev/null

echo "Result: $(wc -l components/realfarm/characters-view.tsx)"
echo "Done. Review: git log --oneline -15"

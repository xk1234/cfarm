# Task: Split components/realfarm/automation-settings.tsx (~5,000 lines)

Refactor-only task: NO behavior change. Same rules as the characters-view split.

## Ground rules
- Incremental: after EACH extraction, `npx tsc --noEmit` must pass, then commit as `refactor(automation-settings): <what>`. Many small commits.
- Run `pnpm vitest run components lib --silent` at start (baseline) and after each commit. `components/realfarm/realfarm-source-contracts.test.ts` asserts against component source (it references `/api/automations/run` etc. in specific files) — update its file references when moving code, preserving intent.
- Keep the main export re-exported from the original path; don't change external imports.
- Mechanical moves only — no logic changes, no UI redesign. Skip anything risky and note it.
- Known warnings to fix ONLY if trivially part of a move: the two missing `alt` props (lines ~2666/2728) and the `dangerouslySetInnerHTML` SVG sink (~line 2942) — leave the innerHTML mechanism as-is, just note it.

## Target structure
- `components/realfarm/automation-settings/` directory:
  - One file per major section/modal (inspect the JSX; likely candidates: schedule editor, social account section, template/schema editor, text/prompt settings, preview pane, run-now/history panel).
  - `use-*.ts` hooks for cohesive state clusters (useReducer where 5+ useStates form one machine).
  - Pure helpers/types into plain `.ts` files first.
- Goal: no file over ~600 lines; each unit self-contained.

## Order of work
1. Baseline typecheck + vitest; note results.
2. Pure helpers/types → leaf components → hooks.
3. Final: typecheck, vitest, `npx eslint components/realfarm/automation-settings* ` — 0 errors.

Finish with a summary: files created, line counts before/after, anything skipped.

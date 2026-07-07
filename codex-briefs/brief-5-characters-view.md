# Task: Split components/realfarm/characters-view.tsx (~4,400 lines)

Refactor-only task: NO behavior change. The file is one giant client component with ~70 useState hooks and 9 useEffects.

## Ground rules
- Work incrementally. After EACH extraction: `npx tsc --noEmit` must pass, then `git add -A && git commit -m "refactor(characters): <what you extracted>"`. Many small commits, not one big one.
- Run `pnpm vitest run components lib --silent` at the start (baseline) and after each commit. IMPORTANT: `components/realfarm/realfarm-source-contracts.test.ts` asserts against component SOURCE CODE (file paths and literal strings) — when you move code, update that test's file references to match, keeping its intent.
- Do not rename exported symbols used by other files; keep the `CharactersView` (or equivalent) export re-exported from the original path so imports elsewhere don't change.
- Do not redesign UI, rename CSS classes, or "improve" logic while moving it. Pure mechanical splitting.
- If a step turns out risky or ambiguous, skip it and note it in the final summary rather than guessing.

## Target structure (adapt names to what you find)
- `components/realfarm/characters/` directory:
  - One file per major UI section/modal (inspect the JSX tree; typical candidates: character list/grid, character detail/editor, headshot generation panel, image generation panel, video generation panel, workflow runner, upload dialogs).
  - `use-*.ts` custom hooks grouping related state + effects + handlers (e.g. one hook per generation flow). Prefer `useReducer` where 5+ useState hooks form one logical state machine.
  - Pure helpers (formatting, mapping, validation) into plain `.ts` files — these are the easiest wins, do them first.
- `characters-view.tsx` shrinks to composition/layout. Goal: no file over ~600 lines; the more important goal is that each extracted unit is genuinely self-contained (props in, callbacks out).

## Order of work
1. Baseline: run typecheck + the vitest command above; note results.
2. Extract pure helpers and types.
3. Extract leaf components (smallest JSX subtrees with least state coupling) one at a time.
4. Extract hooks for the big state clusters.
5. Final pass: typecheck, vitest, `npx eslint components/realfarm/characters components/realfarm/characters-view.tsx` — 0 errors required.

Finish with a summary: files created, line counts before/after, anything skipped.

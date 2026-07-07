# Task: Finish splitting components/realfarm/characters-view.tsx (attempt 2)

A previous attempt only extracted `components/realfarm/characters/workflow-helpers.ts` and stopped. The file is still ~4,160 lines. That is not an acceptable stopping point. This task is NOT complete until `characters-view.tsx` is under 1,000 lines; target is composition/layout only.

Refactor-only: NO behavior change, NO UI redesign, mechanical moves.

## Non-negotiable process
- Work in extraction steps. After EACH step: `npx tsc --noEmit` passes → `pnpm vitest run components lib --silent` passes → `git add -A && git commit -m "refactor(characters): <what>"`. If a step breaks tests, fix or revert that step before moving on — do not abandon the whole task.
- `components/realfarm/realfarm-source-contracts.test.ts` and `components/ui/button-style-contract.test.ts` assert against source file CONTENTS and paths. When you move code, update their references minimally, preserving intent.
- Keep the main `CharactersView` export re-exported from `components/realfarm/characters-view.tsx` so external imports don't change.
- If a specific subtree is genuinely too entangled, extract everything around it and say exactly which subtree you left and why — "risky" is not a blanket excuse.

## Plan of attack (adapt names to the actual code)
1. Read the whole file first. Map: state hooks (~70 useState), effects (9), and the major JSX sections/modals.
2. Extract in this order, one commit each:
   a. Pure helpers, constants, and types → `components/realfarm/characters/*.ts`
   b. Leaf presentational components (cards, rows, badges, empty states) → one file each
   c. Each modal/dialog → own file with explicit props
   d. Each major panel/section (character list/grid, editor, headshot generation, image generation, video generation, uploads) → own file
   e. State clusters → `use-*.ts` hooks (useReducer where 5+ useStates form one machine); wire panels to hooks via props
3. Final gate before you may finish: `wc -l components/realfarm/characters-view.tsx` < 1000, typecheck clean, full `pnpm vitest run --silent` clean, `npx eslint components/realfarm/characters components/realfarm/characters-view.tsx` 0 errors.

Finish with: file list + line counts, and anything intentionally left in place with the specific reason.

# linkedin-lab — prompt/format experiments for the LinkedIn automation

Goal: iterate `presets.mjs` (archetypes, hook styles, voices, prompt builders) until generated
posts pass the frozen quality gate. Plan + context: `docs/linkedin-automation-plan.md`.
Grounding corpus: `PLAYBOOK.md` (distilled Matt Barker templates + 50 proven hooks).

## Files

| file | role | editable by codex |
|---|---|---|
| `presets.mjs` | archetypes, hooks, voices, system/user prompt builders | ✅ the experiment surface |
| `generate.mjs` | OpenRouter call + repair loop mechanics | only for pipeline experiments (e.g. self-critique pass) — explain in report |
| `judge.mjs` | deterministic gate + LLM judge rubric | ❌ NEVER |
| `run.mjs` | fixed eval matrix + report writer | ❌ NEVER |
| `results/` | per-iteration JSON + markdown reports | generated |

## Run

```
node scripts/linkedin-lab/run.mjs --label v2-my-change [--model anthropic/claude-sonnet-5]
```

12 posts (3 niches × 4 archetypes), each judged on 7 anchored dimensions.
Gate: mean ≥ 8.0, min ≥ 6.5, 0 deterministic violations.

## Rules for codex

1. Bump `PRESET_VERSION` in presets.mjs on every change; label runs to match.
2. Keep the matrix ids present: `how_to_without`, `struggles_advice`, `harsh_truth`,
   `process_breakdown` archetypes and `without_obstacle`, `worried_problem`, `harsh_truth`,
   `steal_this` hook styles.
3. Never edit `judge.mjs` / `run.mjs`. Don't tune wording to game specific judge phrases;
   a human reviews every post and will revert judge-gaming.
4. Educator voice must not fabricate personal experience or numbers (the deterministic gate
   catches money/%/social-proof claims that aren't in the proof bank).
5. After each run, read `results/<label>.md` fully — the per-post `topFix` lines tell you what
   to attack next. Summarize what you changed, scores before/after, and what you'd try next.

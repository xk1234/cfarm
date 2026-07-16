# LumenClip docs

Start here. This folder used to be a flat pile mixing "how it works today" with "things we might build" — impossible to tell current truth from stale plans. It's now organized by **document lifecycle**, and two living docs sit at the top as the entry points.

## Read these first

| Doc | What it answers |
|---|---|
| **[STATE.md](STATE.md)** | What the app *is and does today* — views, subsystems, infra, known gaps. The current-truth reference. |
| **[ROADMAP.md](ROADMAP.md)** | What's planned/in-flight, with status — the consolidated view over all proposals. |

## The method — three kinds of doc

Every doc is exactly one of these. The folder tells you its lifecycle at a glance:

| Folder | Lifecycle | Contains | Rule |
|---|---|---|---|
| *(top level)* | **Living** | `STATE.md`, `ROADMAP.md` | Always current. Update in the same PR as the change. |
| [`reference/`](reference/) | **Evergreen** | How a shipped system works: auth, data model, scheduling/queue, test workflows | Describes current behavior; no "we will" language. Update when behavior changes. |
| [`proposals/`](proposals/) | **Active plan** | Work not yet fully shipped: cost reduction, redesigns, new features | Has a status. **When fully shipped, delete the plan doc** — fold any lasting facts into `STATE.md`/`reference/` and tick its ROADMAP row. We don't keep implemented plans around as clutter. |

Two existing evergreen sets are unchanged: [`tabs/`](tabs/) (per-view feature reference) and [`extension/`](extension/) (per-adapter capture notes). System flow diagrams live in [`../diagrams/`](../diagrams/).

### Status convention (for `proposals/`)

New proposal docs should open with a one-line banner so status is legible without reading the whole file:

```
> Status: proposed | in-progress | partial | shipped | superseded · Updated: YYYY-MM-DD
```

The authoritative status roll-up is the table in [ROADMAP.md](ROADMAP.md) — the banner is a convenience, the roadmap is the source of truth.

### Where does my new doc go?

- Documenting how something *works now* → `reference/` (or `tabs/`/`extension/` if it's a view/adapter).
- Proposing/tracking work *to be done* → `proposals/`, and add a row to `ROADMAP.md`.
- A plan you just finished shipping → **delete it**, tick its ROADMAP row, and fold any lasting facts into `STATE.md`/`reference/`.
- Changed what the app does → update `STATE.md` in the same PR.

## Full map

**Living:** [STATE.md](STATE.md) · [ROADMAP.md](ROADMAP.md)

**reference/** — [auth-and-multitenancy](reference/auth-and-multitenancy.md) · [data-objects](reference/data-objects.md) · [appwrite-scheduling](reference/appwrite-scheduling.md) · [browser-test-workflows](reference/browser-test-workflows.md)

**proposals/** — [appwrite-usage-reduction](proposals/appwrite-usage-reduction.md) 🔴 · [schedule-analytics-redesign](proposals/schedule-analytics-redesign.md) 🟡 · [linkedin-automation-plan](proposals/linkedin-automation-plan.md) 🟡 · [x-threads-drift-experiments](proposals/x-threads-drift-experiments.md) 🟡 · [reply-extension-impl](proposals/reply-extension-impl.md) ⚪ · [local-backend-migration-plan](proposals/local-backend-migration-plan.md) ⚪

**tabs/** · **extension/** — evergreen feature/adapter reference, kept current.

**Root:** [../README.md](../README.md) (setup) · [../DESIGN.md](../DESIGN.md) (design system) · [../AGENTS.md](../AGENTS.md) (Next.js notes) · [../diagrams/](../diagrams/) (flow diagrams)

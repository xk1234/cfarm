# Lumenclip Windmill workspace

Windmill owns the generation DAGs. Lumenclip retains a private,
single-stage execution boundary while provider/storage implementations are
moved out incrementally.

## Imported workflow names

| Windmill path                             | Display name                              |
| ----------------------------------------- | ----------------------------------------- |
| `f/lumenclip/slideshow_generation`        | `lumenclip - slideshow generation`        |
| `f/lumenclip/ugc_video_generation`        | `lumenclip - UGC video generation`        |
| `f/lumenclip/react_reveal_generation`     | `lumenclip - React & Reveal generation`   |
| `f/lumenclip/greenscreen_meme_generation` | `lumenclip - Greenscreen Meme generation` |
| `f/lumenclip/linkedin_generation`         | `lumenclip - LinkedIn generation`         |
| `f/lumenclip/x_threads_generation`        | `lumenclip - X and Threads generation`    |

Every Lumenclip workflow is generated from an explicit DAG definition. Input
groups are separate branch nodes, independent work runs with `branchall`, and
named artifacts join only where a downstream stage requires them. The run
forms expose product inputs only: slideshow and social flows use searchable
template pickers, LinkedIn exposes grouped content controls, UGC exposes
product/script/actor/voice/B-roll/render objects, and the two fixed video
formats expose their actual media slots. Manual runs derive their owner from
`f/lumenclip/default_owner_id` and use Windmill's root flow job ID as their
idempotency key.

API and MCP callers pass `owner_id`, `request_id`, and the same named top-level
fields shown by each flow form. Linear `start_at`/`stop_after` windows are
rejected for DAG runs; use `lumenclip_pipeline_stage_run` for isolated component
debugging.

The embedded private-boundary steps inside the six flows require these
Windmill variables:

```text
f/lumenclip/internal_base_url
f/lumenclip/shared_secret
f/lumenclip/default_owner_id
```

Mark `f/lumenclip/shared_secret` as secret. It must equal
`WINDMILL_SHARED_SECRET` on the Lumenclip web service. Do not commit either
value. `f/lumenclip/default_owner_id` is the Lumenclip account used for manual
Windmill runs and template picker results.

## Validate and import

Run from this directory after binding a Windmill workspace:

```bash
pnpm dlx windmill-cli lint .
pnpm dlx windmill-cli sync push --dry-run --skip-variables --skip-secrets
pnpm dlx windmill-cli sync push --yes --skip-variables --skip-secrets
```

`generate-flows.mts` derives six flow graphs from explicit per-workflow DAG
definitions backed by the canonical stage catalog. Re-run it whenever a stage
or graph dependency changes, then lint before importing.

## Current migration boundary

- Named MCP workflow runs are queued in Windmill; the app no longer contains
  or invokes an in-process named-workflow loop.
- Individual MCP stage runs execute directly against Lumenclip's registered
  production stage boundary; Windmill contains complete workflows only.
- Each flow embeds its private-boundary call as a `rawscript` module so every
  stage remains independently observable without creating a standalone script
  or MCP tool.
- Slideshow input hydration is parallelized across template, collections,
  variables, usage history, prior runs, and model settings. Its accepted text
  artifact and visual-selection path remain distinct until slide assembly.
- UGC input groups resolve independently. Actor/motion, voice, and B-roll run
  in parallel, then join named checkpoint artifacts for lip-sync, composition,
  and storage. Every component node waits for its own durable checkpoint.
- React & Reveal plays the complete anticipation clip before the complete
  reveal. Greenscreen Meme chroma-keys the complete meme clip over its selected
  background and adds the hook caption. Both create draft outputs only.
- The private Lumenclip stage endpoint still hosts the existing stage handlers.
  Moving those handlers into Windmill-native scripts is the next migration
  slice. Until then, some composite modules can contain nested provider calls.
- Publishing remains outside generation workflows.

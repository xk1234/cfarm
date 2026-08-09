# Lumenclip Windmill workspace

Windmill owns the ordered generation workflows. Lumenclip retains a private,
single-stage execution boundary while provider/storage implementations are
moved out incrementally.

## Imported workflow names

| Windmill path                      | Display name                           |
| ---------------------------------- | -------------------------------------- |
| `f/lumenclip/slideshow_generation` | `lumenclip - slideshow generation`     |
| `f/lumenclip/ugc_video_generation` | `lumenclip - UGC video generation`     |
| `f/lumenclip/linkedin_generation`  | `lumenclip - LinkedIn generation`      |
| `f/lumenclip/x_threads_generation` | `lumenclip - X and Threads generation` |

Every ordered Lumenclip stage is a separate Windmill module. The generated run
form exposes product inputs only: slideshow, UGC, and X/Threads flows use a
searchable template picker, while LinkedIn exposes its content fields. Manual
runs derive their owner from `f/lumenclip/default_owner_id` and use Windmill's
root flow job ID as their idempotency key.

API and MCP callers can continue to pass `owner_id`, `request_id`, `input`,
`start_at`, and `stop_after`. Those orchestration fields intentionally remain
outside the generated UI schema so they do not clutter manual runs.

The shared `f/lumenclip/run_pipeline_stage` script requires these Windmill
variables:

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

`generate-flows.mts` derives the four flow graphs from the canonical ordered
stage catalog. Re-run it whenever `lib/pipeline-stages.ts` changes, then lint
before importing.

## Current migration boundary

- Named MCP workflow runs are queued in Windmill; the app no longer contains
  or invokes an in-process named-workflow loop.
- Individual MCP stage runs execute through the Windmill stage script.
- The private Lumenclip stage endpoint still hosts the existing stage handlers.
  Moving those handlers into Windmill-native scripts is the next migration
  slice. Until then, some composite modules can contain nested provider calls.
- Publishing remains outside generation workflows.

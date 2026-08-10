# Lumenclip Windmill workspace

Windmill owns every generation DAG and executes every generation stage inside
its own workers. LumenClip is a caller and data source; it does not host a
workflow callback endpoint or a generation worker.

## Imported workflow names

| Windmill path                             | Display name                              |
| ----------------------------------------- | ----------------------------------------- |
| `f/lumenclip/slideshow_generation`        | `lumenclip - slideshow generation`        |
| `f/lumenclip/ugc_video_generation`        | `lumenclip - UGC video generation`        |
| `f/lumenclip/react_reveal_generation`     | `lumenclip - React & Reveal generation`   |
| `f/lumenclip/greenscreen_meme_generation` | `lumenclip - Greenscreen Meme generation` |
| `f/lumenclip/template_video_generation`   | `lumenclip - template video generation`   |
| `f/lumenclip/linkedin_generation`         | `lumenclip - LinkedIn generation`         |
| `f/lumenclip/x_threads_generation`        | `lumenclip - X and Threads generation`    |

Every Lumenclip workflow is generated from an explicit DAG definition. Input
groups are separate branch nodes, independent work runs with `branchall`, and
named artifacts join only where a downstream stage requires them. The run
forms expose product inputs only: slideshow and social flows use searchable
template pickers, LinkedIn exposes grouped content controls, UGC exposes
product/script/actor/voice/B-roll/render objects, and video/photo inputs use
dynamic collection dropdowns instead of raw asset URLs. The selector helper
calls the bounded `slideshow-generation.list-media-collection-options` stage;
the chosen collection is resolved to one concrete asset only inside the
generation stage. Manual runs derive their owner from
`f/lumenclip/default_owner_id` and use Windmill's root flow job ID as their
idempotency key.

API and LumenClip MCP callers pass only the named product fields shown by each
flow form. The LumenClip boundary derives `owner_id` and `request_id`
internally. For isolated component debugging, use Windmill MCP's
`runScriptByPath` with `f/lumenclip/workflow_stage_runtime`.

## Inspect generated prompts

Open a Windmill run and select any provider node. Its result includes a
top-level `providerRequests` array beside `output`. Each item contains the exact
provider, operation, model, and request body used for that attempt, including
system/user messages and structured-output schemas. Retries appear in order.
The trace stays outside `output`, so diagnostic prompts are visible in Windmill
without becoming inputs to downstream nodes. Failed private-boundary calls add
the same request list to the node error. Queued UGC components attach their
requests to the completed checkpoint and promote them into the Windmill node
result.

The native runtime requires these Windmill variables:

```text
f/lumenclip/default_owner_id
f/lumenclip/runtime_env_json
```

`f/lumenclip/runtime_env_json` is secret and contains the allowlisted provider
and persistence environment used by native stage execution. Populate it with
`pnpm tsx windmill/sync-runtime-env.mts`; never commit its value.
`f/lumenclip/default_owner_id` is the LumenClip account used by manual
Windmill runs.

## Validate and import

Run from this directory after binding a Windmill workspace:

```bash
pnpm dlx windmill-cli lint .
pnpm dlx windmill-cli sync push --dry-run --skip-variables --skip-secrets
pnpm dlx windmill-cli sync push --yes --skip-variables --skip-secrets
```

`generate-flows.mts` derives seven flow graphs from explicit per-workflow DAG
definitions backed by the canonical stage catalog. The audited reads, writes,
and producer edges are recorded in `workflow-dependencies.ts`; its tests fail
when a declared producer is missing, ordered after its consumer, or replaced
by a generic identity artifact. Re-run the generator whenever a stage or graph
dependency changes, then lint before importing.

## Runtime boundary

- UI, API, and MCP callers start Windmill flows and inspect Windmill jobs.
- Every flow node invokes `f/lumenclip/workflow_stage_runtime`, a bundled
  native Windmill script. It never calls back to a LumenClip HTTP endpoint.
- Windmill MCP can run `f/lumenclip/workflow_stage_runtime` directly for
  isolated stage tests, so no wrapper flow or duplicate LumenClip MCP stage
  tool is deployed.
- Slideshow validation loads only template, collection, and word-variable
  inputs. Text generation then runs in parallel with static image-candidate
  preparation. Generation does not read usage history or prior runs, perform
  web research or cross-output similarity repair, translate finished text, or
  produce an MP4. Those concerns are outside the slideshow-generation DAG.
- Every stage output includes typed `mediaArtifacts` when image, video, or
  audio values are present. Each artifact carries its role, MIME type, source,
  preview, download, filename, and available dimensions or duration, so
  intermediate media is not represented as an untyped URL string alone.
- UGC loads template defaults once, then real component resolvers merge and
  validate each override at its first consumer. Product analysis joins script
  configuration at script generation; actor and voice first join at lip-sync;
  performance, B-roll, and render settings first join at composition. Parallel
  component jobs use isolated checkpoint run IDs rather than racing on one
  shared checkpoint document. UGC components execute directly in the Windmill
  worker and do not enqueue Appwrite generation jobs.
- React & Reveal plays the complete anticipation clip before the complete
  reveal. Greenscreen Meme chroma-keys the complete meme clip over its selected
  background and adds the hook caption. Their media roles are genuinely
  resolved and staged in parallel; draft metadata follows an independent path
  and joins only after rendering. Both create draft outputs only.
- Stage handlers and UGC orchestration live under `windmill/runtime/` and are
  bundled into the deployed native runtime by `build-native-runtime.mts`.
- Appwrite remains the durable database and object store. Provider APIs remain
  external dependencies invoked by Windmill stages.
- Publishing remains outside generation workflows.

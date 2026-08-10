# Windmill custom frontend

This image keeps the official Windmill server and replaces only its static
frontend. It applies two narrow patches:

- `enum-image-select.patch` preserves the visual dynamic media selectors used
  by shared Windmill workflows.
- `lumenclip-input-roots.patch` lets a flow opt out of Windmill's synthetic
  `Input` graph node with the JSON Schema extension
  `x-lumenclip-hide-input-node: true`.

Hiding the graph node does not remove or alter the flow input schema, run form,
API arguments, or `flow_input` values. The first real resolver/normalizer DAG
nodes become the visible graph roots. Flows without the extension retain the
standard Windmill graph.

The frontend source is pinned with `WINDMILL_REF` so upstream changes cannot
silently invalidate either patch. Update the ref deliberately, run the patch
checks, build the image, and verify both LumenClip and other shared workflows
before deploying the shared `windmill-server` service.

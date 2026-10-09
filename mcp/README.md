# LumenClip MCP server

The MCP server exposes the render engine to agents: read the spec schema, write
or pick a template, fill its slots, render slides, and publish or schedule the
result through SocialBu. Every tool runs inside one workspace.

[tool-index.md](tool-index.md) documents each tool's description and input. It
is generated from `lib/mcp`, so run `pnpm mcp:docs` after changing a tool.

## Callable tools

<!-- BEGIN:callable-tools -->
- `lumenclip_spec_schema_get` (slideshows)
- `lumenclip_spec_validate` (slideshows)
- `lumenclip_fonts_list` (slideshows)
- `lumenclip_templates_list` (slideshows)
- `lumenclip_slideshow_render` (slideshows)
- `lumenclip_render_get` (slideshows)
- `lumenclip_collections_list` (collections)
- `lumenclip_assets_list` (collections)
- `lumenclip_collection_save` (collections)
- `lumenclip_collection_add_assets` (collections)
- `lumenclip_collection_delete` (collections)
- `lumenclip_outputs_list` (outputs)
- `lumenclip_output_get` (outputs)
- `lumenclip_output_delete` (outputs)
- `lumenclip_operations_list` (outputs)
- `lumenclip_operation_get` (outputs)
- `lumenclip_accounts_list` (publishing)
- `lumenclip_output_publish` (publishing)
- `lumenclip_output_mark_published` (publishing)
- `lumenclip_schedule_get` (scheduling)
<!-- END:callable-tools -->

## Authentication and transports

Create a workspace API key in Settings → API keys. The key selects the
workspace; there is no owner environment variable.

- Streamable HTTP: `GET|POST|DELETE /mcp` with `Authorization: Bearer lc_…`.
- Local stdio: `LUMENCLIP_API_KEY=lc_… pnpm mcp`.

Keys are rate limited (token bucket, bursts of 60 requests, refilling at one per
second per key). Settings → MCP can disable individual tools; a disabled tool
disappears from discovery for that workspace.

## Typical flow

1. `lumenclip_spec_schema_get` and `lumenclip_fonts_list` to learn the spec.
2. `lumenclip_templates_list` to pick a starter or saved template, then pass
   `templateId` to read its slots.
3. `lumenclip_collections_list` / `lumenclip_assets_list` to choose images.
   Image slots accept `{ "media": "<id>" }`, `{ "url": "https://…" }`, or
   `{ "collection": "<id or name>", "pick": "random", "seed": "…" }`.
4. `lumenclip_spec_validate` to check the spec and slot values.
5. `lumenclip_slideshow_render`. Renders with at most 10 slides finish inline;
   larger ones are queued, so poll `lumenclip_render_get`.
6. `lumenclip_accounts_list`, then `lumenclip_output_publish` after the user
   confirms the accounts, caption and time.

## Rules

- Results carry metadata and URLs, never media bytes or credentials. Slide and
  ZIP URLs point at `/api/v1/renders/{id}/…` and need the same API key.
- Publishing is always a separate, explicit tool call. Without
  `SOCIALBU_API_TOKEN` the publishing tools report "SocialBu not connected".
- Delete tools require `confirm: true`. Collections go to a 30-day trash.
- The same operations are available over HTTP at `/api/v1` (OpenAPI document
  at `/api/v1/openapi.json`).

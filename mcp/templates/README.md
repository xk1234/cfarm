# Template catalog MCP tools

> Proposed contract; not currently callable.

Templates are immutable catalog starting points used by slideshow, video, and
social automations. Agents discover a template, inspect its editable schema,
then create a user-owned automation rather than editing the catalog record.

## `lumenclip_templates_list`

Read-only and idempotent. Scope: `lumenclip:read`.

### Input

Optional `query`, `automation_kind` (`slideshow`, `video`, or `social`),
`platform`, `format`, `tags[]`, `capabilities[]`, `cursor`, and `limit`.

### Output

Paginated `items`, `next_cursor`, and `has_more`. Each item contains `id`,
`name`, `automation_kind`, `output_types`, `platforms`, `tags`, `version`,
`required_capabilities`, `resource_uri`, and `examples_resource_uri`.

## `lumenclip_template_get`

Read-only and idempotent. Scope: `lumenclip:read`.

### Input

| Field         | Type   | Required | Description                                         |
| ------------- | ------ | -------- | --------------------------------------------------- |
| `template_id` | string | yes      | Stable catalog template ID.                         |
| `version`     | string | no       | Exact version; omit only when latest is acceptable. |

### Output

Returns `template` with identity, version, normalized configuration, required
capabilities, `allowed_overrides_schema`, resource URI, and examples resource
URI. Video templates additionally expose stable `video_format`, `media_slots`,
`audio_policy`, and `duration_policy` fields.

Errors: `NOT_FOUND`, `TEMPLATE_VERSION_UNAVAILABLE`, and
`UNSUPPORTED_CAPABILITY`.

## Normal sequence

1. Search with `lumenclip_templates_list`.
2. Pin a version with `lumenclip_template_get`.
3. Validate edits with `lumenclip_automation_preview`.
4. Create a paused copy with `lumenclip_automation_create_from_template`.

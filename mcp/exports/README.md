# Export MCP tools

> Deferred beyond MCP version one; not currently callable.

Exports are separated from analytics because the app can export selected
automations, collections, outputs, or media without first creating an analytics
report.

## `lumenclip_export_create`

Scope `lumenclip:export`. Always asynchronous.

### Input

| Field             | Type                 | Required | Description                                                                    |
| ----------------- | -------------------- | -------- | ------------------------------------------------------------------------------ |
| `object_types`    | string[]             | yes      | Automations, collections, outputs, publication evidence, or analytics reports. |
| `object_ids`      | string[]             | no       | Explicit object selection.                                                     |
| `report_id`       | string               | no       | Existing analytics report selection.                                           |
| `date_range`      | object               | no       | Supported created/published filter.                                            |
| `fields`          | object               | no       | Explicit public fields by object type.                                         |
| `format`          | `json \| csv \| zip` | yes      | ZIP is required when media is included.                                        |
| `include_media`   | boolean              | no       | Default `false`; requires size estimate and approval policy.                   |
| `idempotency_key` | string               | yes      | Retry-safe export key.                                                         |

Exactly one selection strategy is allowed: object IDs, report ID, or supported
filters.

### Output

Returns an operation with `kind: "export.create"`. On success the export
resource contains ID, format, object/media counts, checksum, expiry, signed
download URL, manifest resource URI, and resource URI.

The manifest retains captions, attribution, MIME, byte size, and content hash.
Credentials, provider payloads, cookies, internal bucket IDs, and Appwrite
fields are never exportable.

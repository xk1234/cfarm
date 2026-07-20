# Workspace MCP tools

> Proposed contract; not currently callable.

Workspace discovery is the first step for any MCP workflow. It exposes the
current workspace defaults, limits, locale, and enabled product capabilities
without exposing membership records, credentials, or backend identifiers.

## `lumenclip_workspace_get`

Read-only and idempotent. Scope: `lumenclip:read`.

### Input

| Field          | Type   | Required | Description                                                       |
| -------------- | ------ | -------- | ----------------------------------------------------------------- |
| `workspace_id` | string | no       | Explicit accessible workspace. Omit to use the current workspace. |

### Output

Returns `workspace` with `id`, `name`, `timezone`, `locale`, content defaults,
generation limits, enabled capabilities, and `resource_uri`.

```json
{
  "workspace": {
    "id": "ws_123",
    "name": "Studio",
    "timezone": "Asia/Singapore",
    "locale": "en-SG",
    "defaults": { "language": "en", "aspect_ratio": "9:16" },
    "limits": { "concurrent_generations": 3 },
    "capabilities": {
      "slideshow_generation": true,
      "video_automation": true,
      "publishing": ["x", "threads", "tiktok"],
      "analytics_reports": false
    },
    "resource_uri": "lumenclip://workspace/current"
  }
}
```

Errors: `UNAUTHENTICATED`, `FORBIDDEN`, and `NOT_FOUND`. Callers should inspect
capabilities before offering generation, publishing, or analytics actions.

---
title: "MCP tools and workflows"
description: "Implemented and proposed LumenClip MCP tools for content creation, imports, schedules, automation management, and analytics."
---

> **Partially available.** Automation/collection/output/account discovery,
> image/video collection bootstrapping and HTTPS imports,
> slideshow/X/Threads manual runs, output status, confirmed publishing/manual
> linking, schedule inspection, safe automation updates, stored analytics, and
> TikTok publication reconciliation are callable. Template creation, generic
> video-automation execution, saved LinkedIn automations, exports, and MCP
> resources remain proposals; check the repository tool index before relying
> on them.

MCP capabilities are organized by the user outcome they support rather than by
internal Appwrite tables or provider-specific endpoints.

## Tool families

| Tool family                                                             | Purpose                                                                                                         | Proposed scope                                                                 |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [Creating content](/docs/workflows/mcp/creating-content)                | Discover templates, create or edit automations, generate drafts, and publish with explicit approval.            | `lumenclip:read`, `lumenclip:write`, `lumenclip:generate`, `lumenclip:publish` |
| [Importing outside content](/docs/workflows/mcp/importing-content)      | Search approved external sources, create and maintain collections, import assets, and safely merge collections. | `lumenclip:read`, `lumenclip:write`, proposed `lumenclip:import`               |
| [Analyzing and exporting data](/docs/workflows/mcp/analyzing-exporting) | Build attributed analytics reports and export workspace data or generated media.                                | `lumenclip:read`, proposed `lumenclip:export`                                  |

## Shared operating contract

Every MCP tool family must:

1. enforce workspace ownership and return stable resource URIs;
2. separate read, write, generation, import, export, and publish scopes;
3. use cursor pagination for large lists;
4. require idempotency keys for mutations;
5. use expected versions or ETags for updates;
6. return asynchronous operations for expensive work;
7. preserve per-item warnings and provider diagnostics;
8. keep generation unpublished and unscheduled by default;
9. require explicit confirmation for external publishing and destructive actions;
10. avoid exposing provider tokens, internal table IDs, or raw Appwrite records.

Task-specific agent examples remain under [Proposed MCP workflow examples](/docs/workflows/agent).
The full architecture and security model live in the [LumenClip MCP server
roadmap](/docs/roadmap/lumenclip-mcp-server).

Exact per-tool inputs and outputs are maintained separately in the
[repository MCP reference](../../../mcp/README.md), organized by the app use
case each tool operates on.

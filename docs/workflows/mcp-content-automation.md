---
title: "MCP workflow documentation moved"
description: "Implemented and proposed MCP tools organized by content creation, outside-content import, and analytics/export workflows."
---

> **Partially implemented.** Twenty-seven tools are callable through the public,
> owner-scoped Streamable HTTP route and local stdio. The tool index
> distinguishes those tools from proposed workspace, template, resource, and
> export contracts.

The canonical MCP documentation now lives in the [MCP tools and workflows
folder](/docs/workflows/mcp):

1. [Creating content tools](/docs/workflows/mcp/creating-content)
2. [Importing outside content tools](/docs/workflows/mcp/importing-content)
3. [Analyzing and exporting data tools](/docs/workflows/mcp/analyzing-exporting)

Task-specific flows and their availability remain under [MCP workflow
examples](/docs/workflows/agent).

## Target agent workflow

An authorized agent should:

1. Discover the current workspace, accounts, collections, templates, and
   automations using read-only tools.
2. Use `lumenclip_templates_list` and `lumenclip_template_get` to inspect suitable
   starting points, editable fields, requirements, and examples.
3. Clone the chosen template with
   `lumenclip_automation_create_from_template`, or use `lumenclip_automation_save` only
   when no catalog template fits.
4. Preview user-specific changes with `lumenclip_automation_preview`, show
   the resolved diff, and apply the approved patch with
   `lumenclip_automation_update`.
5. For the astrology example, select captioned celestial media and a qualified
   informational content direction.
6. Generate one unpublished, unscheduled draft.
7. Poll the returned operation until it succeeds, fails, or requires action.
8. Read the generated output and validate copy, media, title, caption, schedule,
   and destination compatibility.
9. Return the draft for approval.
10. Publish only after an explicit publish instruction and only to named
    destinations.
11. Store provider IDs and public release URLs as publication evidence.

Steps that require `lumenclip_workspace_get`, template discovery,
create-from-template/save, preview, or MCP resources remain proposed. Current
agents can start from an existing automation, inspect its linked collections,
update supported fields, generate an unpublished draft, poll the operation,
inspect outputs, read stored analytics, and publish or link an approved output.

## Required safety boundaries

- Read, generate, and publish permissions must be separate scopes.
- Manual generation must never inherit a scheduled auto-publish date.
- Publishing must be an explicit operation rather than a side effect of reading
  or generating.
- Every lookup and mutation must enforce workspace ownership.
- Expensive generation operations must return asynchronous operation records.
- Provider errors must be preserved in structured, user-readable form.
- Repeating an idempotent request must not create duplicate posts.

## Remaining gaps

The [LumenClip MCP roadmap](/docs/roadmap/lumenclip-mcp-server) tracks the
remaining production OAuth hardening, resource handlers, workspace/template
discovery, automation creation/preview, direct saved-video execution, and
exports. These gaps limit zero-to-one workflows but do not block the callable
existing-automation, collection, slideshow, publishing, scheduling, or
analytics tools.

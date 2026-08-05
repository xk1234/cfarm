---
title: Legal and internal system pages
description: Present private-beta policy summaries and gate the internal slideshow testing center.
---

Route: `/privacy`, `/terms`, and `/debug`

Owner: `app/privacy/page.tsx`, `app/terms/page.tsx`, and `app/debug/page.tsx`.

## Layout

`/privacy` uses the shared marketing header, hero, narrow reading column, and
footer. Its sections summarize Appwrite account and session data, owner-scoped
workspace records, and the private-beta status of the policy. It explicitly says
the page is not a substitute for final legal terms.

`/terms` uses the same shell and reading width. It covers beta access, the user's
responsibility for content rights, review responsibility before publishing, and
the fact that complete commercial terms have not yet been published.

`/debug` is an internal Slideshow Debug & Testing Center, not a public legal
page. It loads automation templates, image collections, and template example
runs into a model-comparison workspace with prompt editing, automation details,
model selection, generated run cards, and a Clear runs action. In production it
returns Not Found unless `ENABLE_INTERNAL_TOOLS` is exactly `true`; outside
production it is enabled by default.

## Interactions

Privacy and Terms are read-only documents whose shared header and footer link to
the marketing set, authentication, and each other. The debug center can switch
templates, inspect key information or template JSON, select one or more
OpenRouter models, add a custom model ID, edit or reset the test prompt, generate
comparative runs, move between result slides, and clear the client-side run
list.

## MCP coverage

Partial. Privacy and Terms have no matching registered operations.
`lumenclip_automation_templates_list` and `lumenclip_slideshow_generate` cover
template discovery and slideshow generation, but the debug center's temporary
multi-model comparison, prompt override, and client-side run management are not
registered.

---
title: Documentation shell
description: Serve the repository's Markdown documentation through the Fumadocs reader.
---

Route: `/docs/[[...slug]]`

Owner: `app/docs/layout.tsx` and `app/docs/[[...slug]]/page.tsx`.

## Layout

The route wraps every documentation page in Fumadocs `DocsLayout` and builds its
navigation tree from the generated `docs` collection. The shell identifies
itself as LumenClip Docs and does not expose links to the authenticated workspace
or public product application. Each resolved Markdown page supplies its title,
description, table of contents, full-width preference, and rendered body to the
Fumadocs page components.

The collection reads Markdown and MDX beneath `docs/`, so this UI field guide is
itself served through the same shell under `/docs/ui/...`. A slug that is not in
the generated source renders Not Found. Page metadata comes from the selected
document's title and description.

## Interactions

Readers can follow the generated documentation tree and use relative links
between documents. The shell does not provide navigation into the main
application and does not modify source files from the browser.

## MCP coverage

No. The registry has no tool for browsing or editing the Fumadocs source tree.
Documentation navigation is UI-only.

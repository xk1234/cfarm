---
title: Legal pages
description: Present private-beta privacy and product-use policy summaries.
---

Route: `/privacy` and `/terms`

Owner: `app/privacy/page.tsx` and `app/terms/page.tsx`.

## Layout

`/privacy` uses the shared marketing header, hero, narrow reading column, and
footer. Its sections summarize Clerk account and session data, owner-scoped
workspace records, and the private-beta status of the policy. It explicitly says
the page is not a substitute for final legal terms.

`/terms` uses the same shell and reading width. It covers beta access, the user's
responsibility for content rights, review responsibility before publishing, and
the fact that complete commercial terms have not yet been published.

## Interactions

Privacy and Terms are read-only documents whose shared header and footer link to
the marketing set, authentication, and each other.

## MCP coverage

Privacy and Terms have no matching registered operations.

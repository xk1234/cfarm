---
title: Marketing pages
description: Present LumenClip's product, audiences, beta pricing, and company information to logged-out visitors.
---

Route: `/` (with `/product`, `/solutions`, `/pricing`, and `/careers`)

Owner: `app/page.tsx`, `app/product/page.tsx`, `app/solutions/page.tsx`,
`app/pricing/page.tsx`, and `app/careers/page.tsx`.

![Desktop landing page](../assets/screenshots/desktop-landing-page.png)

![Mobile landing page](../assets/screenshots/mobile-landing-page.png)

## Layout

The marketing set shares a sticky LumenClip header and footer. Desktop shows
links for Product, Solutions, Pricing, Docs, and Careers alongside Log in and
Create account. Below `md`, those destinations and account actions move into a
full-screen menu opened from the header. The menu locks background scrolling
and supplies its own close action. The screenshots above are production
captures from July 29, 2026; current code takes precedence where the mobile
header has since changed.

`/` is a complete landing page, not a stub. Its two-column hero leads into proof
points, the problem and repeatable-workflow sequence, workspace capabilities,
audience examples, trust and privacy, beta pricing, questions, and a final call
to action. Multi-column sections stack as the viewport narrows.

`/product` is a complete product overview, not a stub. It presents reusable
inputs, visible automation inputs, creator assets, and a four-step description
of how a run moves from a saved source through review and approval.

`/solutions` is a complete use-case page, not a stub. It gives separate content
team, performance marketing, and creator-led brand scenarios, each with the
problem, intended outcome, and workflow moves.

`/pricing` is a complete private-beta pricing presentation, not a stub. It shows
a $0 private workspace during beta, a Custom team workspace, included
capabilities, and a question section. The team features and paid terms are
described as planned rather than billable.

`/careers` is a complete company page, not a stub. It presents three working
principles and plainly states that there are no open roles right now.

## Interactions

Marketing links move among the five public destinations and Docs. Create account
uses `/login?mode=register`, Log in uses `/login`, and the landing hero's product
action opens `/product`. The mobile menu closes when a destination is selected,
when its close button is used, or when Escape is pressed. These actions change
navigation only; the marketing pages do not save data.

## MCP coverage

No. The registry has no marketing-content operation. Following links and opening
or closing the mobile menu are UI navigation and are not expected to be MCP
tools.

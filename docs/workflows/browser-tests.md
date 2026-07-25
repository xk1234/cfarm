---
title: "Browser end-to-end tests"
description: "Playwright setup and guidance for rebuilding browser workflows with reliable UI assertions."
---

# Browser end-to-end tests

No Playwright spec files currently exist in `e2e/`. The former mocked specs for
the real user journeys in
[User journey test workflows](/docs/reference/browser-test-workflows) were
removed because they only asserted the hardcoded stub status codes returned by
`e2e/fixtures.ts`; their UI steps were never implemented and remained
`// TODO(selector)` comments.

`e2e/fixtures.ts` is retained as scaffolding for rebuilding the real journeys.
New specs must drive the UI through user interaction and assert the resulting
UI state, rather than asserting stub status codes.

## Why rebuilt specs should run "mocked" by default

Every content journey in LumenClip calls external providers (**KIE**, **OpenRouter**,
**Rendi**, **PostFast**, Apify) — but those calls happen **server-side** inside the
Next `/api/*` route handlers, so a browser test can't intercept them directly.

When mocked specs are rebuilt, they can stub the app's **own `/api/*` endpoints**
with Playwright route interception (`page.route`), returning the exact response
shapes the client expects (see `e2e/fixtures.ts`). That can make the UI journeys:

- deterministic and fast (no real generations, no quota/cost, no flakiness),
- runnable in CI,
- focused on the **front-end journey** (navigation, forms, list/render/persist,
  optimistic updates, error handling).

Proper UI assertions would validate the _user experience_. Mocked mode would
still **not** exercise the real server pipeline or providers — those checks need
live mode against a real environment or manual provider-integration checks
(real Rendi renders and real PostFast posting).

## Setup

```bash
npm install -D @playwright/test
npx playwright install chromium
```

The required scripts are already present in `package.json`:

```jsonc
"e2e": "playwright test",
"e2e:ui": "playwright test --ui",
"e2e:live": "E2E_MODE=live playwright test"
```

## Run

These commands become useful after specs are rebuilt:

```bash
npm run e2e          # mocked mode (default) — starts `next dev` automatically
npm run e2e:ui       # Playwright UI runner
E2E_MODE=live npm run e2e   # hit the real backend + providers (slow, costs money)
```

## Important: selectors need hardening

The app currently has only ~4 `data-testid`s. This is the first blocker to
address before rebuilding the specs. Add durable selectors to the key elements
each journey touches (composer prompt, Generate button, generation cards,
automation form fields, viewer controls, etc.), while continuing to prefer
accessible role, text, and label selectors where they are stable.

## What's NOT automated here (do manually / in live mode)

- **Any end-to-end journey currently** — no spec files exist yet.
- **Real media rendering** (Rendi MP4 encode) and **real PostFast posting**.
- **Real provider output quality** — mocks return fixed, valid-shaped responses.

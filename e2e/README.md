# E2E tests (Playwright)

End-to-end tests for the real user journeys in `docs/browser-test-workflows.md`
(journeys 1–6 are implemented here as `01-…` through `06-…`).

## Why these run "mocked" by default

Every content journey in CFarm calls external providers (**KIE**, **OpenRouter**,
**Rendi**, **PostFast**, Apify) — but those calls happen **server-side** inside the
Next `/api/*` route handlers, so a browser test can't intercept them directly.

Instead, each spec stubs the app's **own `/api/*` endpoints** with Playwright
route interception (`page.route`), returning the exact response shapes the client
expects (see `fixtures.ts`). That makes the UI journeys:

- deterministic and fast (no real generations, no quota/cost, no flakiness),
- runnable in CI,
- focused on the **front-end journey** (navigation, forms, list/render/persist,
  optimistic updates, error handling).

This validates the *user experience*. It does **not** exercise the real server
pipeline or providers — for that, run in **live mode** (below) against a real
environment, or keep the provider-integration checks manual (extension swipes,
real Rendi renders, real PostFast posting).

## Setup

```bash
npm install -D @playwright/test
npx playwright install chromium
```

Add scripts to `package.json`:

```jsonc
"e2e": "playwright test",
"e2e:ui": "playwright test --ui",
"e2e:live": "E2E_MODE=live playwright test"
```

## Run

```bash
npm run e2e          # mocked mode (default) — starts `next dev` automatically
npm run e2e:ui       # Playwright UI runner
E2E_MODE=live npm run e2e   # hit the real backend + providers (slow, costs money)
```

## Important: selectors need hardening

The app currently has ~4 `data-testid`s. These specs use role/text/aria-label
selectors grounded in the real UI (e.g. `getByRole('button', { name: 'Generate' })`,
`getByLabel('Edit AI UGC character prompt')`). Anything marked `// TODO(selector)`
is a best-effort locator that should be confirmed — the durable fix is to add
`data-testid`s to the key elements each journey touches (composer prompt, Generate
button, generation cards, automation form fields, viewer controls, etc.).

## What's NOT automated here (do manually / in live mode)

- **Browser extension** swipe capture (Journey 3 step 1) — can't be driven from
  the page context. Seed a swipe via the API stub instead, or test the extension
  separately.
- **Real media rendering** (Rendi MP4 encode) and **real PostFast posting**.
- **Real provider output quality** — mocks return fixed, valid-shaped responses.

# Task: Lint fixes + repo hygiene for cfarm

Work in the current repo. Verify with `npx tsc --noEmit` and `npx eslint .` — the 4 lint errors below must be gone with no new errors. Do NOT run vitest. Do not commit. Do NOT run git gc or touch .git.

## 1. Fix the 4 ESLint errors
- `components/realfarm/example-slideshow-modal.tsx:34` — `react-hooks/set-state-in-effect`: setState called synchronously in an effect. Restructure (derive state during render, or compute initial state) rather than suppressing.
- `components/realfarm/social-account-picker.tsx:73` — `react-hooks/immutability`: `loadIntegrations` used before declaration; reorder/useCallback as appropriate.
- `components/realfarm/social-account-picker.tsx:281` and `components/realfarm/social-account-status.tsx:86` — `react-hooks/static-components`: component created during render. Hoist to module scope (pass data via props).
Do not fix the ~124 warnings; errors only.

## 2. Lockfile cleanup
- Delete `package-lock.json`. Add `package-lock.json` to `.gitignore`. Add `"packageManager": "pnpm@10.12.1"` to package.json (check `pnpm --version` and use the installed major version if different; if pnpm is unavailable, use "pnpm@10.12.1").

## 3. pnpm-workspace.yaml placeholders
Current content has literal strings "set this to true or false" for `sharp` and `unrs-resolver` under allowBuilds. Replace with the standard `onlyBuiltDependencies: [sharp, unrs-resolver]` form (pnpm 10) so their postinstall scripts run.

## 4. Page metadata
`app/layout.tsx` exports no metadata. Add `export const metadata: Metadata = { title: "cfarm", description: "Content automation workspace" }`.

## 5. Extension permissions (light touch)
`extension/manifest.json`: remove `"<all_urls>"` from host_permissions (keep the specific hosts). In `extension/background.js`, scope the `webRequest.onCompleted` filter from `["<all_urls>"]` to `["*://*.media.tumblr.com/*"]` (that's what the JS filters for anyway). Make sure any host the background/content scripts actually fetch (localhost:3000 API) remains permitted.

## 6. Close the completed todo
`todo/hardcoded-generation-model-registry.md` is implemented (lib/realfarm-generation-model-registry.ts exists and is used). Add a short "Status: DONE — implemented in lib/realfarm-generation-model-registry.ts" note at the top of that file.

# Task: Security fixes for cfarm (Next.js 16 API routes)

Work in the current repo. After each numbered item, run `npx tsc --noEmit` to make sure the codebase still typechecks. Do NOT run vitest (native bindings broken in this VM). Do not commit; leave changes in the working tree. Update or add tests alongside code changes where test files already exist for the module (they can't be run here, but keep them consistent).

## 1. Fix auth on /api/automations/run
File: `app/api/automations/run/route.ts`
- GET currently checks `authorization: Bearer <CRON_SECRET>` but fails open when CRON_SECRET is unset. Make it fail closed: if `process.env.CRON_SECRET` is not set, return 500 (misconfigured) or 401; never run unauthenticated.
- POST currently has NO auth check at all yet accepts `force: true` and `schemaOverride`. Apply the same bearer-token check to POST.

## 2. Add proxy.ts enforcing a shared secret on all /api/* routes
- Create `proxy.ts` at repo root. For all `/api/*` paths, require header `x-api-key` to equal `process.env.APP_API_KEY` OR `authorization: Bearer <CRON_SECRET>` (so the Vercel cron keeps working).
- Behavior when APP_API_KEY is unset: allow requests only if the host is localhost/127.0.0.1 (local dev convenience); otherwise 401. Keep the logic small and readable.
- The frontend calls these APIs same-origin from the browser via `lib/client-api.ts`. To avoid breaking local dev, the localhost allowance above covers it. Add a short comment noting that for production, the key must be provisioned and the client updated to send it.

## 3. SSRF guards
- Create `lib/url-guard.ts` with an async `assertPublicHttpUrl(url: string)` that: requires http/https; resolves the hostname via `dns.promises.lookup` (all addresses); rejects private/reserved ranges (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, 0/8, ::1, fc00::/7, fe80::/10, unique-local IPv6, and IPv4-mapped IPv6 forms) and literal IP hostnames in those ranges. Export a small pure helper `isPrivateAddress(ip)` too.
- Use it in `app/api/image-proxy/route.ts` before fetching, and use `redirect: "manual"` (reject cross-origin redirects, or re-validate the redirect target and follow max 3).
- Use it in `app/api/postfast/upload/route.ts` in the `fetchSource` path. Additionally: allow relative paths beginning `/api/local-assets/` (resolve against localhost origin) since that's the main legit use; for absolute URLs, apply assertPublicHttpUrl.
- Add unit tests for `isPrivateAddress` in `lib/url-guard.test.ts` (pure function only).

## 4. Pinterest route: stop accepting client-supplied Apify key
File: `app/api/pinterest/search/route.ts`
- Remove the code path that reads an `apiKey` from the request payload (`readPayloadApiKey` or similar). Use `process.env.APIFY_KEY` only; return 500 with a clear message if unset.

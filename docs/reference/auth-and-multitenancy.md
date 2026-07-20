---
title: "Authentication and multitenancy"
---

LumenClip uses Appwrite Accounts for email/password authentication and an HTTP-only
`lumenclip-session` cookie for server-rendered sessions.

## Route boundary

- `/` and marketing pages are public.
- `/login` handles registration and login.
- `/app/**` requires an Appwrite session.
- `/api/auth/**` is public.
- `/api/search` is a public, read-only documentation index.
- Every other `/api/**` route requires an Appwrite session through `proxy.ts`.

The proxy is the first boundary. Private stores independently resolve the
current user before reading or writing, and direct-store modules verify the
owner for object reads. Route authentication must not be treated as a substitute
for object-level authorization.

## Session flow

1. Registration/login calls Appwrite and receives a session secret.
2. The server stores that secret in `lumenclip-session` with HTTP-only cookie
   options from `lib/auth.ts`.
3. `proxy.ts` resolves the session for protected pages/routes.
4. Server modules call `getCurrentUser()` when they need an owner identity.
5. Logout revokes the session best-effort and clears the cookie.

Verification confirmation and resend use Appwrite's email-verification flow.

## Ownership contract

For JSON-store-backed private records:

- Appwrite column: `owner_id`.
- Serialized domain record: normally `ownerId` after persistence.
- Physical row ID: deterministic hash of table/source category, owner ID, and
  domain record ID.

Two users may therefore use the same domain ID without a physical-row collision.
Callers do not gain access by submitting a different `ownerId`; the store derives
ownership from the session or worker context.

## Current private data

| Physical location            | Private data                                            |
| ---------------------------- | ------------------------------------------------------- |
| `automations`                | User slideshow/video automation definitions             |
| `automation_runs`            | User automation execution history                       |
| `x_automations`              | User X/Threads definitions                              |
| `outputs`                    | Results, generated videos, X runs, publication wrappers |
| `output_media`               | Media linked to private outputs                         |
| `permanent_assets`           | Image/word/product collections and uploaded assets      |
| `usage_ledger`               | User reuse history                                      |
| `postfast_metric_snapshots`  | User/account post analytics snapshots                   |
| `account_follower_snapshots` | User/account follower snapshots                         |
| `jobs`                       | User-attributed scheduled/async work                    |
| `workspace_members`          | Owner/member invitation records                         |
| `demos` table + bucket       | Owner-private settings demo videos                      |

Publication records (`PostFastPostRecord[]`) are embedded in their private
`outputs` parent. There is no active standalone `postfast_posts` store.

## Public reference categories

Public reference data shares `permanent_assets` with private categories but is
selected by its `StoreRoute`:

- `media_library_asset`
- `automation_template`
- `automation_template_example`

For these routes, `public: true` means rows are not owner-filtered. The exported
`PUBLIC_STORE_TABLES` set is empty because visibility now belongs to the logical
route/source category, not the whole physical table.

Automation templates participate as public logical routes. Never mark the
entire `permanent_assets` table public: it also contains private collections
and uploads.

## Workspace sharing

Accepted Appwrite Team memberships allow collaborators to read selected output
categories through `sharedOwnerIdsFor()`:

- slideshow/video results (`source_key=result`)
- generated videos (`source_key=generated_video`)
- X/Threads runs (`source_key=x_automation_run`)

Automations, X automation definitions, usage records, private collections, and
uploads are not shareable through this mechanism. The workspace owner remains
the writer.

`workspace_members` stores the owner ID, member user ID, email, invitation
status, Appwrite team ID, membership ID, and creation time. Membership is not
active until both Appwrite and the row say it is accepted.

## Worker ownership

Scheduled jobs carry `owner_id`. Workers enter a system-owner context before
calling domain modules, so generated runs, outputs, usage records, and
publications are written under the automation owner's identity.

Maintenance scripts without a request context may use
`LUMENCLIP_SYSTEM_OWNER_ID`. That variable is operational authority; do not set
it to an arbitrary user or expose it to the browser.

## Provisioning

The live schema is the source for `pnpm appwrite:local:setup`; completed
one-time hand-written ownership provisioners have been removed. Local reference
collection sync maps cloud and local owners by account email. Schema changes
for cloud must be applied deliberately through Appwrite and then cloned locally.

## Security invariants

- Never accept owner identity from request JSON as authorization.
- Never return Appwrite API keys, provider keys, PostFast tokens, or raw session
  secrets.
- Filter/query ownership before hydrating private records.
- Re-check ownership in destructive/direct-store operations.
- Keep auth routes public only where the session flow requires it.
- Development/debug endpoints are still session-protected but should also be
  disabled or admin-gated before a public production deployment.

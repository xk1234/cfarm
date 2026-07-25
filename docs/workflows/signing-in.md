---
title: "Signing in"
description: "Creating an account and starting a session — the routes, the cookie, why agents cannot log in, and the failures worth checking."
---

# Signing in

Getting into the workspace: what the two forms do, where the session lives, and how the
MCP surface is authenticated instead.

`Last tested: 2026-07-25, live against cfarm-eight.vercel.app`

## Workflow summary

There is no MCP tool for this. Authentication is browser-only — an agent cannot create a
user, log in, or hold a session. Read [How the agent surface is authenticated](#how-the-agent-surface-is-authenticated)
below for what agents get instead.

### 1. User asks

> "Sign me up."

### 2. The app posts to `/api/auth/register`

**In**

```json
{ "name": "Ye Xinkang", "email": "you@example.com", "password": "••••••••" }
```

Validation is `name` 2–128 chars, a valid email, and a password 8–256 chars that must match
both `/[A-Za-z]/` and `/[0-9]/`.

**Out**

```json
{ "ok": true, "verificationSent": true }
```

### 3. Intermediate steps

The Appwrite **Users** service creates the account, then an email/password session is
created with the server API key. The key is deliberate — without it the SSR cookie receives
an empty value and every protected route bounces straight back to `/login`.

The session secret is written to a cookie named `lumenclip-session`: `httpOnly`,
`sameSite: "lax"`, `path: "/"`, expiring at Appwrite's `session.expire`. `secure` is set
only when `NODE_ENV === "production"`.

### 4. Result

The browser is redirected to `/app`, or to the `?next=` path if one was carried in. A
verification email is sent, but nothing blocks an unverified user — see failure 3.

## UI workflow

| Step | Action | What happens |
| --- | --- | --- |
| 1 | Open `/login` | Heading **Welcome back**, subtitle *Log in to continue to LumenClip.* |
| 2 | Fill **Email** and **Password** | Both required |
| 3 | Press **Log in** | Button reads **Please wait** while pending |
| 4 | Or press **New to LumenClip? Create an account** | Same page switches to register mode |
| 5 | Register mode shows **Create your workspace** | Adds a **Name** field above Email |
| 6 | Press **Create account** | Lands on `/app` |

Signing out is the sidebar item **Log out**, which posts to `/api/auth/logout`.

## How the agent surface is authenticated

It is not. `/mcp` reads a single owner id from `LUMENCLIP_MCP_OWNER_ID`, falling back to
`LUMENCLIP_SYSTEM_OWNER_ID`, and returns `503` when neither is set:

> `MCP owner is not configured. Set LUMENCLIP_MCP_OWNER_ID or LUMENCLIP_SYSTEM_OWNER_ID.`

Every tool body then wraps its work in `withSystemOwner(ownerId, …)`, so all Appwrite reads
and writes are scoped to that one owner. There is no token, header, cookie, or session
check on the transport, `Access-Control-Allow-Origin` is `*`, and the middleware matcher in
`proxy.ts` does not include `/mcp`.

The consequence is worth stating plainly: **anyone who can reach `/mcp` acts as the
configured owner**, including through the destructive tools. The `lumenclip:read` /
`lumenclip:write` scopes described under `mcp/` are not implemented.

The stdio transport (`pnpm mcp`) requires `LUMENCLIP_MCP_OWNER_ID` explicitly and refuses to
fall back to the cloud system owner when the endpoint is local.

## Failures to check

1. **There is no `/signup` route.** Register is `/login?mode=register` — a client-side mode
   toggle on the same page. Linking to `/signup` 404s.
2. **Wrong credentials are deliberately vague.** Any Appwrite rejection becomes
   `Email or password is incorrect.` at `401`, so a nonexistent email and a wrong password
   are indistinguishable.
3. **Email verification is not enforced.** The middleware only checks that a session
   resolves to a user; `emailVerification` is never gated. An unverified user reaches `/app`
   normally.
4. **`requiresVerification` is dead code.** `components/auth-form.tsx` branches on it and
   would redirect to `/verify-email`, but neither auth route ever returns that field.
   Signup lands on `/app`.
5. **Registration succeeds even when the verification email fails.** The error is swallowed
   into `verificationSent: false` and the cookie is still set. The verify-email card then
   reads *Your account is ready, but the first email could not be sent.*
6. **Resend failure returns `429`, not `500`** — `We couldn't send the email. Try again in a
   moment.` Do not treat it as a server fault.
7. **The password rule is stricter than its message.** A letter *and* a digit are both
   required, but the error only says `Use a valid email and a password with 8+ characters and a number.`
8. **Middleware lives in `proxy.ts`.** There is no `middleware.ts` in this repo.

## Additional workflow notes

Only email + password is implemented. There is no OAuth provider, magic link, phone, or
anonymous session anywhere in the codebase.

Unauthenticated requests to `/api/*` return `{ "error": "Authentication required" }` at
`401`; unauthenticated page routes redirect to `/login?next=<pathname>` at `307`.

User preferences (including `postfastDisconnectedIntegrationIds`) live in Appwrite user
preferences, not in a table.

Next: [Creating a collection](/docs/workflows/create-collection)

---
title: Authentication
description: Use Clerk account flows.
---

Route: `/login` and `/sign-up`

Owner: `app/login/[[...login]]/page.tsx`,
`app/sign-up/[[...sign-up]]/page.tsx`, and `components/clerk-auth-shell.tsx`.

## Authentication

The dedicated login and sign-up routes render Clerk's `<SignIn />` and
`<SignUp />` components inside the shared LumenClip split-screen shell. Clerk
owns password recovery, email verification, MFA, session tasks, and session
revocation. The app does not expose custom credential, recovery, verification,
or logout endpoints.

Marketing navigation uses `<Show>`, `<SignInButton>`, `<SignUpButton>`, and
`<UserButton>`. A signed-in visitor who opens `/login` or `/sign-up` is sent to
`/app`. Both auth routes accept a safe same-origin `next` value and otherwise
continue to `/app`.

## Workspace

LumenClip is single-user. The workspace id is the signed-in Clerk user id, and
there are no team members or invitations.

## Identity mapping

Application records keep their existing owner IDs. The one-time
`pnpm auth:migrate:clerk -- --source-env=.env --apply` command imports Railway
users into Clerk with that ID as `externalId`, and copies application preferences
to Clerk private metadata. `lib/auth.ts` returns that stable owner ID for imported
users and the native Clerk user ID for new users. Railway stores content and
media only; it no longer stores identity preferences or creates or validates
sessions.

## MCP coverage

No. Authentication is a browser-managed Clerk flow.

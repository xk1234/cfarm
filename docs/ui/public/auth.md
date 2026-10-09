---
title: Authentication and invitations
description: Use Clerk account flows and accept workspace invitations.
---

Route: `/login`, `/sign-up`, and `/team-invite`

Owner: `app/login/[[...login]]/page.tsx`,
`app/sign-up/[[...sign-up]]/page.tsx`, `components/clerk-auth-shell.tsx`, and
`components/team-invite-card.tsx`.

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

## Team invitation

`/team-invite` reads the current Clerk-backed application identity and the
`teamId`, `membershipId`, `userId`, and `secret` query parameters. A logged-out
visitor is offered login or account creation while preserving the invitation
URL. A signed-in visitor with a complete link enters acceptance automatically.

## Identity mapping

Application records keep their existing owner IDs. The one-time
`pnpm auth:migrate:clerk -- --source-env=.env --apply` command imports Railway
users into Clerk with that ID as `externalId`, and copies application preferences
to Clerk private metadata. `lib/auth.ts` returns that stable owner ID for imported
users and the native Clerk user ID for new users. Railway stores content and
media only; it no longer stores identity preferences or creates or validates
sessions.

## MCP coverage

Partial. `lumenclip_workspace_members_list` can inspect accepted members and
pending invitations. Authentication remains a browser-managed Clerk flow.

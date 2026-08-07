---
title: Authentication and invitations
description: Handle account access and workspace invitation acceptance.
---

Authentication has no standalone page. Log in and Create account actions open
Clerk's modal over the page the visitor is already viewing. Clerk owns account
creation, email verification, recovery, sessions, and the profile menu.

When a signed-out visitor requests a protected page, `proxy.ts` redirects to the
marketing page with an `auth` intent and the original destination. The global
`ClerkAuthModalController` removes those temporary parameters, opens the modal,
and returns the visitor to the requested page after authentication.

`ClerkAuthButton` is the shared trigger for sign-in and sign-up actions. It uses
Clerk's modal-mode buttons and accepts a destination for post-auth navigation.

## Team invitation

Route: `/team-invite`

The invitation page centers a card backed by the current Clerk session and the
Railway membership record identified by the `invite` query parameter. Logged-out
visitors can open either Clerk modal without leaving the invitation. After
authentication, the card accepts the invitation when the signed-in email matches
the invited email and then links to `/app`.

## MCP coverage

Partial. `lumenclip_workspace_members_list` can inspect accepted members and
pending invitations. Interactive authentication and invitation acceptance stay
in the browser.

# Login page

Route: `/login`

![Login page on desktop](../screenshots/desktop/login-page.png)

Mobile screenshot: pending a clean unauthenticated production capture. The authenticated Chrome session was preserved rather than logging the user out solely for documentation.

## Purpose

Authenticate an existing user and provide recovery or account-creation paths.

## Desktop layout

- The left column is a brand panel with the LumenClip mark and “From source to signal.” statement.
- The right column is a compact form headed “Welcome back”.
- Email and password fields are followed by the primary Log in button, Forgot password, and account creation.

## Mobile layout

- The form becomes the primary surface and the decorative/brand column is reduced or removed.
- Authentication controls remain in one linear order suitable for keyboard progression.

## Interactions

- Log in submits email and password.
- Forgot password opens `/reset-password`.
- Create account switches to the registration flow.

## MCP support

Authentication is browser-only. The product MCP does not expose login, password recovery, verification, or account creation tools.

## Observed production state

During this audit, one fresh in-app-browser session returned “Sign-in is temporarily unavailable. This is not your password.” The same account remained usable in an existing authenticated Chrome session. The error should be treated as a service/auth availability state, not a credential validation error.

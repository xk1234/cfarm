---
title: Public pages
description: Logged-out marketing, account access, verification, recovery, and invitation routes.
---

Route: `/`

Related logged-out routes: `/product`, `/solutions`, `/pricing`, `/careers`, `/privacy`, `/terms`, `/login`, `/verify-email`, `/reset-password`, and `/team-invite`

![Desktop landing page](../assets/screenshots/desktop-landing-page.png)

![Mobile landing page](../assets/screenshots/mobile-landing-page.png)

![Desktop login page](../assets/screenshots/desktop-login-page.png)

## Layout

On desktop, the marketing routes share a sticky LumenClip header with Product, Solutions, Pricing, Docs, and Careers links plus Log in and Create account actions. The landing page begins with a two-column hero and product collage, then continues through workflow proof, the problem and process narrative, workspace capabilities, audience use cases, trust and privacy, pricing, questions, a closing call to action, and the shared footer. Product, Solutions, Pricing, and Careers reuse the same shell for their focused content; Privacy and Terms use narrower reading columns.

The desktop login route divides the viewport between a branded image panel and the account form. The right panel switches in place between Log in and Create account; registration adds a name field. Email verification, password recovery, and team invitation routes instead center a single branded card.

| Route | Visible purpose |
| --- | --- |
| `/` | Marketing overview and primary conversion actions |
| `/product` | Product workflow and capability overview |
| `/solutions` | Team and creator use cases |
| `/pricing` | Beta and team plan presentation with questions |
| `/careers` | Working principles and current role availability |
| `/privacy` | Private-beta account and workspace data summary |
| `/terms` | Private-beta product-use expectations |
| `/login` | Login and account registration modes |
| `/verify-email` | Verification progress, result, and resend action |
| `/reset-password` | Recovery request and new-password states |
| `/team-invite` | Authentication and invitation acceptance states |

On mobile, marketing content becomes a single vertical flow and multi-column cards stack. The current header keeps the brand and a menu action; opening it displays a full-screen navigation menu with the five public destinations followed by Create account and Log in. The menu locks background scrolling, closes on Escape or its close action, and closes when a destination is selected. Login hides the desktop image panel and places the brand link and form in one centered column. No mobile login screenshot exists.

## Interactions

Marketing navigation and calls to action move among public routes or enter `/login`; Create account uses `/login?mode=register`. Visiting `/login` with an existing session redirects to `/app`. Successful login honors a `next` destination when supplied. Registration may continue to email verification, where the card confirms a verification link or requests another email.

Forgot password opens the recovery route. Its request state returns the same success message regardless of whether an account exists; a valid recovery link opens the new-password form. An unauthenticated team invitation preserves its query parameters through login or registration, while an authenticated visitor with a complete invitation link enters automatic acceptance and can then open the workspace.

## MCP coverage

No. Marketing navigation and Appwrite-backed authentication, verification, recovery, and invitation acceptance are browser and session flows with no tools in `lib/mcp/`.

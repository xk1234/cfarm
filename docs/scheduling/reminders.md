---
title: "Reminders"
description: "Configure Telegram lifecycle notifications and acknowledge manually posted generations without blocking automatic publishing."
---

Reminders are configured in **App settings → Reminders**. They are off by
default. The currently supported methods are **No reminders** and **Telegram**.

## Reminder events

| Event                 | When it is sent                                                         | Action required                                                     |
| --------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Generated**         | Immediately after a slideshow or video finishes generating.             | None. This is informational.                                        |
| **Ready to post**     | At the scheduled due time for a manual or review generation.            | After posting it yourself, select **Yes, I posted it** in Telegram. |
| **Scheduled to post** | After automatic publishing has been accepted and scheduled by PostFast. | None. Automatic posting continues without confirmation.             |

Each event can be enabled independently. A reminder is enqueued only when its
event is enabled for the current user.

## Manual and review publishing

The **Ready to post** Telegram message contains **Yes, I posted it** for
slideshow and generated-video outputs. Selecting it:

1. identifies the exact reminder job and its owning user;
2. marks that generation **Published** and records `manuallyPublishedAt`;
3. removes the action button so its state is clear;
4. leaves the account, TikTok URL, provider-native ID, and provider publication
   time empty until real evidence is available.

The action is idempotent, so a repeated callback does not duplicate anything.
You can later open the generation and use **Link published post** to attach its
TikTok URL. The link workflow records the actual provider evidence and corrects
the publication timestamp if necessary. See
[Manual publication and linking](./manual-linking).

## Automatic publishing

Automatic PostFast publishing never waits for a Telegram response. Its
**Scheduled to post** reminder is notification-only, and provider state remains
the source of truth for scheduled and published timestamps. No confirmation
button is shown.

## Telegram setup

1. Create a Telegram bot and set `TELEGRAM_BOT_TOKEN` on the app and worker.
2. Set a default `TELEGRAM_CHAT_ID`, or enter a chat/channel ID in App settings.
3. Set `BASE_URL` to the public HTTPS origin of the LumenClip app.
4. Set a strong `TELEGRAM_WEBHOOK_SECRET` on the app.
5. Select **Telegram**, choose the events, save, and send a test reminder.

Saving Telegram settings registers
`<BASE_URL>/api/telegram/webhook` with Telegram when the public URL and webhook
secret are available. A localhost URL can send messages, but Telegram cannot
deliver button callbacks to it unless a public HTTPS tunnel is used.

The webhook route is public only at the session layer. Every callback must
contain Telegram's configured secret header, and the referenced job must be an
actionable **Ready to post** reminder before any generation can be changed.

## Implementation reference

- Settings UI: `components/realfarm/user-settings-modal.tsx`
- Settings and Telegram client: `lib/reminder-settings.ts`
- Reminder queueing: `lib/reminders.ts`
- Worker delivery: `appwrite/functions/job-worker/src/main.js`
- Confirmation callback: `app/api/telegram/webhook/route.ts`
- Posted-state update: `lib/reminder-actions.ts`

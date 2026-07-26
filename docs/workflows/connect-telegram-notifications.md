---
title: "Connecting Telegram notifications"
description: "Linking a Telegram bot to LumenClip so generation and publishing updates arrive in a private chat or channel."
---

# Connecting Telegram notifications

Connect a Telegram bot to receive generation-complete, ready-to-post, and
scheduled-to-post updates from LumenClip.

`Last tested: 2026-07-26, against cfarm-eight.vercel.app`

> Telegram reminders and publishing **to** Telegram are separate integrations.
> This workflow connects a notification bot. To publish posts into Telegram,
> connect a Telegram destination under **Connected accounts** through PostFast.

## Before you start

You need:

- access to Telegram and [BotFather](https://t.me/BotFather);
- permission to add a bot if the destination is a channel;
- the LumenClip workspace that should own the reminder policy.

There is no MCP tool for reminder configuration. The setup is browser-only
because it writes a private, per-user bot credential.

## Workflow

### 1. Create a notification bot

1. Open **BotFather** in Telegram.
2. Send `/newbot`.
3. Choose the display name and username.
4. Copy the bot token BotFather returns.

Treat the token like a password. Anyone holding it can operate the bot.

### 2. Prepare the destination

For a private chat:

1. Open the new bot.
2. Select **Start** or send `/start`.
3. Send it one ordinary message.

For a channel:

1. Add the bot to the channel.
2. Give it permission to post messages.
3. Use the public channel username, such as `@lumenclip_updates`, or its
   numeric chat ID.

If you need a private chat's numeric ID, before connecting the webhook open:

```text
https://api.telegram.org/bot<BOT_TOKEN>/getUpdates
```

Find `message.chat.id` in the response. Do not share or bookmark the URL with
the real token in it.

### 3. Save the connection in LumenClip

| Step | Action                                                           | Expected result                                             |
| ---- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| 1    | Open LumenClip and select your name at the bottom of the sidebar | App settings opens                                          |
| 2    | Select **Reminders**                                             | The Telegram notification settings load                     |
| 3    | Turn on **Send through Telegram**                                | Bot and destination fields appear                           |
| 4    | Paste the **Telegram bot token**                                 | The token is accepted but will not be returned after saving |
| 5    | Enter the **Telegram chat or channel ID**                        | Numeric IDs and `@channelname` destinations are supported   |
| 6    | Choose the events under **Remind me when**                       | Each event can be enabled independently                     |
| 7    | Select **Save reminders**                                        | The policy is stored for the signed-in workspace owner      |
| 8    | Select **Send test**                                             | Telegram receives “LumenClip reminder test”                 |

Saving attempts to register the production callback webhook for the bot. The
current production deployment already has the public base URL and webhook
secret required for interactive buttons. It does not provide a shared default
bot or destination, so each workspace must save its own token and chat ID.

## Choose notification events

| Event                   | Delivery time                                                          | Telegram action                                                     |
| ----------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Generation complete** | After a slideshow, video, or supported social post finishes generating | Informational                                                       |
| **Ready to post**       | At the due time for a manual or review workflow                        | Includes **Yes, I posted it** when the output supports confirmation |
| **Scheduled to post**   | After PostFast accepts an automatic scheduled post                     | Informational; automatic publishing does not wait for Telegram      |

A slideshow message can also include **Download slides + copy post**, a signed
public link scoped to that output.

### What “Yes, I posted it” does

Selecting the button:

1. verifies Telegram's webhook secret and the exact reminder job;
2. marks the slideshow or generated video as manually published;
3. records `manuallyPublishedAt`;
4. removes the button and edits the Telegram message to show confirmation.

The action is idempotent. It does not invent a platform URL or provider post
ID. Link the real published post in LumenClip later when that evidence is
available.

## What happens behind the scenes

LumenClip stores one private `reminder_settings` record per owner. The browser
can read whether a custom token exists, but the saved token itself is stripped
from responses.

When an enabled event occurs, LumenClip creates a deduplicated
`send-notification` job. The Appwrite worker reads the latest reminder policy
immediately before delivery and then calls Telegram's `sendMessage` API.
Delivery failures retry up to five times. Turning reminders off, or disabling
an individual event, also suppresses matching jobs that were queued earlier.

The webhook accepts only Telegram `callback_query` updates and only actionable
**Ready to post** jobs. It is not a conversational bot and does not process
ordinary messages or commands.

## Troubleshooting

### The test says the chat was not found

- Open the bot and select **Start** before testing a direct message.
- Check the numeric chat ID, including a leading minus sign when Telegram
  provides one.
- For a channel, add the bot and grant it permission to post.
- Use `@channelname` only for a public channel username.

### The test says Telegram rejected the request

The bot token may be invalid, revoked, or associated with a bot that was
blocked by the destination. Generate a replacement with BotFather, enter it,
save, and test again.

### Messages arrive but the posted button does not

Only manual or review **Ready to post** notifications receive the confirmation
button. Generation-complete, scheduled-to-post, and automatically published
updates are notification-only.

If the UI specifically warns that interactive callbacks are unavailable, the
deployment needs a public HTTPS `BASE_URL` and `TELEGRAM_WEBHOOK_SECRET`.
Localhost can send messages, but Telegram cannot call it without an HTTPS
tunnel.

### A notification did not arrive

Confirm that:

1. **Send through Telegram** is still on;
2. the specific event is enabled;
3. the settings were saved, not merely edited;
4. **Send test** succeeds;
5. the automation actually reached the corresponding lifecycle state.

Queued reminders are delivered by the background worker, so lifecycle
messages can arrive on the next worker tick rather than in the same browser
request.

## Related reference

- [Reminder behavior and backend contract](/docs/scheduling/reminders)
- [Scheduling posts](/docs/workflows/schedule-posts)
- [Manual publication and linking](/docs/scheduling/manual-linking)

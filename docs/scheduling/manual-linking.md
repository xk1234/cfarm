---
title: "Manual publication and linking"
description: "How manual publishing status differs from linking a real live post, including the follow-up flow for already marked outputs."
---

Generated slideshows can be published outside LumenClip. Two controls record
different levels of evidence:

| Action                  | What it records                                                                                                                                    | What it does not record                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Mark as published**   | Sets `manuallyPublishedAt` on the generation run to the current time and changes the displayed lifecycle to **Published**.                         | It does not send content, choose an account, validate a provider URL, or create provider attribution. |
| **Link published post** | Creates or updates a durable external publication record with account, provider, direct public URL, provider-native post ID, and publication time. | It does not publish anything; the post must already be live.                                          |

Use **Mark as published** as a quick lifecycle acknowledgement. Use **Link
published post** whenever the exact live post is available and should be tied to
analytics. Marking first does not prevent linking later.

## Confirm a manual post from Telegram

When Telegram reminders and **Ready to post** are enabled, a manual or review
generation receives a **Yes, I posted it** button at its due time. Tap the
button only after publishing the output yourself. LumenClip then performs the
same quick acknowledgement as **Mark as published**: it records
`manuallyPublishedAt` and changes the generation to **Published**, without
inventing an account, URL, or provider post ID.

The callback is safe to tap again; an already acknowledged generation is left
unchanged. When the TikTok URL is available, use **Link published post** to add
the real account, native post ID, URL, and publication time. That later link
replaces the acknowledgement time with the actual provider publication time.

Automatically posted outputs do not show the confirmation button. Their
provider publication state is recorded without a manual acknowledgement.

See [Reminders](./reminders) for Telegram setup and event timing.

## Link a post that was already marked published

1. Open the exact generated slideshow.
2. Select **Link published post**. This button remains available after the run
   has been manually marked published.
3. Select the one connected social account that published it.
4. Paste the direct HTTPS URL for the individual post.
5. Set the actual publication date and time.
6. Select **Link published post** to save the evidence.

After linking, the viewer exposes **Open live post**. The local run remains
published, while its `socialStatuses` now carries the account-specific evidence
used by the calendar and analytics.

## What the backend writes

The link form calls `POST /api/postfast/posts` with:

```json
{
  "type": "manual_posted",
  "sourceType": "slideshow",
  "sourceId": "<slideshow id>",
  "integrationId": "<connected account id>",
  "provider": "instagram",
  "releaseUrl": "https://www.instagram.com/p/…",
  "date": "2026-07-17T04:30:00.000Z",
  "content": "<caption and hashtags>",
  "media": []
}
```

The durable publication record stores:

- source type and slideshow ID;
- provider and integration ID;
- normalized public release URL;
- extracted provider-native post ID;
- `publishedAt`;
- `status: "published"`;
- `externallyManaged: true`.

The UI also updates the in-memory run with the publication status and uses the
linked `publishedAt` as `manuallyPublishedAt`.

## URL validation and duplicates

The endpoint requires a public HTTPS URL whose host matches the selected
provider. It rejects localhost/private addresses, tracking fragments, generic
profile pages, and URLs that do not contain an extractable post ID.

Supported link parsing includes X, Threads, Instagram, TikTok, YouTube,
LinkedIn, Facebook, Pinterest, Bluesky, and Telegram. X/Twitter aliases and
TikTok provider variants are normalized before validation.

The same provider post ID cannot be linked to a different output. Repeating the
same link for the same output and account upserts the publication record instead
of creating a duplicate.

## Calendar and analytics effects

- A manual/review scheduled run initially appears as **Needs action**.
- **Mark as published** changes the generated run's lifecycle but supplies no
  account or live URL.
- **Link published post** supplies the durable publication evidence needed to
  show the exact account and live-post action.
- Analytics can reconcile provider results with the slideshow using the native
  post ID or normalized URL rather than classifying it as unrelated external
  content.

## Success check

- The exact output is **Published**.
- **Open live post** opens the correct provider URL.
- The selected account and provider appear in the output's publication status.
- Repeating the link does not create another record.
- Analytics attributes the post to the generated slideshow after synchronization.

## Implementation reference

- Quick manual mark: `components/realfarm/automation-settings/run-publication-status-select.tsx`
- Telegram quick mark: `app/api/telegram/webhook/route.ts`
- Link form: `components/realfarm/automation-settings/slideshow-publication-actions.tsx`
- Run timestamp write: `lib/automation-runner.ts`
- Link endpoint: `app/api/postfast/posts/route.ts`
- URL parsing and validation: `lib/manual-publication.ts`
- Publication aggregation: `lib/output-publications.ts`

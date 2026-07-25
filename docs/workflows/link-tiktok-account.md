---
title: "Linking a TikTok account"
description: "Connecting a publishing destination through PostFast — why there is no OAuth callback, what the three TikTok variants differ by, what Disconnect actually does, and the failures worth checking."
---

# Linking a TikTok account

Connecting an account so automations can publish to it. LumenClip does not implement social
OAuth — it is a PostFast client.

`Last tested: 2026-07-25, live against cfarm-eight.vercel.app`

## Workflow summary

### 1. User asks

> "Connect my TikTok."

### 2. The app requests a connect link

Linking is browser-driven. There is no MCP tool that connects an account — agents can only
read the result.

**In** — `GET /api/postfast/connect-url`, optionally `?expiryDays=7`. The value is clamped to
1–30, default 7.

The route posts to PostFast `/social-media/connect-link` with `{ expiryDays, sendEmail: false }`.

**Out**

```json
{ "url": "https://app.postfa.st/connect/…" }
```

The browser opens that URL in a new tab. **There is no callback route in LumenClip** —
nothing here receives a redirect.

### 3. Intermediate steps

The user authorises TikTok inside PostFast's hosted flow. LumenClip learns about the account
only on the next read of `GET /api/postfast/integrations`, which proxies PostFast's
`/social-media/my-social-accounts`.

Connected accounts are **never stored in Appwrite**. They are read live from PostFast on every
request.

### 4. Agent reads it back with `lumenclip_accounts_list`

**In**

```json
{ "provider": "tiktok", "limit": 50 }
```

The `provider` filter is normalised, so `"tiktok"` matches all three TikTok variants and
`"twitter"` matches `x`.

**Out** — `{ items, hasMore, total }`, each item:

```json
{
  "id": "pf_account_123",
  "provider": "tiktok-seller",
  "platform": "tiktok",
  "displayName": "…",
  "profile": "…",
  "connected": true,
  "capabilities": {
    "publishSingle": true,
    "publishGallery": true,
    "publishVideo": true,
    "schedule": true,
    "replyChain": false
  }
}
```

`provider` is the raw PostFast value; `platform` is the collapsed one. Credentials are never
returned.

### 5. Result

The account appears in **Social destinations** inside any automation's Social Media Settings
and can be selected as a publish target.

## UI workflow

| Step | Action | What happens |
| --- | --- | --- |
| 1 | Press the gear in the sidebar | Opens settings |
| 2 | Choose **Connected accounts** | Tabs are **Billing & plans**, **Connected accounts**, **Reminders**, **Team members**, **Demos** |
| 3 | Read the description | *Connect social profiles once, then choose them in any automation. Disconnecting here removes an account from every LumenClip automation.* |
| 4 | Press **Add social account** | Opens the PostFast connect link in a new tab |
| 5 | Authorise in PostFast | Nothing redirects back |
| 6 | Return and reopen the panel | The row appears with **Connected** |
| 7 | Optionally press **Manage authorization in PostFast** | Opens `app.postfa.st` |

Removing shows a confirm dialog: *This removes the account from every LumenClip automation.
Its PostFast authorization is not revoked.*

## The three TikTok variants

The code distinguishes them only by publishing limits. Nothing in the repo explains what
Creative or Seller mean as products.

| `platformKey` | Name | Max text | Max media | Notes |
| --- | --- | --- | --- | --- |
| `tiktok` | TikTok | 2200 | 35 | 20 MB image cap |
| `tiktok-creative` | TikTok Creative | 2200 | 1 | no image byte cap set |
| `tiktok-seller` | TikTok Seller | 2200 | 1 | no image byte cap set |

All three collapse to `tiktok` downstream, in both the MCP normaliser and the analytics UI.

## Failures to check

1. **There is no OAuth in this app and no callback route.** Writing "you'll be redirected back
   to LumenClip" would be wrong — the account surfaces on the next integrations poll.
2. **Every platform reports `canPublish: true`.** The registry defaults the flag and no
   provider overrides it, so `getPublishableProviders()` returns all 15:
   `tiktok`, `tiktok-creative`, `tiktok-seller`, `youtube`, `instagram`, `facebook`, `x`,
   `twitter`, `linkedin`, `threads`, `pinterest`, `bluesky`, `telegram`, `google`,
   `google-business-profile`. Do not describe any as read-only.
3. **Disconnect does not revoke anything.** It writes the integration id into Appwrite user
   preferences under `postfastDisconnectedIntegrationIds` and prunes the id from automations.
   The PostFast authorisation survives — which the dialog says outright.
4. **`lumenclip_accounts_list` does not mirror the Settings list.** It reads PostFast directly,
   pre-filters disabled accounts, and **ignores** the disconnected-ids preference. Accounts you
   "disconnected" in Settings still appear to an agent, and `connected` is effectively always
   `true`.
5. **A missing key is a `503`, not a `500`**: `POSTFAST_API_KEY is not configured`, with
   `code: "missing_api_key"` and `configured: false`.
6. **A failed link mint is a `502`**: `PostFast did not return a connect URL`. The client
   falls back to `Could not create a connection link.`
7. **PostFast errors are mapped by status** to `unauthorized`, `forbidden`,
   `payload_too_large`, `rate_limited`, `postfast_unavailable`, else `postfast_error`. Only
   `429` and `5xx` are retried, 3 attempts, 30-second timeout.
8. **The account-selection grid cannot link.** `SocialAccountSelectionGrid` shows
   *No connected social accounts found.* but has no connect affordance — linking only happens
   in Settings.

## Additional workflow notes

The empty state reads **No social accounts yet** / *Connect Instagram, TikTok, YouTube, and
other publishing destinations.*

Previously disconnected accounts appear under **Disconnected from LumenClip** — *These accounts
remain authorized in PostFast until you revoke them there* — each with **Restore**.

Publishing to a connected account is `lumenclip_output_publish`, which requires
`confirmPublish` and is the only tool in the surface that sends anything externally.

Previous: [Scheduling posts](/docs/workflows/schedule-posts) ·
Next: [Importing TikTok Studio data](/docs/workflows/import-tiktok-studio-data)

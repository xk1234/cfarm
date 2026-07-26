---
title: "Answering TikTok comments"
description: "Proposed: the Chrome companion reads top-level comments off a TikTok post, drafts replies, and waits for a human to approve them — verified live against a real post in a logged-in browser."
---

# Answering TikTok comments

Open one of your posts, let the companion collect its top-level comments, review the drafted
replies in LumenClip, and approve them in one pass.

`Last tested: 2026-07-26 — DOM contract measured live; MCP surface exercised; no reply has been sent`

## What shipped

| Piece | Name |
| --- | --- |
| Stores | `lib/tiktok-comments.ts` — collections, comments, drafts, approvals, sends (separate keys) |
| Drafting | `lib/tiktok-comment-replies.ts`, model use case `tiktokCommentReply` |
| MCP | `..._comments_collect_start`, `..._comments_list`, `..._comment_replies_draft`, `..._comment_replies_approve`, `..._comment_replies_send` |
| Extension | `browser-extension/` — the single companion, shared with Studio analytics |
| Queue | `/app/tiktok-comments?collectionId=…` |

The extension is deliberately **separate** from the Studio companion: this one needs write
permissions, and isolating them keeps the read-only analytics capture on its own release lifecycle.
It paces sends 20–45 seconds apart, and treats a login wall or CAPTCHA as a hard stop.

**The send gate, verified over MCP.** Drafts, approvals, and sends live in separate stores.
`queueApprovedTikTokReplies` requires literal `confirmSend: true`, resolves every requested draft id
to its own approval record, and rejects the **entire** batch if any is missing — then sends the
approval's reviewed text, not the draft's. Called over the real MCP server with an unapproved id, it
returns an error:

```
Explicit approval record required for draft ids: fake-draft
```

**Approve all means all.** Flagged (`careful`) rows are included, not withheld — withholding them
would quietly leave comments unanswered, which is the opposite of the requirement. When flagged rows
are present the button reads *"Approve N, including M flagged?"* and needs a second press.

## What the live check found

`https://www.tiktok.com/@horoiq/photo/7662360324313517330`, opened in the user's logged-in Chrome
on 2026-07-26.

**The post.** The `/video/` URL redirects to `/photo/` — it is a five-slide photo slideshow, the
format LumenClip generates. Author `horoiq`, dated 7-14, caption plus five hashtags. Counters:
1,210 likes, **17 comments**, 440 saves, 82 shares.

**Detection works.** Comments are not in the DOM on load; the list mounts only after the comment
panel is opened, at which point a `comment-sidebar` chunk loads and the nodes appear. After
clicking `[data-e2e="comment-icon"]` and waiting, **12 top-level comments** were extracted with
full structure. No CAPTCHA, no rate limiting, no interstitial.

**The extraction contract.** Each comment is one `div[class*="DivCommentObjectWrapper"]`, holding:

| Field | Source |
| --- | --- |
| Display name | `[data-e2e="comment-username-1"]` |
| Handle | the wrapper's `a[href^="/@"]` |
| Comment text | `[data-e2e="comment-level-1"]` |
| Like count | the like button's `aria-label`, e.g. `"Like video\n2 likes"` |
| Date | a `span` matching `M-D` |
| Reply count | the wrapper's `View N replies` affordance |
| Reply action | `aria-label="Reply"` |

Two of those are traps. The like button is labelled **`Like video`** even on a comment — TikTok's
own mislabelling, so an implementation matching on `aria-label === "Like comment"` finds nothing.
And the reply-count affordance is text, not an attribute.

The `data-e2e` hooks that only exist once logged in and once the panel is open:
`comment-username-1`, `comment-level-1`, `comment-reply-1`, `comment-text`, `comment-input`,
`comment-post`, `comment-at-icon`, `comment-emoji-icon`. Logged out, only `comment-icon` and
`comment-count` exist.

**The header count is not the top-level count.** The header says **17**. Twelve top-level comments
rendered, carrying `View N replies` affordances summing to 6 — so 12 + 6 = 18, against a header of
17. The three numbers do not reconcile, and they will not: deleted, filtered, and author-hidden
comments are counted differently from how they are rendered. **Never treat the header count as a
completion target for a capture job.**

**`/api/comment/list/` was not observed.** The resource timeline showed
`/api/item/detail/`, `/api/user/list/`, `/api/inbox/*` and others — but no comment-list endpoint,
despite the comments having loaded. So the fetch/XHR interception the Studio companion uses cannot
be assumed to work here. **DOM reading is the verified path**; API interception is unproven and
should not be designed around without its own check.

## What the comments actually look like

This matters because it sets the range the drafter has to cover — **every one of these gets a
reply**, including the emoji-only ones:

| # | Commenter | Comment |
| --- | --- | --- |
| 1 | Phirum Amante | *Being Cancer must stop commit these 3 things; no one see Cancer's intentions.* |
| 2 | 🌛moon priestess🌛🇦🇺 | a long first-person story about the last slide |
| 3 | 📍 | *well anybody else feel called out bigger than hell here* |
| 4 | poshy❤️ | *We never forget* |
| 5 | user19778026790 | *it's hard being a cancer and somehow people see us sensitive and crying baby.* |
| 6 | Dr Ebi | *[Sticker] Too real 😩cancer ♋️* |
| 7 | snowywillow0 | *just described me to a tee 🥰🥰* |
| 8 | Nick | *all I see is her struggling smh* |
| 9–12 | kryptoDave, eviemanuel8, 💛💛LJ💕💕 ×2 | `💯💯💯` · `😁😁😁` · `❤️❤️❤️` · `🥰🥰🥰` |

Four of twelve are emoji-only. One is a sticker. One (#8) is off-topic and mildly hostile. One
commenter appears twice. Every one of them is answered — the classifier picks a **reply style**,
it never withholds a reply:

| Style | Applies to | What the draft looks like |
| --- | --- | --- |
| `substantive` | #1, #2, #3, #5 | A real sentence engaging the claim, the question, or the story |
| `affirming` | #4, #6, #7 | One short line that agrees and adds a beat |
| `emoji` | #9–12, and any sticker or emoji-only comment | Emoji, drawn at random from a per-automation set, optionally with 1–3 words |
| `careful` | #8 | Still drafted, but flagged in the queue as hostile or off-topic so the person reads it before approving |

`careful` is a flag, not a skip. Nothing is dropped from the queue.

The `emoji` style is the one with a trap in it. A reply of `🥰🥰🥰` to a comment of `🥰🥰🥰`,
repeated across four commenters in one session, is the single most spam-shaped thing this feature
can emit. So the emoji set is **drawn at random per reply and de-duplicated within a run** — no two
replies in one batch use the same emoji sequence, and no reply mirrors the comment it answers.
Randomness here is a variety requirement, not decoration.

Drafted replies were **not** written out in this document. Putting generated replies to
identifiable people into a doc is a step toward sending them; the drafting prompt gets validated in
the approval queue, where a human sees every draft before it can go anywhere.

## Why the workflow does not work today

| Piece | Status |
| --- | --- |
| Read comment text | Nothing. `comments` exists only as a `CanonicalMetric` — a count. |
| Post a reply | Nothing. `lib/postfast-client.ts` has no comment endpoint of any kind. |
| Like ("heart") a comment | Nothing. |
| Approval queue | Nothing. |
| Read TikTok in the user's session | **Exists** — the Chrome companion. |

The companion is one MV3 extension, version 2.0.0, shared with Studio analytics. Permissions `storage`,
`tabs`, `alarms`, host access to `www.tiktok.com`, the deployed origin, and `localhost`. It already
drives TikTok tabs on its own and posts findings back with an HMAC bearer token. A one-minute alarm
polls for pending work; each step has a 30-second timeout and one retry. See
[Importing TikTok Studio data](/docs/workflows/import-tiktok-studio-data) for the handshake.

## Proposed workflow summary

### 1. User asks

> "Read the comments on my last three posts and draft replies for me to approve."

### 2. Agent calls `lumenclip_tiktok_comments_collect_start` *(proposed)*

**In**

```json
{ "postIds": ["…"], "scope": "topLevel", "maxComments": 100 }
```

`postIds` are local LumenClip publication ids, matching every other TikTok tool in the surface.

**Out**

```json
{
  "collectionId": "…",
  "status": "pending",
  "postCount": 3,
  "expiresAt": "…",
  "companion": { "version": 3, "endpoint": "…", "token": "…", "expiresAt": "…" }
}
```

### 3. Intermediate steps

The companion opens each post, clicks the comment icon, waits for the sidebar chunk, scrolls the
list to exhaustion, and reads each `DivCommentObjectWrapper` per the contract above. Top-level
only — `View N replies` threads are recorded as a count, not expanded.

Completion is decided by **scroll exhaustion**, not by reaching the header count. The job reports
`{ topLevelCaptured, nestedReplyCount, headerCount }` and lets them disagree.

### 4. Agent calls `lumenclip_tiktok_comment_replies_draft` *(proposed)*

Drafting takes the collected comments plus the post's own slide text, which LumenClip already has
for anything it generated — the reply should sound like the post it is answering. **Every comment
gets a draft.** The classifier picks the reply style from the table above; it never decides whether
to reply. The existing `llmSlopPromptLine` guardrail applies as it does to every other generated
string.

Emoji replies are assembled in code, not by the model: the drafter picks from a per-automation
emoji set, excludes sequences already used in the run, and excludes the emoji present in the
comment being answered. That keeps `emoji` replies varied without spending a model call on them.

### 5. Human approves

Nothing sends before this step. The queue shows each comment, its reply style, its drafted reply, and a
heart toggle, with **Approve all** as one action and per-row approve, edit, and skip as the others.
`careful` rows are visibly marked so **Approve all** does not wave one through unread.

### 6. Result

Approved replies post, hearts apply, and each reply is recorded against the publication so the same
comment is never answered twice.

## The approval gate is the design, not a safety label

Two properties should hold in code, not copy:

1. **A draft has no send path.** Drafting and sending are separate tools with separate storage, and
   the send tool accepts only ids carrying an explicit approval record — a separate record, not a
   flag on the draft, so a bug in the drafting path cannot produce a sendable object.
2. **Approve-all is scoped to what is on screen**, with its count in the button, not every pending
   draft in the workspace.

This matches how publishing already behaves: `lumenclip_output_publish` is one of only two tools
that reach outside LumenClip, and it requires explicit confirmation.

## Failures to check

1. **Logged-out reads are CAPTCHA-gated.** The same post, checked logged out, served a slider
   puzzle — *"Drag the slider to fit the puzzle"* — and **Log in to comment**, with zero comment
   nodes in the DOM. The companion must run in the user's authenticated session, and must treat a
   CAPTCHA as a hard stop that surfaces to the person rather than something to solve or retry
   around.
2. **The comment list is lazily mounted.** Nothing exists before the panel is opened. A capture
   that reads on page load finds an empty section and reports zero.
3. **The header count is not a target.** Verified above: 17 vs 12 top-level vs 6 nested. A job that
   retries until it matches the header will never finish.
4. **`data-e2e` selectors are unversioned** — they are TikTok's internal test hooks. A capture built
   on them needs a loud "captured 0 comments from a post reporting N" alarm, because silent zero is
   the failure mode.
5. **`aria-label="Like video"` is the comment like button.** Matching on "comment" in that label
   finds nothing.
6. **Replying to everything is the requirement, so variety carries the whole load.** Four of twelve
   comments were emoji-only and two came from the same commenter. Twelve replies that rhyme with
   each other read as a bot even when every one was approved. Enforce it mechanically: no repeated
   emoji sequence within a run, no reply that mirrors the comment it answers, and no two
   `affirming` replies sharing an opening.
7. **Hostile comments will appear** and still get a draft. #8 — *"all I see is her struggling
   smh"* — is exactly the row that must be visually flagged, because the failure mode is a person
   pressing **Approve all** and shipping a chirpy reply to an insult.
8. **The same comment can arrive twice.** Re-running a collection must upsert on the TikTok comment
   id, the way Studio snapshots upsert on `postId` + `capturedAt`.
9. **A post with no platform id cannot be reached** —
   `This TikTok publication has no platform post ID. Link its public TikTok URL first.` See
   [Reviewing unlinked TikToks](/docs/workflows/review-unlinked-tiktoks).
10. **Automated replying is rate-sensitive on the account's side.** Pacing replies is about not
    getting the user's own account actioned for spam, and it is not a substitute for the approval
    gate. State the pacing in the UI — "posting 8 replies over ~6 minutes" — so a running job does
    not read as a stuck one. Bulk automated replying carries real account risk under TikTok's
    automation policy regardless of approval, and that belongs where the person turns it on.
11. **Comment text is untrusted input.** It is written by strangers and fed to a model that drafts
    in the user's voice. A comment containing instruction-shaped text must never steer the draft.

## If this is built

Build the read half first and stop there. A tool that collects top-level comments and shows them in
LumenClip — no drafting, no sending — is independently useful, is where all the fragile work lives,
and is now known to be achievable: the contract above was measured against a live post, and the
only unknown left is how it degrades when TikTok renames a selector.

Then add drafting for all four styles at once. Shipping `substantive` alone would look fine on the
four comments that deserve prose and leave the other eight — the majority — unanswered, which is
the opposite of what this workflow is for.

Previous: [Reviewing unlinked TikToks](/docs/workflows/review-unlinked-tiktoks) ·
Next: [Reading analytics](/docs/workflows/analytics-report)

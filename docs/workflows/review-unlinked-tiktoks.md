---
title: "Reviewing unlinked TikToks"
description: "One persisted link state per publication instead of four fields joined by hand — how the states are defined, how existing records migrate, and the failures worth checking."
---

# Reviewing unlinked TikToks

For each TikTok: did we publish and link it automatically, did someone publish and link it by hand,
or is it sitting there unattributed? And separately — does it carry stats imported from TikTok
Studio?

`Last tested: 2026-07-26, unit-tested — the migration has not been run against real data`

> **The migration has not been applied.** The code is in place and the script is written, but
> nothing has been migrated locally or in the cloud. Run the dry run first; see below.

## Why the old model was hard to read

Answering "what is the state of this post?" used to require joining four things and inferring
intent from a combination no single function owned:

| Field | Where | Problem |
| --- | --- | --- |
| `status` | `PostFastPostRecord` | `"published"` is true of every state below |
| `postfastPostId` | `PostFastPostRecord` | Present only when PostFast published it — an implicit signal |
| `externallyManaged` | `PostFastPostRecord` | Written in exactly two places and **read nowhere**. It encoded real intent and then dropped it. |
| `source` | `PostFastMetricSnapshot` | `"postfast" \| "tiktok_studio"`, in a *different store*, needing a group-by before it means anything |

So "manually linked" was `externallyManaged === true`, "we published this" was
`postfastPostId != null && status === "published"`, and "has Studio stats" required loading every
snapshot and grouping by post id and source. Three different shapes of inference, none named, none
shared, recomputed slightly differently at each call site.

## The four states

Two independent axes. The first is exclusive and persisted:

| `linkState` | Meaning | Set by |
| --- | --- | --- |
| `postfast_published` | LumenClip published it through PostFast; attribution is automatic. | The publish path |
| `manually_linked` | Published elsewhere, linked by hand to a local output. | `linkPublishedOutput` and the manual-link route |
| `unlinked` | The post is known, nothing else is. Status unknown. | Default |

The second is orthogonal and denormalized onto the same record:

```ts
statsSources: Array<"postfast" | "tiktok_studio">
```

`"tiktok_studio"` is the one the workflow asks about: it means Studio metrics were captured through
the Chrome companion and merged onto this post. It is independent of `linkState` in principle —
though in practice Studio capture only reaches linked posts, which is why the states are ordered in
the UI.

Everything reads through one function:

```ts
publicationLinkState(record) → {
  state, hasApiStats, hasStudioStats, label, description
}
```

That is the entire public surface. No caller recomputes it, and no caller touches
`externallyManaged`.

## Why `statsSources` is denormalized

The analytics list is built from **snapshots**, not publications — `LatestPost` is
`PostFastMetricSnapshot & { previous? }`. That has two consequences, and denormalizing fixes both:

1. A post with no snapshot from either source **had no row to render at all**, so the posts most in
   need of review were invisible rather than badly styled.
2. Showing link state meant loading publications *and* snapshots *and* joining them per card, in a
   component that had loaded neither.

Carrying `statsSources` on the publication record means the card needs one store, not two, and the
list can be driven by publications with snapshots joined in — rather than the reverse.

## Migration

`scripts/migrate-publication-link-state.ts`, following the same pattern as
`scripts/migrate-automation-variable-bindings.ts`: it loads `--env-file` (default `.env.local`),
requires `LUMENCLIP_SYSTEM_OWNER_ID` or `LUMENCLIP_MCP_OWNER_ID`, and wraps its work in
`withSystemOwner`.

**It is a dry run by default.** Nothing is written without `--apply`. It prints a per-state count
before and after, writes a timestamped backup under `data/backups/` before applying, and running it
twice changes nothing the second time.

```bash
pnpm migrate:publication-link-state
```

```bash
pnpm migrate:publication-link-state -- --apply
```

Backfill rules, in order:

| Existing record | Becomes |
| --- | --- |
| `externallyManaged === true` | `manually_linked` |
| `postfastPostId` present and `status === "published"` | `postfast_published` |
| anything else | `unlinked` |

`statsSources` is rebuilt from the snapshot store, grouped by post id **and** source.

One thing to know before running it: publication records are not their own table. They are a JSON
string in the `publications` column of `outputs` rows. The migration rewrites that column, so back
up before `--apply`.

## UI

Each post card carries its state as a border treatment **plus** an icon and short label — colour
alone is not a signal, because it fails for anyone who cannot distinguish the hues and it fails in
a screenshot. The tooltip names the state in full.

| State | Card treatment | Label |
| --- | --- | --- |
| `postfast_published` | Standard border, link icon | **PostFast linked** |
| `manually_linked` | Restrained warning-token border, person-check icon | **Manually linked** |
| `unlinked` | 2px dashed danger-token border, link-off icon | **Unlinked** |
| `tiktok_studio` in `statsSources` | Neutral badge, no warning treatment | **Studio stats** |

The strongest treatment is reserved for `unlinked`. **Missing Studio stats is the normal state** —
capture is manual and browser-driven, so styling it as an error paints nearly every card red on
first use.

## Failures to check

1. **The states are ordered, not independent.** Studio sync only reaches linked posts:
   `lumenclip_tiktok_studio_analytics_batch_start` operates on linked publications, and a post
   without a platform id fails with
   `This TikTok publication has no platform post ID. Link its public TikTok URL first.` So
   `unlinked` must be resolved before "no Studio stats" means anything.
2. **`mode: "new"` finding nothing is success**, not a gap:
   `Every linked TikTok post in this scope already has Studio analytics`.
3. **Linking can conflict.** `ManualPublicationConflictError` is a 409 with
   `That published post is already linked to another output`. A bulk link built on this view must
   surface per-row conflicts rather than aborting the batch.
4. **`manually_linked` is fully linked.** It is not a degraded `postfast_published`; it only means
   LumenClip did not do the posting. Collapsing the two loses the distinction that makes
   attribution trustworthy.
5. **There is still no way to enumerate account posts.** `postfastRequest` reaches
   `/social-media/my-social-accounts` and `/social-posts/analytics`; neither returns "every post on
   this TikTok account". So `unlinked` means "a publication record we hold with no output
   attribution" — **not** "a TikTok on your account that LumenClip has never seen". That larger set
   remains unreachable, and the UI should not imply otherwise.
6. **`statsSources` is denormalized, so it can drift.** Every snapshot writer must maintain it —
   including the Studio capture path. A snapshot written without updating the publication makes the
   card lie. Prefer a single write helper over remembering at each call site.
7. **Only some providers have post analytics at all.** `providerSupportsPostAnalytics` allows
   `tiktok`, `instagram`, `facebook`, `youtube`, `linkedin`, `pinterest`. A generalised version of
   this view must not paint "missing stats" on a platform that never had them.
8. **Coverage is not correctness.** The Studio report returns a `mapping` block reporting
   slide-count alignment between the analytics and the stored slideshow. A post can be linked to
   the *wrong* output and still show as fully covered here.

Previous: [Importing TikTok Studio data](/docs/workflows/import-tiktok-studio-data) ·
Next: [Answering TikTok comments](/docs/workflows/answer-tiktok-comments)

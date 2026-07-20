---
title: "How collections are used"
description: "How automations, workers, selectors, and runtime expansion consume each collection type."
---

Collections become useful when an automation stores a logical reference and a
manual or scheduled run resolves it inside the authenticated owner's workspace.

## Image selection in slideshow automations

An automation's `image_collection_ids` config has separate collection roles:

| Role             | Stored field                  | Behavior                                                                                        |
| ---------------- | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| Hook/first slide | `first_slide.collection`      | Supplies the opening image when first-slide mode is `collection`.                               |
| Body/all slides  | `all_slides`                  | Supplies ordinary content-slide images.                                                         |
| CTA              | `cta_slide.cta_collection_id` | Supplies CTA imagery when CTA collection mode is enabled; otherwise falls back to `all_slides`. |
| Demo video       | `video_demo_asset_id`         | Selects a reusable demo asset for compatible video formats; it is not an image collection ID.   |

Formatting sections may also specify per-slide `imageOverrides` and an overlay
collection. The selector normally filters out video collections for slideshow
image fields.

At run time the worker:

1. Loads owner-scoped `image_collection` records and usage-ledger entries.
2. Resolves the automation's logical IDs against each collection's aliases.
3. Fails if none of the requested logical IDs resolves to an owner collection.
4. Selects enough images for the slide plan while applying reuse policy and
   caption-aware selection where configured; insufficient eligible images fail
   the plan explicitly.
5. Records chosen collection IDs, image keys, captions, and substitutions in
   the run plan; later usage-ledger reads expose `last_used_at` metadata.

The stored reference can be a UI ID, collection name, or supported legacy
alias. Storage file IDs are never valid collection references.

## Video collection use

Video-format template fields accept video collections. The two virtual
collections have stable IDs:

| Collection           | ID                             | Typical use                                             |
| -------------------- | ------------------------------ | ------------------------------------------------------- |
| AI UGC Avatar Videos | `collection-ugc-avatar-videos` | Avatar/reaction clips in UGC formats                    |
| Greenscreen Memes    | `collection-greenscreen-memes` | Foreground reaction/meme clips for chroma-key templates |

For example, the Greenscreen Meme preset uses the virtual greenscreen
collection for its reaction clip and a separate image collection for the
background. Virtual video collections are selectable even though they cannot
be mutated from the collection library.

## Variable expansion

Variable collections are referenced in hook text using `[[tag]]` or `{tag}`.
An optional hook-slot map can point a readable slot to a different collection
ID. At generation time:

- a repeated token normally reuses the same substitution in one hook;
- with no-duplicate expansion enabled, later occurrences become synthetic slots
  such as `zodiac_2` and draw a distinct value from the same collection;
- values are selected from owner-scoped word-collection records;
- missing or empty collections raise an explicit generation error;
- substitutions are captured in the run plan for auditability.

Date/time runtime variables such as `[[current_year]]`,
`[[current_month]]`, `[[current_date]]`, and `[[current_time]]` are calculated
from the scheduled run time and timezone. They are not variable collections.
Legacy `[[year]]` is migrated to `[[current_year]]`; a user collection with ID
`year` is rejected.

## Product collection use

Product collections currently power only the **Products** catalog view. Users
can inspect generated lifestyle visuals, price and commission estimates, use
cases, and marketplace links. Product collection IDs are not currently part of
the automation schema, scheduler, worker generation context, or publishing
payload.

The example variable token `[[product]]` refers to a variable collection named
`product`; it does not automatically select an item from Product Collections.

## Dependency behavior

Media deletion preview detects direct references from current automations and
automation templates using the same alias resolver as selection. Variable and
product collections do not have an equivalent dependency index. Before editing
IDs or deleting variables, search live automation/template payloads and run a
preview generation.

## Ownership and local development

Resolution is always owner-scoped. The shared local Appwrite project does not
make another local user's private collections visible. To copy cloud reference
image collections into a matching local owner without removing cloud data, run:

```bash
pnpm appwrite:local:sync-reference
```

This command maps the cloud owner to the local user with the same email, writes
consolidated local `image_collection` rows, and copies referenced Storage files.

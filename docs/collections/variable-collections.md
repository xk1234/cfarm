---
title: "Variable collections"
description: "Reusable text-value collections, tag syntax, expansion rules, CRUD API, runtime variables, and deletion risks."
---

Variable collections—called word collections in code—store reusable text values
for dynamic hook slots such as `[[zodiac]]`, `[[city]]`, or `[[product]]`.

![Variables collection tab showing reusable tags, value counts, previews, and edit/delete actions](/docs/collections/variable-collections.png)

Each card shows the exact token, value count, description, a value preview, and
edit/delete actions. Search matches the tag, ID, name, and description; **Add
variable** opens the create dialog.

## Record shape

```ts
type WordCollectionRecord = {
  id: string
  name: string
  description?: string
  words: string[]
  source: "manual" | "ai"
  created_at: string
  updated_at: string
}
```

Records are owner-scoped `permanent_assets` rows with
`source_key=word_collection`. There are no binary files.

The MCP contract returns both `id` and `variableName`. They are authoritative
for different purposes:

- `id` is the persistent entity identity used by CRUD, foreign keys, and
  explicit overrides. It must not change when a display name changes.
- `variableName` is the canonical hook-binding identity rendered as
  `[[VARIABLE_NAME]]`.
- `name` is a display label only.

They differ on migrated UUID-era records, so integrations must never render a
storage ID or display name as a token. Legacy aliases remain readable for
compatibility, but new writes return and store the canonical `id`.

## Create

Choose **Add variable** in the Variables tab. Enter:

- a tag name;
- an optional description;
- values separated by commas or new lines.

The UI normalizes the tag to lowercase letters, numbers, hyphens, and
underscores. The server derives an ID when absent, removes blank values, and
deduplicates values case-insensitively while preserving the first occurrence's
spelling. New UI records use `source: "manual"`; `"ai"` remains supported in
the record contract.

## Read

`GET /api/word-collections` returns current owner-scoped records. The Variables
tab searches tag, ID, name, and description and displays each collection's
value count and preview.

## Update

`POST /api/word-collections` is both create and update. Supplying an existing
`id` replaces the record's name, description, words, source, and `updated_at`
while preserving `created_at`.

The current edit dialog fixes the tag/ID and allows only description/value
changes. This protects automation references from accidental renames. A tag
rename requires a deliberate new collection plus migration of every hook token
and hook-slot mapping.

## Delete

`DELETE /api/word-collections/[id]` immediately and permanently removes the
record. There is no trash, recovery period, dependency preview, or automatic
automation repair.

Before deletion:

1. search automation and template hook text for `[[tag]]` and `{tag}`;
2. inspect hook-slot maps whose value equals the collection ID;
3. replace or remove those references;
4. run a preview generation.

Missing or empty collections produce an explicit expansion error during a run.

## Token resolution

Both token styles are supported:

```text
The [[zodiac]] sign most likely to move to {city}
```

By default, repeated occurrences of the same token in one hook share one
substitution. When no-duplicate expansion is enabled, later occurrences become
synthetic names such as `zodiac_2` and draw distinct values from the same
collection. The resolved substitutions are stored in the automation run plan.

For every enabled hook, the automation derives its variable set directly from
the `[[TOKEN]]` and `{token}` references in the hook text. Each token resolves
against a collection's `variableName`; no separate connection step is needed.

Hook-slot maps are explicit overrides for the exceptional case where a readable
token must target a differently named collection:

```json
{
  "sign": "zodiac"
}
```

With that map, `[[sign]]` draws from the `zodiac` collection.

In MCP automation reads, `schema.hook_slots` is generated read-only output for
the currently resolved bindings. Persisted explicit values are returned
separately as `schema.hook_slot_overrides` and
`variableBindings.explicitOverrides`. `variableBindings` also reports missing
tokens, unused overrides, and duplicate-variable-name conflicts instead of
silently choosing a collection.

## Runtime variables are not collections

The following built-ins are computed from the scheduled run timestamp and
automation timezone:

| Token                      | Value                     |
| -------------------------- | ------------------------- |
| `[[slide_count]]`          | Rendered body-slide count |
| `[[current_year]]`         | Four-digit year           |
| `[[current_month]]`        | Full month name           |
| `[[current_month_number]]` | Two-digit month           |
| `[[current_day]]`          | Day of month              |
| `[[current_weekday]]`      | Full weekday name         |
| `[[current_date]]`         | Readable local date       |
| `[[current_iso_date]]`     | `YYYY-MM-DD`              |
| `[[current_time]]`         | Local hours and minutes   |

The legacy `[[year]]` token is migrated to `[[current_year]]`. Creating a
variable collection whose ID is `year` is rejected so a stored random value
cannot shadow the runtime date.

`[[slide_count]]` has no backing collection and is not user-editable. On a
static body block it resolves to `slideCount`; on a varying block it resolves
after the runtime min/max draw. `[[number]]` remains a free collection draw and
must only be used for counts that do not promise the number of body slides.

## Known limitations

- No dependency preview, soft delete, or audit log for mutations.
- No bulk import/export UI.
- No weights, ordering policy, per-value metadata, localization, or validation
  beyond non-empty normalized strings.
- Product-looking variable values are plain text and are unrelated to
  [Product Collections](product-collections.md).

## LumenLab read-through

LumenClip remains the single source of truth for values. Automation hook
bindings are derived in LumenClip and exposed read-only to LumenLab. Legacy
project connection records may still be displayed during migration, but they
must not decide whether an automation token resolves. Variable CRUD remains
delegated to `lumenclip_variable_get`, `lumenclip_variable_save`, and
`lumenclip_variable_delete`.

Use `scripts/migrate-automation-variable-bindings.mts` to report missing tokens,
unused overrides, variable-name conflicts, and differences between explicit
overrides and derived bindings. It does not silently resolve binding
mismatches.

# Hardcoded Seed Data And Static Assets

## Problem
Some seed/static app data still behaves like product data and includes hardcoded names, sample assets, provider labels, and imported collection references. This can leak demo state into the app.

## Found examples
- `data/realfarm.json`
  - hardcoded generated character asset name/model such as `Higgsfield Soul V2`.
  - static image collection titles such as `Pinterest - the wolf of wall street screencaps`, `Pinterest - nature textures`, and `Pinterest - space`.
- `data/automation-templates/templates.json`
  - imported Reelfarm/community collection IDs inside serialized `image_collection_ids`.
  - placeholder text directions embedded in template records.
- `data/swipes/swipes.json`
  - persisted Nike/meta example swipes with wall-of-text source values.
- `lib/realfarm-collections.ts`
  - fallback collection title `Pinterest - backgrounds`.

## Implementation target
- Separate seed/demo data from runtime persisted data.
- Add an explicit seed loader or migration that can be run intentionally, instead of shipping demo records as active app state.
- Validate imported template collection IDs against local collection aliases and report missing IDs.

## Acceptance criteria
- Fresh app state does not include unrelated Pinterest/Nike/demo records unless seeded intentionally.
- Template imports fail loudly or show missing collection warnings when collection IDs cannot resolve.
- Static defaults do not reference provider-specific collection names unless they are seed data.

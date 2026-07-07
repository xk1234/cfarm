# Automation Result Migration

## Scope

Start the data-model migration toward an Automation-centered app while keeping frontend behavior unchanged except for removing persisted draft slideshow affordances.

## Decisions

- `Result` is only created by an automation run.
- Persisted slideshow records are no longer drafts. A slideshow output is either `exported` or `failed`.
- Automation runs no longer use `draft` as a completion state. A generated output is a completed run.
- PostFast/TikTok draft publishing remains intact because it is an external posting mode, not an app draft object.
- Local React state names such as `draftName` can remain when they only mean unsaved form edits.

## Steps

1. Update tests so slideshow records default to exported output and legacy draft statuses normalize away.
2. Replace automation-run `draft` status with a completed/succeeded state while preserving legacy normalization.
3. Add a small canonical domain layer for Automation, Workflow, Run, Result, Template, Collection, Account, Publication, and Swipe references.
4. Remove slideshow draft tab, duplication, and save-as-draft frontend paths.
5. Run focused typecheck/tests/lint for touched areas and document any unrelated failures.

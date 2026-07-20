---
title: "Create an astrology X automation and generate a post [User]"
description: "Configure an astrology X content engine, derive its strategy, generate a draft, and optionally publish it."
---

## Outcome

A persistent X automation reuses an astrology niche, audience strategy, hook
set, voice, discovery filters, schedule, and X accounts to generate native X
drafts.

> **Verification status:** the editor, persistence, and strategy fallback path
> work. Temporary provider failures are retried, then routed to the configured
> fallback model. If all attempts fail, the editor keeps the current form and
> shows a retry action with a useful error.

## 1. Create the X automation

1. Open **New automation**.
2. Select **Other social media**.
3. Select **New X automation**.

![Other social media currently offers X and Threads](/docs/workflows/social-text-01-platform-choice.jpg)

## 2. Configure the astrology strategy

1. Set **Niche** to `astrology education for beginners`.
2. Select **Generate strategy**. This derives an audience, promise, and weighted
   content pillars that are reused across drafts.
3. Add the optional topic `What your rising sign says about first impressions`.
4. Choose X-compatible hooks and a voice preset.
5. Select **Save** before generating.

![Astrology niche and topic in the X Content Engine](/docs/workflows/x-automation-02-configure.jpg)

The strategy must exist before **Generate draft** can succeed.

## 3. Generate the post

1. Select **Generate draft**.
2. Wait for the native preview on the right.
3. Read the final post for unsupported astrology certainty. Prefer wording such
   as `astrologers associate...` over presenting interpretation as scientific
   fact.
4. If picture mode is enabled, select **Picture** and review the generated image.
5. A manual draft remains unpublished and unscheduled.

## 4. Connect an account and publish

1. Open **Social Media Settings**.
2. Select **Add or change account**, complete the PostFast connection, then
   select **Refresh**.
3. Choose only X accounts for this automation.
4. Enable auto-publish only for scheduled single posts.
5. Save and return to **Overview**.
6. After a draft exists and an account is selected, use **Publish** in the
   native-preview header.

![X account and auto-publish settings](/docs/workflows/x-automation-03-publishing.jpg)

Multi-post X threads remain drafts because reply-chain publishing is not
available through the current provider contract.

## Provider failure behavior

Strategy derivation makes at most two attempts on the selected primary model,
then one attempt on the configured fallback. Success and failure operations
retain model, status/code, message, and retryability diagnostics. A fully
failed operation returns an inline **Retry** action without clearing the niche,
topic, hooks, voice, or other unsaved editor state.

## Success check

- The X automation appears in **Automations** with its schedule and account.
- The niche strategy is persisted.
- The generated post appears in the X-native preview.
- Manual generation does not receive an automatic publication time.
- Publishing is available only after selecting a compatible X account.

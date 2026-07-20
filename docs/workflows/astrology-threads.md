---
title: "Create an astrology Threads automation and generate a post [User]"
description: "Configure an astrology Threads content engine, generate a draft, and understand current publishing limits."
---

## Outcome

A persistent Threads automation generates platform-specific astrology drafts
with Threads hook formulas, voice, schedule, and account restrictions.

## 1. Create the Threads automation

1. Open **New automation**.
2. Select **Other social media**.
3. Select **New Threads automation**.

![Other social media platform choices](/docs/workflows/social-text-01-platform-choice.jpg)

## 2. Configure strategy and topic

1. Enter `astrology education for beginners` as the niche.
2. Select **Generate strategy**.
3. Enter the optional topic `How your moon sign shapes emotional needs`.
4. Enable appropriate Threads hooks such as **REAL TALK**, **HOT TAKE**, or
   **JUST A REMINDER** only when they match the claim.
5. Choose a voice preset and save.

![Astrology Threads automation configuration](/docs/workflows/threads-automation-02-configure.jpg)

## 3. Generate and review

1. Select **Generate draft**.
2. Review the Threads-native preview.
3. Check that the first line creates curiosity without clickbait and that the
   rest pays it off.
4. Remove unsupported predictions, invented personal stories, and scientific
   certainty.
5. Manual generation remains unpublished and unscheduled.

Threads uses the same bounded retry, fallback-model, and inline retry behavior
described in the [X workflow](/docs/workflows/astrology-x#provider-failure-behavior).

## 4. Configure publishing

1. Open **Social Media Settings**.
2. Connect and select a Threads account.
3. Save the account selection.
4. Enable auto-publish only if the generated output is a supported single post.

![Threads account and auto-publish settings](/docs/workflows/threads-automation-03-publishing.jpg)

The current provider does not expose a safe reply-chain contract. Multi-post
Threads outputs therefore remain drafts even when auto-publish is enabled.

## 5. Publish a supported single post

1. Return to **Overview** after a successful generation.
2. Confirm the correct Threads account is selected.
3. Select **Publish** in the native-preview header.
4. Verify the result on Threads and in LumenClip's publication/calendar state.

## Success check

- The automation is permanently fixed to Threads.
- Its strategy, topic, hooks, schedule, and account are saved.
- A generated draft appears in the native preview.
- Unsupported multi-post outputs remain drafts instead of being partially
  published.

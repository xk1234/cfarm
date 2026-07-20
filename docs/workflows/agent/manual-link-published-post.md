---
title: "Record a self-published post [AI Agent via MCP]"
description: "Callable agent workflow for attaching a public release URL and provider evidence without publishing anything."
---

> **Implemented.** `lumenclip_output_mark_published` links an existing public
> post to an owner-scoped LumenClip output without sending content to a
> provider.

## Outcome

The agent attaches a public URL from a post the user already published to the
exact LumenClip output, without uploading media or creating another social
post.

## Before you start

- Have the public HTTPS URL of the self-published post.
- Identify the LumenClip output and platform used.
- Provide the social account identity if analytics attribution is required.

## 1. Find the exact output

1. Ask for the LumenClip output, public post URL, platform, and account
   identity used to publish it.
2. Call `lumenclip_outputs_list` to resolve the exact ready, not-published output.
   If multiple outputs match, present them and ask the user to choose.
3. Call `lumenclip_accounts_list` only when account attribution is requested or
   needed for analytics matching.

## 2. Validate the link

1. Validate that the URL is public HTTPS, matches the stated provider, and is
   not already attached to another output.
2. Restate the output title, provider, account, and URL. Ask for explicit
   confirmation to record publication evidence.

## 3. Record publication evidence

1. Call `lumenclip_output_mark_published` with:
   - output ID;
   - public HTTPS URL;
   - platform;
   - account ID when known;
   - publication timestamp;
   - request ID;
   - `confirmLink: true`.
2. Verify the structured result reports `publicationState: published` and the
   expected release URL/account evidence.
3. Return the live URL and output ID.

## Success check

- The exact output is unambiguous.
- The URL matches the claimed provider and is not linked elsewhere.
- The output stores the live URL and external publication evidence.
- No provider publishing endpoint was called and no duplicate post was created.

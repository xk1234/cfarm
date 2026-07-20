---
title: "MCP workflows"
description: "AI-agent counterparts for user workflows, with callable and proposed capabilities identified explicitly."
---

> **Partially implemented.** Existing-automation, slideshow, collection,
> output, account, publishing, scheduling, analytics, and TikTok reconciliation
> tools are callable. Individual workflows that depend on template creation,
> MCP resources, saved-video execution, or LinkedIn automation remain proposed.

## Agent operating rules

Every agent workflow must:

1. inspect the callable tool list and available capabilities first;
2. when template tools are available, inspect catalog templates and allowed
   overrides before creating an automation from scratch;
3. clone templates into user-owned automations instead of modifying shared
   catalog records;
4. preview and show an edit diff when the workflow supports a preview;
5. request the narrowest scopes enforced by the active transport;
6. use resource IDs instead of guessing names;
7. save new automations paused unless the user explicitly requests a schedule;
8. attach the tool's required request ID or idempotency key to every mutation;
9. treat generation and publishing as separate operations;
10. poll asynchronous operations through `lumenclip_operation_get`;
11. inspect the generated output before asking for publication approval;
12. require explicit account IDs and `confirm_publish: true` for external posts;
13. return available resource URIs, warnings, and publication evidence to the
    user.

## Human-to-agent mapping

| User workflow                                                   | Agent counterpart                                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [Astrology slideshow](/docs/workflows/astrology-slideshow)      | [Generate and publish an astrology slideshow](/docs/workflows/agent/astrology-slideshow)   |
| [Study Tips template](/docs/workflows/study-tips-template)      | [Create a study-tips slideshow from a template](/docs/workflows/agent/study-tips-template) |
| [AI UGC reaction video](/docs/workflows/astrology-ugc-reaction) | [Configure a React & Reveal video](/docs/workflows/agent/astrology-ugc-reaction)           |
| [Greenscreen meme](/docs/workflows/astrology-greenscreen)       | [Configure a greenscreen meme video](/docs/workflows/agent/astrology-greenscreen)          |
| [X automation](/docs/workflows/astrology-x)                     | [Configure and run an X automation](/docs/workflows/agent/astrology-x)                     |
| [Threads automation](/docs/workflows/astrology-threads)         | [Configure and run a Threads automation](/docs/workflows/agent/astrology-threads)          |
| [LinkedIn automation](/docs/workflows/astrology-linkedin)       | [Configure and run a LinkedIn automation](/docs/workflows/agent/astrology-linkedin)        |
| [Content analysis](/docs/workflows/content-analysis)            | [Analyze content performance](/docs/workflows/agent/content-analysis)                      |
| [Manual post linking](/docs/scheduling/manual-linking)          | [Record a self-published post](/docs/workflows/agent/manual-link-published-post)           |

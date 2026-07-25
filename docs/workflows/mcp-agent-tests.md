---
title: "MCP agent workflow tests"
description: "Guidance for running conversational end-to-end stories against the LumenClip MCP surface."
---

# MCP agent workflow tests

These workflow tests are **user stories executed by an AI agent** with the MCP
tools connected. Each one gives the agent what a user wants, in the user's
words, and checks whether the user ends up with it.

They deliberately do not say which tools to call. Working that out is part of
what's being tested: if an agent can't get from "I want to post about curtains"
to a generated slideshow without being handed the tool names, the product has a
problem no unit test will find.

## Why these exist

The MCP surface *is* the product for anyone driving LumenClip from a chat
window. Nothing else covers it:

| | [Browser tests](/docs/workflows/browser-tests) | [MCP agent workflow tests](/docs/workflows/mcp-agent-tests) |
|---|---|---|
| Runner | Playwright | an AI agent |
| Surface | the web UI | the MCP tools |
| Data | fixtures | the real configured backend |
| Asks | "does the button work" | "did the user get what they wanted" |

Several checks here are judgements — does this copy sound like the tone the user
asked for, is this image a sensible pick, can you actually read the text on the
slide. A test runner can't answer those. An agent can.

## Running one

Play the conversation a turn at a time, doing what the user asks and checking
the stated outcome before moving on. Don't read ahead — an agent that knows
turn 6 is coming will over-prepare in turn 1, and real users don't work that way.

Two standing rules:

- **Don't repair the product mid-run.** Record what broke and keep going.
- **Don't report success you didn't observe.** "I couldn't verify this" is a
  perfectly good result; a false pass is not.

## Transport, and why it decides the verdict

Importing `createLumenClipMcpServer` and calling the handlers directly will make
most of a story pass. It also skips the entire path a real user goes through, so
it proves much less than it appears to. Record which you used:

- `connector` — the MCP connector in the agent's client (what a user actually has)
- `http` — a direct JSON-RPC POST to `<base>/mcp`
- `in-process` — handlers imported directly (**diagnostic only, never a pass**)

Before trusting an environment, issue one real read. A handshake only proves the
route is mounted — it has answered happily while the server couldn't reach its
database at all:

```bash
curl -s -X POST "$BASE/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}'
```

## Stories

- [Curtains slideshow MCP test](/docs/workflows/curtains-slideshow) — a user
  sets up a curtains slideshow, reworks its hooks and voice, generates one, and
  throws it away.

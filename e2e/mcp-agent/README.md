# MCP agent end-to-end tests

Tests in this folder are executed by an **AI agent driving the MCP tools**, not
by a human and not by a test runner. They exist because the MCP surface is the
product: the question they answer is *"can an agent be asked to build and
generate a slideshow, and does it actually work end to end?"*

## How these differ from `e2e/*.spec.ts`

| | `e2e/*.spec.ts` | `e2e/mcp-agent/*.md` |
|---|---|---|
| Runner | Playwright | an AI agent |
| Surface | the web UI | the MCP tools |
| Data | fixtures | the real configured backend |
| Assertions | code | stated per step, checked by the agent |

## Rules for the executing agent

1. **Follow the steps in order.** Later steps depend on IDs produced earlier.
2. **Check every stated assertion.** A step without a satisfied assertion is a
   FAIL — do not proceed past a failed precondition.
3. **Do not repair the product to make a step pass.** Record the failure with
   the exact tool name, arguments and response. Fixing the code is a separate
   task from running the test.
4. **Report honestly.** State PASS/FAIL per step, then a summary. If a step was
   skipped, say so and why. Never infer a result you did not observe.
5. **Clean up** in the final step, even after failures, unless the run is being
   handed to a human for inspection — say which you did.

## Transport matters

An in-process run (importing `createLumenClipMcpServer` and calling handlers
directly) validates the *handlers* but **not** the wiring an agent actually
uses. If you cannot reach the MCP endpoint over HTTP, the test result is
`BLOCKED`, not `PASS`. Record which transport you used:

- `connector` — the MCP connector configured in the agent's client (preferred)
- `http` — a direct JSON-RPC POST to `<base>/mcp`
- `in-process` — handlers imported directly (**diagnostic only, never PASS**)

## Verifying the transport before you start

```bash
curl -s -X POST "$BASE/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}'
```

A successful handshake proves only that the route is mounted. It does **not**
prove the server can reach its data backend — issue one real `tools/call`
(step 0 of the test) before trusting the environment.

## Tests

- [`curtains-slideshow.md`](curtains-slideshow.md) — full CRUD over hooks, tone
  and granular text settings, then a real generation with rendered slides.

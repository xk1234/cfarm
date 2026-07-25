---
title: "Curtains slideshow MCP test"
description: "A conversational end-to-end story for configuring, generating, reviewing, and removing a curtains slideshow."
---

# Curtains slideshow MCP test

This workflow is executed by an AI agent with the LumenClip MCP tools connected,
not by a script. The agent is given what the user wants and has to work out how
to do it. If the agent needs to be told which tool to call, the test has failed
at something more important than the tool.

## Who the user is

Runs a small home-furnishing account. Knows curtains, does not know what a
"formatting block" or a "text item id" is. Talks to Claude the way they would
talk to an assistant, and expects to be told when something can't be done.

## How to run this

Play the conversation below one turn at a time. For each turn:

1. Read **what the user says**. That is the entire input — do not read ahead.
2. Do it.
3. Check it against **done means**.
4. Record PASS / FAIL / BLOCKED and, for anything the user would notice, say
   what they'd see.

Rules:

- **Don't fix the product mid-run.** If a tool is broken, record it and carry
  on if you can. Repairing it is a separate job.
- **Don't fake progress.** If you couldn't verify something, say so. A test that
  reports success it didn't observe is worse than a failing one.
- **Judge like the user would.** Several checks below are about whether copy
  sounds right or an image fits. Give an opinion; don't reduce it to a number.
- If the MCP tools aren't reachable at all, the run is **BLOCKED** — not a
  failure of the product's logic, and not a pass. Say which transport you tried.

---

## Turn 1

> "I want to start posting slideshows about curtains — the buying-guide kind of
> thing, for people doing up a room. Can you set that up?"

**Done means:** a slideshow automation exists, named something a human would
recognise as this. It is **not** live yet — the user didn't ask to start
posting, and quietly scheduling real posts would be wrong.

**Watch for:** the agent inventing a name so generic the user can't find it
later, or switching it live unasked.

---

## Turn 2

> "Give it a few hooks. Stuff like the mistakes people make, blackout vs sheer,
> that kind of thing. One of them should count the tips, like '5 curtain
> mistakes…' — I like those."

**Done means:** several hooks exist and read like something a real account would
post. The counting one actually counts — when it generates, the number matches
how many tips are in the slideshow, rather than being a number someone typed in
and that drifts out of sync.

**Watch for:** a hardcoded "5" that will be wrong the moment the slide count
changes. Ask yourself whether the agent used the mechanism that keeps the number
honest.

---

## Turn 3

> "Reading them back — they sound like an ad. I want it to sound like someone
> who's actually hung a lot of curtains and is telling you what they'd do.
> Lowercase, no fancy words."

**Done means:** the automation's tone/voice settings say this. The change is
saved and survives a re-read.

**Watch for:** the agent replacing the whole configuration to change one field
and silently dropping something else (the image collection is the usual
casualty). After this turn, everything set in turns 1–2 should still be there.

---

## Turn 4

> "That one about curtain length is weak. Actually — don't delete it yet, just
> turn it off, I might want it back."

then, in the same turn:

> "Nah, bin it properly."

**Done means:** first it stops being used but still exists; then it's gone. The
other hooks are untouched throughout.

**Watch for:** an agent that treats "turn it off" and "delete" as the same
thing. The user explicitly distinguished them, and past performance data is
attached to hooks — that's why disabling exists.

---

## Turn 5

> "The body text is way too wordy. Keep it to a sentence or so. And each slide
> should be one tip someone can actually go and do."

**Done means:** the per-slide text limits are tightened and the guidance for
body slides says roughly that. The user should not have to know these live in
three separate blocks.

**Watch for:** the agent changing the hook or CTA limits by mistake, or setting
limits so tight that generation can't satisfy them.

---

## Turn 6

> "Alright, make one and show me."

**Done means:** a slideshow is generated and the user is shown the actual
slides — images with the text on them, not a JSON blob or a list of ids.

**Watch for, and report:**

- **Can you see the words?** Open a rendered slide and look. Text rendering has
  failed silently before — every character came out as a `□` box — and nothing
  in the automated suite catches it, because a laptop with fonts installed
  renders fine even when the bundled font is missing. This is the single most
  important check in this test.
- **Does it sound like turn 3?** Practical, lowercase, plain. If it reads like
  a brochure, the tone setting isn't reaching the writer.
- **Is it about curtains?** Every slide should be a real curtain tip.
- **Do the images fit?** They're picked from whatever collection is available,
  which may not be curtain photography — say what you see rather than failing
  on it.
- **Did the counting hook resolve?** If it was chosen, the number should match
  the number of tips.
- If the copy slightly overshoots the limits from turn 5, that's **not** a
  failure — those are reported as warnings alongside the draft by design.
  Failing the whole generation over one long sentence would be the bug.

**Also:** nothing should have been posted anywhere. The user asked to see it.

---

## Turn 7

> "Cool. Get rid of it, I was just trying it out."

**Done means:** the automation and what it generated are gone, and the user is
told what was removed.

**Watch for:** leftovers — generated slideshows, queued jobs, draft posts. If
anything survives, say what.

---

## Reporting

Write it as a short account of how the conversation went, not a table dump:

```
transport: <connector / direct http / none — BLOCKED>
backend:   <which environment the tools were talking to>

turn 1 …  PASS/FAIL/BLOCKED — one line on what the user would have seen
…
turn 7 …

did it work?      <would this user have gotten what they wanted?>
what looked off?  <tone, imagery, anything clumsy>
bugs found        <exact tool, what you sent, what came back>
friction          <where the agent had to guess, or the user would've been confused>
```

The last line matters most. If the agent had to guess at something the user
never said, that's a gap in the tools or their descriptions — and it's the kind
of thing only this test will surface.

---

## Notes for whoever runs this

A few things that have bitten before, worth knowing but not worth telling the
agent up front — if the agent trips on them, that *is* the finding:

- Ids for individual text items are generated per automation. Anything that
  assumes a fixed name will fail on a fresh one.
- The schema update tool replaces the whole schema rather than patching it.
- Most edits take an optimistic-lock timestamp; re-read before each write.
- A successful MCP handshake does **not** mean the server can reach its
  database. Issue one real read before trusting the environment.
- Running the tool handlers in-process proves the handlers work, not the wiring
  the user actually goes through. That's `BLOCKED`, not `PASS`.

## Known state (2026-07-25)

Turns 1–5 have been observed working, but only by calling the handlers directly
rather than over a real connection — so by the rule above, this test has **not
yet passed**. Turns 6–7 have never been run over a real connection.

The deployed endpoint answers a handshake but fails every actual call with
`fetch failed`: it can't reach its database, most likely because its hosting
environment still points at the exhausted Appwrite Cloud project instead of the
current server.

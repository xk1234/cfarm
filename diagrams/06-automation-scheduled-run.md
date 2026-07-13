# 06 — Automation Scheduled Run

The core orchestration. A cron trigger evaluates all automations, and for each due, live automation it builds a content plan (hook + text + images + translation), renders a slideshow (workflow 04), optionally auto-publishes (workflow 10), and records usage for reuse-avoidance.

Entry: `/api/automations/run` (GET/POST)
Core: `lib/automation-runner.ts` (`runDueAutomations` → `executeAutomationRun` → `createAutomationRunPlan`)

```mermaid
flowchart TD
    CRON(["Cron -> /api/automations/run"]) --> LIST["runDueAutomations: list AutomationRecords"]

    LIST --> LOOP{"for each automation"}
    LOOP --> LIVE{"schema.status == live?"}
    LIVE -->|No| SKIP1["skip: not_live"]
    LIVE -->|Yes| DUE{"any due schedule slots?"}
    DUE -->|No| SKIP2["skip: not_due"]
    DUE -->|Yes| CLAIM["claimAutomationRunSlot (dedupe concurrent runs)"]

    CLAIM --> HOOK

    subgraph PLAN["createAutomationRunPlan"]
        HOOK["selectAutomationHook (avoid recent usage keys)"]
        HOOK --> TEXT["generateAutomationText (LLM) + one retry"]
        TEXT --> COLL["readImageCollections + recent image usage"]
        COLL --> PICK["Pick slides/images (reuse-aware)"]
        PICK --> TRANS{"language != en?"}
        TRANS -->|Yes| DL["translateAutomationSlides (DeepL)"]
        TRANS -->|No| DONEPLAN["plan.slides ready"]
        DL --> DONEPLAN
    end

    DONEPLAN --> EMPTY{"plan.slides.length > 0?"}
    EMPTY -->|No| FAILRUN["Run status = failed (no images)"]
    EMPTY -->|Yes| RENDER["createSlideshowResultRecord -> workflow 04 render"]

    RENDER --> POSTQ{"plan.autoPost AND active integrations?"}
    POSTQ -->|Yes| PUB["publishAutomationRun -> workflow 10 (never fails the run)"]
    POSTQ -->|No| STAT
    PUB --> STAT["socialStatusesForRun"]

    STAT --> USAGE["recordRunUsage -> usage ledger (hooks + images)"]
    USAGE --> PERSIST["Persist AutomationRunRecord (+ slideshowId, artifacts)"]
    FAILRUN --> PERSIST
    PERSIST --> LOOP
    LOOP -->|done| END(["Return created / results / skipped"])
```

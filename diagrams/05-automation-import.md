# 05 — Automation Import

Import a Reelfarm automation export (or network response) and normalize it into the local `AutomationRecord` + `AutomationSchema`. Raw automation POSTs to `/api/automations` are rejected and redirected to the templates endpoint.

Entry: `/api/automation-templates`, `/api/automations`
Core: `lib/automations.ts` (`normalizeReelfarmAutomation`), `lib/automation-templates.ts`, `lib/realfarm-automation.ts` (`defaultAutomationSchema`)

```mermaid
flowchart TD
    START(["User imports a Reelfarm automation"]) --> POST["POST payload (structured export or response)"]
    POST --> WHICH{"raw import to /api/automations?"}
    WHICH -->|Yes| REDIR["Route rejects -> redirect to /api/automation-templates"]
    WHICH -->|No| NORM
    REDIR --> NORM["normalizeReelfarmAutomation"]

    NORM --> SCHEMA["Build AutomationSchema (prompt_formatting, formatting[], tiktok_post_settings, schedule)"]
    SCHEMA --> RAW["Retain original payload in record.raw"]
    RAW --> SHADOW["Sync shadow fields (status, account, handle, times) from schema"]
    SHADOW --> SAVE["Persist AutomationRecord to 'automations' store"]
    SAVE --> SUMMARY["automationRecordToSummary -> compact Automation card"]
    SUMMARY --> DONE(["Automation appears on Home / Automations"])
```

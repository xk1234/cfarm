# LumenClip — workflow overview

Current end-to-end workflow map. Data boxes use active physical Appwrite tables,
with logical output categories shown in parentheses. Backend structure and the
full logical-to-physical map live in
[`docs/reference/backend-architecture.md`](../docs/reference/backend-architecture.md).

```mermaid
flowchart TB
    subgraph Inputs["Sources"]
        USER["User / browser"]
        CRON["Appwrite cron"]
        REEL["ReelFarm-shaped template export"]
        SOCIAL["Connected PostFast accounts"]
    end

    subgraph Product["Content production"]
        HOME["Home"]
        COL["07 Collections + captions"]
        ASSET["09 Asset management"]
        GREEN["11 Generated video export"]
        AUTO["Automations"]
        XAUTO["X / Threads automations"]
        RENDER["04 Slideshow render"]
    end

    subgraph Operations["Scheduling and distribution"]
        SCHED["06 Automation scheduler"]
        JOB["Job worker"]
        PUB["10 Social publishing"]
        CAL["Schedule calendar"]
        ANA["Analytics snapshots"]
    end

    subgraph Tables["Active Appwrite TablesDB"]
        PA["permanent_assets\n(collections, templates, assets)"]
        AUTOT["automations"]
        RUNS["automation_runs"]
        XAUTOT["x_automations"]
        OUT["outputs\n(results, generated videos, X runs, publications)"]
        MEDIA["output_media"]
        JOBS["jobs"]
        METRICS["metric + follower snapshots"]
    end

    USER --> HOME
    USER --> COL --> PA
    USER --> ASSET --> PA
    USER --> GREEN --> OUT
    USER --> AUTO --> AUTOT
    USER --> XAUTO --> XAUTOT
    REEL -->|"05 template import"| PA

    AUTO -->|"manual generate"| RENDER
    RENDER --> RUNS
    RENDER --> OUT
    OUT --> MEDIA

    CRON --> SCHED --> JOBS --> JOB
    JOB --> AUTOT
    JOB --> XAUTOT
    JOB --> RUNS
    JOB --> OUT
    JOB --> PUB

    USER --> PUB
    SOCIAL --> PUB
    PUB --> OUT
    OUT --> CAL
    JOBS --> CAL
    AUTOT --> CAL
    SOCIAL --> ANA --> METRICS
```

## Detailed workflows

- [04 — Slideshow render](04-slideshow-render.md)
- [05 — Automation import](05-automation-import.md)
- [06 — Automation scheduled run](06-automation-scheduled-run.md)
- [07 — Image collection and captioning](07-image-collection.md)
- [09 — Asset management](09-asset-management.md)
- [10 — Social publishing](10-social-publishing.md)
- [11 — Generated video export](11-generated-video-export.md)

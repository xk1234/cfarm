# 10 — Social Publishing (PostFast)

Publish content to social platforms through PostFast: connect integrations, upload media, create scheduled/immediate posts, and sync analytics back. Invoked directly from export cards and automatically by the automation run (workflow 06).

Entry: `/api/postfast/{integrations,connect-url,upload,posts}` and `/api/analytics/report`
Core: `lib/postfast-client.ts`, `lib/postfast-posts.ts`, `lib/publishing.ts`

```mermaid
flowchart TD
    START(["Publish request (UI export card or automation run)"]) --> CFG{"POSTFAST_API_KEY configured?"}
    CFG -->|No| NOOP(["No-op / draft only"])
    CFG -->|Yes| INTEG["GET /api/postfast/integrations (active accounts)"]

    INTEG --> MEDIA{"has media to attach?"}
    MEDIA -->|Yes| UPLOAD["POST /api/postfast/upload -> PostFast media keys"]
    MEDIA -->|No| CONTENT
    UPLOAD --> CONTENT["Build content (caption + hashtags) + media[]"]

    CONTENT --> POST["POST /api/postfast/posts -> publishPost"]
    POST --> API["PostFast API: schedule or publish"]
    API --> OK{"result.ok?"}
    OK -->|No| ERRREC["Record error on PostFastPostRecord"]
    OK -->|Yes| REC["upsertPostFastPostRecord (status: scheduled | published)"]

    REC --> SYNC["POST /api/analytics/report"]
    ERRREC --> STORE
    SYNC --> UPDA["updatePostFastPostAnalytics"]
    UPDA --> STORE["'postfast posts' store"]
    STORE --> DONE(["Post + analytics on Schedule/Analytics tabs"])
```

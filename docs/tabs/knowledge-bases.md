# Knowledge Bases Tab

Route key: `knowledge`

Component: `KnowledgeBasesPanel` in `components/realfarm/knowledge-bases-panel.tsx`

## Functionality

Create and manage reusable research context ("knowledge bases") that automations can inject into generation. Each knowledge base holds multiple ingestion **sources** that are scraped/ingested into chunks and compiled into a single context string.

Main actions:

- Create, edit, and delete knowledge bases.
- Add sources of various kinds (see below) with a mode and expiry.
- Queue a refresh that scrapes/ingests sources into `chunks` + `compiledText`.
- Enable a knowledge base as context on an automation.

## Objects Used

| Object | Source | Usage |
| --- | --- | --- |
| `KnowledgeBaseRecord` | `lib/knowledge-bases.ts` | `id, name, description, status, sources[], compiledText, lastRefreshedAt`. Status: `idle \| refreshing \| ready \| error`. |
| `KnowledgeBaseSource` | `lib/knowledge-bases.ts` | `id, mode, kind, label, value, expiry, enabled, status, chunks[]`, plus file fields for uploads. |
| `KnowledgeChunk` | `lib/knowledge-bases.ts` | Ingested/compressed text chunk. |

**Source kinds** (`KnowledgeBaseSourceKind`): `link, youtube, file, google, reddit, rss, twitter, tiktok`.

**Source modes**: `research` | `realtime`. Only `realtime` + `enabled` sources are refreshable.

**Expiry**: `0m | 1h | 24h | 1w | 1mo | 1y`. **Source status**: `idle | queued | processing | ready | error`.

## Refresh flow

`queueKnowledgeBaseRefresh(id, sourceIds?)` sets the KB `status: "refreshing"`, marks selected sources `queued`, and enqueues one `refresh-knowledge-source` job per source (dedupe key `knowledge-source:{kbId}:{sourceId}:{ts}`). The cloud `job-worker`'s `refresh-knowledge-source` handler performs ingestion. Providers used during ingestion: Apify (RSS/reddit/twitter/tiktok/youtube), DataForSEO (Google), FAL/OpenAI Whisper (audio), pdf-parse (files), OpenRouter (compression).

## Persistence

Knowledge bases persist in the `knowledge_bases` table; uploaded files live in the `knowledge_base_files` Storage bucket (cleaned up on delete). Appwrite is authoritative — no filesystem fallback.

API routes:

- `GET / POST /api/knowledge-bases`
- `PATCH /api/knowledge-bases/[id]` (triggers refresh) · `DELETE /api/knowledge-bases/[id]`
- `POST /api/knowledge-bases/upload` (file sources)

## Consumed by automations

`AutomationSchema` carries `knowledge_context_enabled?: boolean` and `knowledge_base_ids?: string[]` (`lib/realfarm-automation.ts`). When enabled, the automation runner injects the compiled KB context into generation.

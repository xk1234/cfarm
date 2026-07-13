# Authentication and multitenancy

LumenClip uses Appwrite Accounts for email/password authentication and an HTTP-only `lumenclip-session` cookie for server-rendered sessions.

## Route boundary

- `/` is public marketing.
- `/login` handles registration and login.
- `/app` requires a verified Appwrite session.
- `/api/auth/*` is public.
- Other `/api/*` routes require a verified Appwrite session.

Proxy checks are the first boundary. `/app` also verifies the session during server rendering. Private Appwrite stores resolve the current Appwrite user again before reading or writing records.

## Ownership contract

Every private record has ownership in two places:

- Appwrite column: `owner_id`
- Serialized domain record: `ownerId`

Row IDs are hashes of `table + ownerId + domain record id`, so two users can use the same domain ID without a collision.

Private tables:

- `automations`, `automation_runs`
- `swipes`
- `results`, `slideshows`, `generated_video_exports`
- `assets`, `image_collections`
- `characters`, `character_generations`, `character_video_generations`
- `word_collections`, `knowledge_bases`, `postfast_posts`
- `usage_ledger`, `jobs`

Shared tables:

- `automation_templates`
- `automation_template_runs`

All private reads, updates, and deletes filter by `owner_id`. Queue jobs carry ownership through the scheduler and worker into generated automation runs.

## Provisioning

Run the idempotent schema provisioner against the configured Appwrite project:

```bash
pnpm appwrite:multitenancy
```

Records created before authentication remain unassigned and invisible by default. To assign them deliberately, find the target Appwrite user ID and run:

```bash
LUMENCLIP_LEGACY_OWNER_ID=<user-id> pnpm appwrite:multitenancy
```

Do not assign legacy records to a user until their ownership is known.

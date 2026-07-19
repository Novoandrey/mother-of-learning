# Data Model — MEDIA-02

## Existing entity: `media_assets`

MEDIA-01 keeps its current fields and immutable `storage_key` (the original).
Migration 140 adds only additive metadata:

| Field | Type | Meaning |
|---|---|---|
| `source_width` | integer nullable | width discovered by worker |
| `source_height` | integer nullable | height discovered by worker |
| `variant_state` | text | `queued`, `processing`, `ready`, `failed` |
| `variant_version` | smallint | current desired rendition algorithm version, initially `1` |
| `variant_error_code` | text nullable | safe diagnostic code, never source path/bytes |
| `variants_updated_at` | timestamptz nullable | latest terminal state time |

`storage_key`, original MIME, original file size and original filename remain
unchanged. A source does not become a new source merely because the algorithm
is updated.

## New entity: `media_asset_variants`

| Field | Type | Constraints / meaning |
|---|---|---|
| `id` | uuid | primary key |
| `asset_id` | uuid | FK `media_assets(id)` on delete cascade |
| `rendition` | text | `thumb`, `preview`, or `scene` |
| `version` | smallint | rendition algorithm version |
| `storage_key` | text | unique immutable R2 object key |
| `mime_type` | text | initially `image/webp` |
| `width` / `height` | integer | positive, never larger than source dimensions |
| `size_bytes` | bigint | positive |
| `created_at` | timestamptz | immutable write time |

Unique constraint: `(asset_id, rendition, version)`. Indexes support joining
the currently requested rendition from newest-first pages and looking up an
asset/rendition in O(log n).

## New entity: `media_variant_jobs`

| Field | Type | Meaning |
|---|---|---|
| `id` | uuid | primary key |
| `asset_id` | uuid | FK, one active logical job per asset/version |
| `version` | smallint | algorithm version requested |
| `state` | text | `queued`, `processing`, `ready`, `failed` |
| `attempts` | integer | incremented when worker claims |
| `lease_owner` | text nullable | opaque worker identity |
| `lease_expires_at` | timestamptz nullable | makes abandoned claims recoverable |
| `next_attempt_at` | timestamptz | retry scheduling |
| `last_error_code` | text nullable | safe code only |
| `created_at` / `updated_at` | timestamptz | audit times |

Unique constraint: `(asset_id, version)`. `claim_media_variant_job(worker_id)`
atomically selects a due queued/expired job with `FOR UPDATE SKIP LOCKED`, sets
its lease and returns its source metadata. Completion/failure procedures require
the same lease owner. Browser clients receive none of this table directly.

## Page response model

```ts
type MediaPageItem = {
  id: string
  originalFilename: string
  createdAt: string
  variantState: 'queued' | 'processing' | 'ready' | 'failed'
  thumbnail: { url: string; width: number; height: number } | null
}

type MediaPage = {
  items: MediaPageItem[]
  nextCursor: string | null
}
```

The cursor encodes the last `(created_at, id)`, is signed or opaque to callers,
and never contains an R2 storage key.

## Lifecycle

```text
MEDIA-01 original saved
  → media_assets.variant_state = queued
  → one job queued
  → worker lease / processing
  → variant rows written
  → ready

worker failure or expired lease
  → queued for retry OR failed after configured retry policy
  → owner/DM can enqueue a new attempt
```

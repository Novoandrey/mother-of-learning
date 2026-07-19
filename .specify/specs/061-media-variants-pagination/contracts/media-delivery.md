# Contract — MEDIA-02 media delivery

## `GET /api/media`

**Authentication**: required campaign membership.
**Input**: `campaignId` and optional opaque `cursor`.
**Output**: a newest-first page of at most 48 `MediaPageItem` values and an
optional `nextCursor`.

| Status | Meaning |
|---|---|
| `200` | member receives page; `nextCursor` can be `null` |
| `400` | malformed cursor or campaign input |
| `401` | unauthenticated |
| `403` / `404` | user is not a member; match established campaign route policy |

The item has a thumb URL only when rendition `thumb` is ready. It MUST NOT
include `storage_key`, original URL, queue lease data or other campaigns'
metadata.

## `POST /api/media/:id/retry-variants`

**Authentication**: required campaign membership.
**Effect**: safely enqueue or reactivate the current-version job if it is not
already processing/ready. It never uploads a new original and never overwrites
a ready variant.

| Status | Meaning |
|---|---|
| `202` | a job is queued or was already queued |
| `409` | current job is actively leased; retry is unnecessary |
| `403` | outside campaign |
| `404` | missing or inaccessible asset |

## Server-only `resolveMediaRendition`

```ts
resolveMediaRendition({ campaignId, assetId, rendition })
// -> { status: 'ready', url, width, height }
//  | { status: 'processing' }
//  | { status: 'failed' }
//  | { status: 'not_found' }
```

Callers must already have a campaign request context; the helper independently
checks membership before returning `ready`. It returns a single named rendition
and never falls back silently to the original.

# Contract: upload one media asset

## `POST /api/media/upload`

Authenticated multipart request used by the media-library form.

### Form fields

| Field | Type | Required | Meaning |
|---|---|---|---|
| `campaignId` | UUID string | yes | Target campaign |
| `file` | binary file | yes | One PNG, JPEG or WebP up to 12 MiB |

### Success — `201 Created`

```json
{
  "asset": {
    "id": "uuid",
    "campaignId": "uuid",
    "originalFilename": "Кватач-Ичл.png",
    "mimeType": "image/png",
    "sizeBytes": 2481024,
    "createdAt": "2026-07-20T12:00:00.000Z"
  }
}
```

The storage key is not required by the browser workflow and is not returned.

### Errors

| Status | Condition | Body |
|---|---|---|
| `400` | Missing/empty/unsupported/spoofed/oversized file | `{ "error": "…" }` |
| `403` | Not a campaign owner/DM | `{ "error": "Нет прав." }` |
| `502` | Object storage or data persistence rejected the upload | `{ "error": "…" }` |
| `503` | Server storage configuration is missing | `{ "error": "…" }` |

### Security contract

- Role and campaign membership are resolved server-side from the session.
- Client-supplied file type is checked against its signature.
- Storage credentials, storage key and internal error details are never
  returned to the browser.

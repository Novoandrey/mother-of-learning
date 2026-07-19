# Data Model: MEDIA-01

## Entity: `media_assets`

Самостоятельное изображение общей медиатеки кампании.

| Field | Meaning | Constraint |
|---|---|---|
| `id` | Стабильный ID ассета | UUID, primary key |
| `campaign_id` | Кампания-владелец | Required; cascade with campaign |
| `storage_key` | Непубличный идентификатор объекта | Required; globally unique |
| `original_filename` | Имя, показанное пользователю | Required; 1–255 characters |
| `mime_type` | Проверенный тип изображения | PNG, JPEG or WebP |
| `size_bytes` | Размер принятого файла | 1–12 MiB |
| `uploaded_by` | Пользователь, выполнивший загрузку | Nullable after user deletion |
| `created_at` | Время создания | Required; server timestamp |

## Relationships

- Campaign `1 → many` MediaAsset.
- User `1 → many` MediaAsset through `uploaded_by` for attribution only.
- Portrait/map/background usages are deliberately absent from MEDIA-01 and
  will reference `media_assets.id` in later specs.

## Invariants

1. `storage_key` starts with the server-owned campaign prefix; it is never
   derived from `original_filename`.
2. A row is visible only to members of `campaign_id`.
3. Browser clients have no direct insert/update/delete policy in MEDIA-01.
4. Every listed row points at a successfully accepted object.
5. Every new row is readable by all members of its campaign.

## Ordering

Library reads use `created_at DESC, id DESC`, giving deterministic newest-first
order when timestamps are equal.

## Deferred fields

Title, description, tags, prompt, source, checksum, dimensions, parent version,
soft-delete state and usage links are intentionally deferred to their owning
specs. Adding them now would create untested concepts outside the user journey.

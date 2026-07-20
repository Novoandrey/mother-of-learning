# Implementation Plan: MEDIA-05 — безопасное удаление ассета

**Branch**: `codex/media-safe-deletion` | **Date**: 2026-07-20 | **Spec**:
[spec.md](spec.md)
**Status**: Plan ready — awaiting Tasks

## Summary

Позволить участнику убрать ошибочно загруженный или больше не нужный asset из
медиатеки, не ломая уже назначенные изображения. Путь один: открыть asset →
увидеть реальные usages → подтвердить delete, только если их нет.

Универсальная защита — не новая доменная сущность, а контракт каждого usage:
его `media_asset_id` имеет FK `ON DELETE RESTRICT`. Portrait уже следует этому
контракту. UI читает один server-side список известных usages; новый map/token
consumer в будущем добавит в него свой resolver и такой же FK. Нет таблицы
`asset_usages`, polymorphic links, очереди удаления, soft-delete или массовой
очистки.

## Motivation-to-scope check

| Часть | Какая проблема решается | Намеренно не делаем |
|---|---|---|
| Usage summary на asset | Перед кнопкой ясно, почему нельзя удалить уже видимый портрет | Полный граф всех campaign nodes или отдельную модель графа |
| Database FK restrict | Гонка или прямой запрос не может сломать usage | Клиентскую проверку как единственный барьер |
| Одно подтверждённое удаление | Убирает случайный upload/мусор из библиотеки | Bulk delete, корзину, quota/retention |
| Адресная R2-cleanup | После удаления данные и файлы не остаются обычно навсегда | Durable cleanup job/table ради редкого storage failure |
| Activity error log при R2 failure | Оператор видит orphan для ручной повторной очистки | Новый lifecycle/state machine |

## Technical Design

### 1. One usage contract, no usage entity

Create `lib/server/media-usage.ts` with a narrow read model:

```ts
type MediaAssetUsage = {
  kind: 'portrait'
  nodeId: string
  nodeTitle: string
  count: number
}
```

Its first resolver is a query of `character_portraits.media_asset_id` joined to
`nodes`. It returns only member-safe node identity/title and does not expose an
R2 key. `media_asset_node_links` remains a separately labelled
`linkedNodes`/import context from MEDIA-03; it is not returned as a usage.

This module is the single place future consumers extend for human-readable
usage visibility. The database remains the source of truth: every future
table that consumes an asset must add `media_asset_id references media_assets
(id) on delete restrict`, then add its resolver here. No migration is needed
for MEDIA-05 because portrait's migration 142 already has this FK.

### 2. Read path and UI

Add a member-gated endpoint for one asset, e.g.
`GET /api/media/[id]/usage?campaignId=…`. It verifies membership, confirms the
asset belongs to the campaign, and returns `{ usages, linkedNodes }`.

On a media card, add a small destructive action. Opening it loads the compact
summary:

- at least one usage: list `«Портрет: <node title>»`, links to the node, and
  replace the confirmation control with an explanation that removal is blocked;
- no usages: show the existing import-linked nodes as context, then offer an
  explicit confirmation naming the asset;
- load/error: do not show a destructive confirmation until the server summary
  is known.

This fetch-on-open avoids adding portrait joins to every 48-item library page
and keeps the normal browsing DTO unchanged.

### 3. Delete path and race safety

Add `DELETE /api/media/[id]` (or equivalent server action) accepting only the
asset ID and campaign ID. It:

1. checks membership and loads the selected asset by both IDs;
2. obtains the same usage summary for a useful `409 ASSET_IN_USE` response;
3. reads the original and current variant storage keys internally;
4. deletes the `media_assets` row scoped by ID and campaign;
5. if PostgreSQL rejects it because a usage appeared concurrently, returns
   `409` and leaves the asset untouched;
6. after the row is gone, deletes the collected R2 objects using the existing
   signed delete helper; variants/jobs and provenance links are removed by
   their existing cascade FKs;
7. records an activity event on success, or the existing activity error log
   with the internal object identifiers on R2 cleanup failure.

The data deletion intentionally precedes R2 cleanup. It is the only ordering
that cannot leave a still-referenced database asset pointing to a file already
removed by a concurrent usage creation. A failed cleanup can at worst leave an
unreferenced storage orphan, not a broken player-visible image; no new queue or
state table is justified for that operator-only rare case.

### 4. Storage helper

Extend `lib/server/image-upload.ts` with a plural/addressed cleanup helper
that reuses its R2 configuration, signing and error logging. It accepts keys
only from server-selected metadata, deduplicates them and reports failed keys
internally. It never serializes a source/original key to the browser.

### 5. Tests and manual verification

- Unit-test the portrait usage resolver: none, one, several nodes, and no
  storage-key exposure; prove `media_asset_node_links` is context only.
- Route-test non-member, wrong campaign, in-use `409`, delete of an unused
  asset, and a concurrent FK conflict.
- Test that delete collects original + current variants, never another asset's
  keys, and logs rather than falsely reporting an R2 cleanup failure as a
  broken portrait.
- Component-test: used asset explains/link-lists consumers and has no enabled
  delete confirmation; unused asset needs explicit confirmation and vanishes
  after success/reload.
- Production quickstart: upload a disposable test image → inspect zero usages
  → delete → reload library; then assign another disposable image as a portrait
  → confirm its node is shown and deletion is refused. Inspect `/tg` after the
  refusal to ensure the portrait still renders its `preview`.

## Files

```text
.specify/specs/065-media-safe-deletion/
├── spec.md
├── plan.md
└── quickstart.md                         # created with Tasks

mat-ucheniya/
├── app/api/media/[id]/usage/route.ts     # member-gated summary
├── app/api/media/[id]/route.ts           # guarded one-asset deletion
├── components/media-library.tsx          # summary + confirmation UI
├── lib/server/media-usage.ts             # one extensible read-only resolver list
├── lib/server/image-upload.ts            # internal plural R2 cleanup helper
└── lib/__tests__/
    ├── media-usage.test.ts
    ├── media-delete-route.test.ts
    └── media-library.test.tsx
```

## Constitution Check

- **M1/M2 — PASS:** asset remains separate; real consumers retain their own
  foreign-key usage rather than being copied into a generic relation.
- **M3 — PASS:** delete removes an unreferenced immutable source; no editor or
  mutation of any original is introduced.
- **M4 — PASS:** membership remains the sole campaign boundary; no DM-only
  role is added.
- **M5 — PASS:** database links decide availability; R2 keys stay internal.
- **M6 — PASS:** existing R2 signing/error-log path is reused.
- **Scope — PASS:** no metadata/search, visibility, crop/token UX, bulk delete
  or lifecycle subsystem.

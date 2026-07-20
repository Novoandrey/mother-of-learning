# Implementation Plan: MEDIA-04 — выбор существующего ассета для портрета

**Branch**: `codex/media-asset-picker` | **Date**: 2026-07-20 | **Spec**:
[spec.md](spec.md)
**Status**: Plan ready — awaiting Tasks

## Summary

Replace new portrait writes based on arbitrary R2 keys with a same-campaign
`media_assets` reference. Retain the portrait carousel as the first concrete
asset usage; add an idempotent, dry-run-first legacy backfill; and have every
portrait consumer receive only `thumb`/`preview` through a member-gated
delivery endpoint. The existing portrait upload becomes a thin client of the
shared MEDIA-01 upload path, followed by the same asset-assignment action as
the picker.

No token editor, crop editor or new map interaction is included. The existing
map read model is nevertheless moved off portrait originals so it cannot become
a permanent bypass of the media contract.

## Technical Context

**Language**: TypeScript, SQL, Node 20
**Primary dependencies**: Next.js 16, React, Supabase, Vitest, existing
MEDIA-02 worker/R2 delivery
**Storage**: PostgreSQL (`media_assets`, `media_asset_variants`,
`character_portraits`), immutable R2 originals and WebP variants
**Testing**: Vitest unit/route/action tests; staging and production quickstart
**Target**: desktop web control surface and Telegram Mini App
**Performance**: one batched rendition request per loaded portrait surface;
never load an original for portrait display
**Constraints**: campaign membership is the read boundary; server actions use
admin writes only after explicit auth/ownership checks; existing portrait
order/primary/crop/IDs remain unchanged
**Scope**: one portrait consumer, 140 currently imported assets, future token
seams without creating token state

## Constitution Check

- **M1/M2 asset and usage separation — PASS.** `character_portraits` becomes
  an explicit portrait usage; future token configuration is not copied into it.
- **M3 immutable original — PASS.** Picker and backfill only reference assets;
  no source object is transformed or overwritten.
- **M4 campaign boundary — PASS.** Read and write queries verify that node and
  asset belong to the same campaign; no new DM-only policy is introduced.
- **M5/M6 storage and shared ingestion — PASS.** New portrait upload calls the
  shared media route; consumers receive a derived URL, never an original key.
- **A–F mobile-first — PASS.** `/tg` uses the same usage/data path and has an
  explicit no-original acceptance check before desktop completion.
- **Scope — PASS.** Cropper, token prototype UI, placed-token override,
  visibility, deletion and metadata/search remain later specs.

## Design

### 1. Schema and invariant

Migration **142** adds nullable `character_portraits.media_asset_id`, changes
the historical `r2_key` from required to nullable, adds an FK to
`media_assets(id)` with `ON DELETE RESTRICT`, an index for portrait reads and a
partial unique index on `(character_node_id, media_asset_id)` where the asset is
not null. This means the database, not only the picker UI, prevents duplicate
assignment of a single asset to one portrait carousel.

A trigger validates the cross-table invariant that the portrait's node and its
asset have the same `campaign_id`. The FK alone cannot express it. The trigger
must accept legacy rows where `media_asset_id` is null; it applies only on a
non-null assignment.

`r2_key` remains present but becomes nullable for historic data; new code never
writes it. It becomes a desktop-only fallback for an explicitly reported
unmapped legacy row. `/tg` and map-token rendering never use it.

Before adding the partial unique index, the migration verification query reports
any duplicate candidate `(character_node_id, matching media asset)` pairs. The
operator must resolve such legacy data rather than silently deleting or merging
portrait rows, because their IDs, order, primary status and crop are historic
usage data.

### 2. Backfill and deployment order

Add `scripts/backfill-portrait-media-assets.ts`, dry-run by default and
`--commit` for writes. It joins each portrait node's campaign to
`media_assets` by exact legacy `r2_key = storage_key`:

1. Print totals: already linked, exact matches, no match, ambiguous match and
   duplicate-usage conflicts.
2. In dry-run, write neither R2 nor database.
3. In commit mode, update only `media_asset_id` for exact one-to-one matches;
   it never changes portrait ID, `r2_key`, order, primary or crop fields.
4. Exit non-zero for ambiguous matches or conflicts; print stable portrait IDs
   for operator repair. Unmatched rows are retained as desktop fallback only.

Deployment applies migration 142 first, merges code, runs dry-run against the
target database, reviews the report, then runs commit. The public TG path is
enabled only after its mapped corpus has ready variants; unmapped rows render a
placeholder instead of an original.

### 3. Read and delivery contract

Extend portrait DTOs with `mediaAssetId`, keeping the legacy key private to the
desktop transition layer. Add a single member-gated bulk route, for example
`GET /api/media/renditions?campaignId=…&assetIds=…&rendition=thumb|preview`.
It delegates to a batched server rendition resolver that:

- checks membership once;
- queries only requested same-campaign assets and their current variants;
- returns `{ assetId, status, url?, width?, height? }`;
- constructs a public URL internally and never serializes source/original keys.

The existing `resolveMediaRendition` becomes the one-item wrapper or shares its
selection helper with the batched resolver; neither may expose source keys.
Client query functions return `mediaAssetId`, and a small portrait-rendition
client hook/cache resolves URLs once per displayed set. Compact rows use
`thumb`; carousel/detail and map-token art use `preview`. Pending, failed,
unknown and unmapped uses render a labelled placeholder, never legacy/original
image.

This updates `getCampaignCharacters`, `getMyCharacters`, `getWikiNodes`,
`getWikiNode` and `getCampaignMapData`, plus their `/tg` consumers. The map
change is read-only compatibility: it does not create token prototypes or
snapshot map-token artwork. A later scene spec will add those usage layers and
the explicit “apply prototype to placed tokens” action.

### 4. Write paths and picker

Replace `addPortrait(..., r2Key)` with an asset-ID action. It authorizes with
the current `canEditNode` contract, loads the node and asset with campaign IDs,
requires `variant_state = ready`, inserts one portrait usage, and treats a
unique conflict as idempotent success or a precise “already assigned” result.
The first successful usage keeps current primary behavior; existing crop,
caption and ordering behavior stays unchanged.

Create `MediaAssetPicker` from the paged MEDIA-02 query/UI primitives. It lists
thumbnail variants and status, allows selection only for ready assets, marks
assets already used by the node as unavailable, and submits only the asset ID.
It must work without hover-only controls and can load subsequent pages.

Retire the bespoke `/api/portraits/upload` R2 write path after moving
`PortraitManager` to call `/api/media/upload`, then immediately call the
asset-ID assignment action. This preserves the visible «Загрузить» shortcut,
but establishes MEDIA-01 as the sole ingestion route. Existing activity logs
record upload and assignment separately.

### 5. Future token boundary

No migration adds `token_prototype` in MEDIA-04. The saved contract is:

```text
media_assets (immutable source + variants)
   ├─ character_portraits (portrait usage: asset ID, primary/order, portrait crop)
   └─ future token_prototypes (token usage: asset ID, token crop/config)
          └─ future map_tokens (placed snapshot or explicit override)
```

`map_tokens` must not gain a hidden dependency on portrait `r2_key` or portrait
crop. A later spec decides whether a new placed token snapshots the prototype
or dynamically links to it, and supplies an explicit mass-update operation;
there is no implicit update of existing scene history.

## Files

```text
.specify/specs/064-media-asset-picker/
├── spec.md
├── plan.md
└── quickstart.md                         # created in Tasks/Implement phase

mat-ucheniya/
├── supabase/migrations/142_portrait_media_assets.sql
├── scripts/backfill-portrait-media-assets.ts
├── app/actions/portraits.ts
├── app/api/media/renditions/route.ts
├── app/api/portraits/upload/route.ts      # retire after shared-upload cutover
├── components/media-asset-picker.tsx
├── components/portrait-manager.tsx
├── lib/media.ts
├── lib/portraits.ts
├── lib/server/media-renditions.ts
├── lib/queries/campaign-characters.ts
├── lib/queries/my-characters.ts
├── lib/queries/wiki-tg.ts
├── lib/queries/maps.ts
├── app/tg/_components/primitives.tsx
├── app/tg/_components/wiki-app.tsx
└── lib/__tests__/
    ├── portrait-media-usage.test.ts
    ├── media-renditions-route.test.ts
    ├── portrait-actions.test.ts
    └── portrait-backfill.test.ts
```

## Verification

1. Unit-test same-campaign validation, duplicate idempotency, backfill
   classification and no-mutation dry-run.
2. Route-test outsider, wrong-campaign and original-key non-disclosure; test
   ready, processing and failed rendition states.
3. Component-test picker selection, already-assigned state and touch-accessible
   error/status UI.
4. Stage: select a legacy imported asset for an NPC, reload desktop and `/tg`,
   inspect browser requests for thumb/preview only, then attempt duplicate and
   wrong-campaign assignments.
5. Production: migration → reviewed dry-run → commit backfill → one participant
   assigns an asset and one player verifies `/tg`; record mapped/unmapped
   counts, variant status and no-original network evidence in quickstart.

## Complexity Tracking

No constitution violation. The batched rendition endpoint is deliberate: it
keeps R2/source-key mechanics server-side and avoids a per-card authenticated
request waterfall in Mini App lists.

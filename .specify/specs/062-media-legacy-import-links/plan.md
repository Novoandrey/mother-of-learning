# Implementation Plan: MEDIA-03 — legacy-импорт и связи с нодами

**Branch**: `codex/media-optimization` | **Date**: 2026-07-20 | **Spec**:
[spec.md](spec.md)

## Summary

Add a member-readable asset↔node relation, project it into paged media cards
and add a dry-run-first importer. The importer reuses the 138 existing portrait
R2 keys and writes only one new R2 original for Nikita's confirmed map image.

## Technical Context

**Language**: TypeScript, SQL, Node 20
**Dependencies**: Next.js 16, Supabase, aws4fetch, sharp worker
**Storage**: production PostgreSQL + existing public R2 bucket
**Testing**: Vitest, direct production smoke after merge/autodeploy
**Target**: `theloopers.org` production; direct SSH/psql for migration only
**Constraint**: no browser Studio and no manual Dokploy deploy; main merge uses
the existing autodeploy.

## Design

1. Migration 141 creates `media_asset_node_links` with a campaign-consistency
   trigger, membership RLS and indexes. `media_assets.storage_key` remains the
   immutable original and is not copied into portrait tables.
2. The media page query returns only safe node id/title/type projections; the
   client links them to `/c/[slug]/catalog/[id]`.
3. `scripts/import-legacy-media.ts` builds a deterministic manifest from the
   local portrait directory, existing portrait rows and a saved Nikita-world
   JSON. It supports dry run, uses source identity to avoid duplicates, and
   queues variants through normal asset insertion.
4. Production import uses the confirmed manifest: existing portrait R2 objects
   are metadata-only imports; the one external map is fetched once and stored
   under a stable R2 key before its asset record is inserted.

## Constitution Check

Pass: assets remain independent; links use existing campaign nodes rather than
creating a parallel content model; one finished DM path is verified on prod.

## Files

```text
mat-ucheniya/
├── supabase/migrations/141_media_asset_node_links.sql
├── scripts/import-legacy-media.ts
├── lib/media.ts
├── lib/queries/media.ts
├── components/media-library.tsx
└── lib/__tests__/media-legacy-import.test.ts
```

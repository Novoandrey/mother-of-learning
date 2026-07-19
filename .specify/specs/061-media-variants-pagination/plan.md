# Implementation Plan: Медиатека — варианты, выдача и масштаб

**Branch**: `codex/media-optimization` | **Date**: 2026-07-20 | **Spec**: [spec.md](spec.md)
**Status**: Planned — ready for tasks
**Input**: Feature specification from `.specify/specs/061-media-variants-pagination/spec.md`

## Summary

Сохранить MEDIA-01 как ingestion оригинала, добавить durable очередь обработки
и отдельный `sharp` worker, а затем переключить медиатеку на cursor-paginated
список thumbnail-вариантов. Общий helper возвращает consumer-ам только
запрошенный готовый rendition (`thumb`, `preview`, `scene`), поэтому будущая
сцена не загружает каталог или исходник.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, Next.js 16.2, Node 20
**Primary Dependencies**: existing Next/Supabase/R2 stack; add `sharp` only to
the worker package/image
**Storage**: self-hosted PostgreSQL metadata/jobs; Cloudflare R2 originals and
variants; Cloudflare custom-domain CDN cache
**Testing**: Vitest query/helper/route tests; worker integration test against
R2-compatible test double; TypeScript, ESLint, production build; manual
production quickstart
**Target Platform**: existing Hetzner/Dokploy web application plus a distinct
Dokploy worker application built from the same `main` revision
**Project Type**: full-stack web app + background worker
**Performance Goals**: 48 metadata rows per page; grid never requests originals
after a thumb is ready; a consumer resolves one rendition without list loading
**Constraints**: keep MEDIA-01 originals immutable; R2 credentials server-only;
current public-read custom domain; one worker deployment must not block web app
**Scale/Scope**: hundreds to low thousands of assets per campaign; no tiles,
semantic search, manual crop editor, deletion, category assignment or consumer
picker in this slice

## Constitution Check

### Project constitution

- **Data correctness first**: PASS — original, variant metadata and job lifecycle
  are transactional before UI changes; job claim is atomic.
- **Desktop UX before mobile**: PASS — campaign media page is desktop-first;
  no `/tg` surface is added.
- **Simple stack**: PASS with a documented exception — a worker is necessary for
  durable CPU-bound image work, but it reuses PostgreSQL, R2, Dokploy and the
  repository rather than introducing a queue vendor.
- **Reusable patterns**: PASS — MEDIA-01 validation and R2 signing remain the
  sole ingestion mechanism; rendition helper is shared by future consumers.
- **Server auth gating**: PASS — member checks remain at list/rendition edges;
  worker only uses service credentials and has no browser route.

### Media epic constitution

- **M1/M2**: PASS — variants belong to an asset, not to a portrait/map/scene.
- **M3**: PASS — source `storage_key` is immutable; only derived keys are added.
- **M4**: PASS — member boundary remains on list and rendition resolution.
- **M5**: PASS — R2 keys are represented by database rows and job state.
- **M6**: PASS — upload validation is not forked.
- **M7**: PASS — quickstart has one production P1 journey from upload through
  processing, paging and reload.

## Proposed Architecture

```text
browser upload
  → existing /api/media/upload
  → original object in R2 + media_assets row + queued job (one transaction)
  → media-worker claims one job atomically
  → sharp produces WebP thumb / preview / scene
  → R2 immutable rendition objects + media_asset_variants rows
  → grid API returns page metadata + thumb URL only
  → future scene calls resolveMediaRendition(assetId, 'scene')
```

### Data and storage decisions

1. Preserve `media_assets.storage_key` as the source/original key; do not rename
   it or rewrite R2 originals from MEDIA-01.
2. Add `media_asset_variants` keyed by `(asset_id, rendition, version)` and
   `media_variant_jobs` keyed by asset/version. See [data-model.md](data-model.md).
3. Variant keys include asset UUID and version, for example
   `media/<campaign>/<asset>/v1/thumb.webp`; write cache headers appropriate for
   immutable content.
4. Add width/height and variant state to metadata so no browser needs to inspect
   original bytes.

### Worker and deployment decisions

1. New `media-worker/` process owns claim → download → transform → upload →
   complete/fail. It uses a `node:20-bookworm-slim` image, avoiding native
   `sharp` uncertainty in the current Alpine web runner.
2. Claiming uses a Postgres RPC/function with `FOR UPDATE SKIP LOCKED`, exposed
   only to the service role; completion checks the lease/worker id.
3. Create a second Dokploy application with separate worker build/start
   command, health endpoint/logs and the same server-side R2/Supabase env keys.
4. Extend the production deploy workflow so the worker is deployed from the
   same merge as the web app. Operator supplies a separate app ID secret; no
   secret value is stored in Git.
5. Before production migration, run the `sharp` Docker spike from research R2;
   no schema/backfill rollout begins until it passes.

### Reading and consumer decisions

1. `GET /api/media` (or server query initially) accepts an opaque cursor and
   returns at most 48 items plus `nextCursor`.
2. `MediaLibrary` starts with the first page and client-loads the next cursor;
   it renders `thumb` URLs and explicit pending/failed cards.
3. A server-only rendition resolver returns `{ status, url }` only for a member
   and only for a named ready rendition. Consumers must not receive a list
   implicitly or substitute the original when `scene` is pending.

## Project Structure

```text
.specify/specs/061-media-variants-pagination/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/media-delivery.md
├── quickstart.md
└── tasks.md

mat-ucheniya/
├── app/api/media/route.ts                     # cursor-paged list (new)
├── app/api/media/[id]/retry-variants/route.ts # DM retry (new)
├── components/media-library.tsx               # load-more + variant states
├── lib/media.ts                               # rendition types and URLs
├── lib/queries/media.ts                       # keyset paging
├── lib/server/image-upload.ts                 # enqueue after original write
├── lib/server/media-renditions.ts             # member-gated resolver (new)
├── media-worker/                              # worker entrypoint, transform + R2 IO (new)
├── Dockerfile.media-worker                    # Debian-based sharp runner (new)
└── supabase/migrations/140_media_variants.sql # rows, jobs, claim RPC (new)
```

## Rollout and Backfill

1. Deploy schema and worker before switching the grid to rendition-only mode.
2. Existing assets create jobs in bounded batches; job uniqueness makes reruns
   harmless. Log counts and failed IDs without source bytes.
3. New uploads enqueue transactionally only after original metadata writes.
4. First release may show a controlled `processing` state for legacy assets;
   switch existing cards to thumb-only after the campaign backfill completes.
5. Rollback leaves originals and variant rows intact; web UI can temporarily
   use the existing original URL path while worker is repaired.

## Test Strategy

- Unit-test cursor encode/decode, keyset boundaries, rendition selection and
  state mapping.
- Route-test campaign membership, 48-item limit, invalid/foreign cursor,
  owner/DM retry and player denial.
- Worker-test success, duplicate claim, restart lease, invalid source and
  idempotent upload/complete behavior.
- Add one fixture campaign with >100 lightweight source assets for page tests;
  production evidence uses the actual campaign without generating a bulk of
  permanent test data.
- Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`; build
  `Dockerfile.media-worker`; then run [quickstart.md](quickstart.md) on
  production.

## Open Operator Inputs (not blockers for planning)

- Confirm the Dokploy app name/ID and resource limit for `media-worker`.
- Confirm CDN cache rule for versioned `media/*/v*/**` renditions and document
  the rollout/purge path.
- Choose whether backfill starts immediately after MEDIA-02 or only together
  with the first imported image pack; code supports both.

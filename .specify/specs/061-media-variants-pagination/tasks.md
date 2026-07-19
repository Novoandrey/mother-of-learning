# Tasks: MEDIA-02 — варианты, выдача и масштаб

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/media-delivery.md](contracts/media-delivery.md),
[quickstart.md](quickstart.md)

## Phase 1: Worker proof and foundation

- [ ] T001 Build the `sharp` Docker spike for PNG/JPEG/WebP at the current 12 MiB
  limit; record memory and successful output in `research.md`.
- [ ] T002 Add migration 140 for variant metadata, `media_asset_variants`,
  `media_variant_jobs`, indexes, constraints and atomic claim/complete/retry RPCs.
- [ ] T003 [P] Add unit tests for rendition states, immutable versioned key
  construction and opaque cursor encoding in `mat-ucheniya/lib/__tests__/`.
- [ ] T004 [P] Add worker job-claim/recovery integration tests, including two
  competing workers and an expired lease.
- [ ] T005 Add server-only types and metadata/query helpers in
  `mat-ucheniya/lib/media.ts` and `mat-ucheniya/lib/queries/media.ts`.

## Phase 2: Durable processing path

- [ ] T006 Update the existing MEDIA-01 upload transaction to enqueue exactly
  one current-version job only after original metadata persistence.
- [ ] T007 Implement `media-worker` source download, `sharp` transformations,
  R2 uploads with immutable cache headers, and transactional job completion.
- [ ] T008 Implement retry/backoff/error-code handling, idempotent existing-key
  checks and structured worker logs without source bytes or credentials.
- [ ] T009 Add `Dockerfile.media-worker`, health/logging contract and deployment
  documentation for the separate Dokploy application.
- [ ] T010 Extend the main-merge deployment workflow to trigger both web and
  worker applications; document the new operator-secret/app-ID setup.

## Phase 3: User Story 1 — Paged thumbnail library (P1)

- [ ] T011 [US1] Add route/query tests for newest-first 48-item keyset pages,
  invalid cursors, same-timestamp boundary and campaign isolation.
- [ ] T012 [US1] Implement the member-gated paged media endpoint/query and
  thumbnail projection; do not expose original keys.
- [ ] T013 [US1] Update `MediaLibrary` with appended load-more paging,
  deterministic pending/failed cards and thumbnail-only `<img>` URLs.
- [ ] T014 [US1] Add an accessible loading/error/retry UI state without changing
  the future category-filter semantics.
- [ ] T015 [US1] Verify a local fixture with >100 assets and record that grid
  traffic never requests source objects after variants are ready.

## Phase 4: User Story 2 — Processing feedback and recovery (P1)

- [ ] T016 [US2] Add campaign-member `retry-variants` route tests and implementation.
- [ ] T017 [US2] Wire upload and page refresh/polling so queued → ready or failed
  is visible after reload and without re-uploading the original.
- [ ] T018 [US2] Implement idempotent bounded backfill for existing MEDIA-01
  rows, dry-run mode, progress reporting and resume verification.

## Phase 5: User Story 3 — Single rendition contract (P2)

- [ ] T019 [US3] Test and implement member-gated `resolveMediaRendition` for
  `thumb`, `preview`, `scene`, pending and foreign-asset cases.
- [ ] T020 [US3] Add one minimal test consumer proving a future scene can obtain
  only a scene URL without querying the media library.

## Phase 6: Production verification and handoff

- [ ] T021 Apply migration and configure/deploy the separate worker on staging;
  run the backfill rehearsal and rollback check.
- [ ] T022 Deploy the worker and web revision together to production; configure
  CDN cache rule for immutable rendition keys.
- [ ] T023 Run every journey in `quickstart.md` on production and record evidence.
- [ ] T024 Re-check project/media constitutions, mark completed tasks, and update
  the media epic map/roadmap status.

## Dependencies & delivery order

`T001` gates schema/worker work. `T002–T010` create the foundation. US1 and US2
share it and can ship together as the first production release; US3 is a small
contract addition after the rendition rows exist. Backfill runs only after a
healthy worker is observable. MEDIA-03 picker and MEDIA-07 bulk import remain
blocked on this spec's production quickstart.

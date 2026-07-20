# Tasks: MEDIA-04 — выбор существующего ассета для портрета

**Input**: [spec.md](spec.md), [plan.md](plan.md)
**Status**: Implement — authorised for full production delivery

## Foundation

- [ ] T001 Add migration 142: nullable `media_asset_id`, nullable legacy
  `r2_key`, same-campaign trigger, duplicate guard and verification queries.
- [ ] T002 Add dry-run-first portrait-media backfill script and its tests.
- [ ] T003 Extend shared portrait/media types and add batched server rendition
  resolver with no-original DTO tests.
- [ ] T004 Add member-gated `/api/media/renditions` route and contract tests.

## User Story 1 — Assign an existing asset (P1)

- [ ] T005 Replace key-based portrait creation with same-campaign asset-ID
  assignment, including duplicate-safe server action tests.
- [ ] T006 Build the paged, touch-accessible `MediaAssetPicker` and connect it
  to `PortraitManager`; retain upload as an ingestion shortcut through
  `/api/media/upload`.
- [ ] T007 Retire the bespoke portrait upload route once no consumer writes an
  R2 key directly; update affected tests.

## User Story 2 — Safe portrait reads in Telegram (P1)

- [ ] T008 Project `mediaAssetId` through character/wiki/map read models and
  replace portrait-original URL construction with rendition resolution.
- [ ] T009 Update TG primitives, wiki carousel and desktop/map portrait
  consumers for thumb/preview states and placeholders.
- [ ] T010 Add regression tests for ready/pending/failed/unmapped reads and
  confirm no original storage key enters TG DTOs.

## Release

- [ ] T011 Run lint, typecheck, focussed and full tests, then build.
- [ ] T012 Apply migration 142 directly to production; run and review backfill
  dry-run, then commit backfill.
- [ ] T013 Push/merge production deployment, run production quickstart and
  record the evidence in `quickstart.md`; mark spec/tasks complete.

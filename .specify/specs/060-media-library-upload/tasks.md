# Tasks: Медиатека — загрузка и библиотека

**Input**: Design documents from `.specify/specs/060-media-library-upload/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/upload.md`, `quickstart.md`

## Phase 1: Data foundation

- [x] T001 [US1] Create `media_assets` schema, index, RLS membership policy and verification in `mat-ucheniya/supabase/migrations/139_media_assets.sql`

## Phase 2: Shared media read model

- [x] T002 [P] [US1] Add failing tests for URL construction, filename normalization and manager-role checks in `mat-ucheniya/lib/__tests__/media.test.ts`
- [x] T003 [US1] Implement media DTO and pure helpers in `mat-ucheniya/lib/media.ts`
- [x] T004 [US1] Implement newest-first campaign query in `mat-ucheniya/lib/queries/media.ts`

## Phase 3: Protected upload

- [x] T005 [US1] Extend `mat-ucheniya/lib/server/image-upload.ts` with best-effort object deletion for failed metadata persistence
- [x] T006 [US1] Implement and contract-test owner/DM upload, validation, persistence, compensation and activity logging in `mat-ucheniya/app/api/media/upload/route.ts` and `mat-ucheniya/lib/__tests__/media-upload-route.test.ts`

## Phase 4: User Story 1 — upload and find after reload

**Goal**: owner/DM uploads one image and every campaign member sees it after reload.  
**Independent Test**: follow the primary, failure and role journeys in `quickstart.md`.

- [x] T007 [P] [US1] Build the upload interaction and error/success states in `mat-ucheniya/components/media-upload-form.tsx`
- [x] T008 [P] [US1] Build empty and populated media grids in `mat-ucheniya/components/media-library.tsx`
- [x] T009 [US1] Wire campaign auth, RLS query, role-aware controls and grid in `mat-ucheniya/app/c/[slug]/media/page.tsx`
- [x] T010 [US1] Add the campaign Media navigation entry in `mat-ucheniya/components/nav-tabs.tsx`
- [x] T011 [US1] Expose the canonical public asset base at container build time in `mat-ucheniya/Dockerfile`, retaining the portrait base as a migration fallback

## Phase 5: Verification and handoff

- [x] T012 [US1] Run `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` from `mat-ucheniya/`
- [ ] T013 [US1] Execute the production quickstart and record database, deployment and role-path evidence in `.specify/specs/060-media-library-upload/quickstart.md`
- [ ] T014 [US1] Re-check project and media-epic constitutions, then mark completed tasks in `.specify/specs/060-media-library-upload/tasks.md`

## Dependencies & Execution Order

- T001 establishes the storage contract.
- T002 must fail before T003; T003 then unblocks T004, T006 and T008.
- T005 precedes T006 so partial uploads can be compensated.
- T007 and T008 may proceed in parallel after T003.
- T009 depends on T004, T007 and T008; T010 is independent UI wiring.
- T012–T014 run after the full user path exists.

## Implementation Strategy

Implement only User Story 1. Stop after its automated gate and reachable
quickstart checks; do not begin MEDIA-02 unless MEDIA-01 is demonstrably complete.

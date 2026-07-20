# Tasks: MEDIA-05 — безопасное удаление ассета

**Input**: [spec.md](spec.md), [plan.md](plan.md)
**Status**: Implement — production verification pending

## Phase 1 — shared guard

- [x] T001 Add `MediaAssetUsage` DTO and the portrait resolver in `mat-ucheniya/lib/server/media-usage.ts`; preserve `media_asset_node_links` as non-blocking context.
- [x] T002 [P] Add tests for no usage, portrait usage grouping and no storage-key disclosure in `mat-ucheniya/lib/__tests__/media-usage.test.ts`.
- [x] T003 Add internal plural R2 cleanup to `mat-ucheniya/lib/server/image-upload.ts`, reusing existing signed deletion and error logging.

## Phase 2 — User Story 1: see why deletion is blocked (P1)

**Goal**: A campaign member sees portrait consumers before any destructive action.

- [x] T004 [US1] Add member-gated `GET /api/media/[id]/usage` in `mat-ucheniya/app/api/media/[id]/usage/route.ts`.
- [x] T005 [P] [US1] Add route tests for member, outsider, wrong campaign and safe response in `mat-ucheniya/lib/__tests__/media-usage-route.test.ts`.
- [x] T006 [US1] Add on-demand usage summary and blocked explanation/node links to `mat-ucheniya/components/media-library.tsx`.

## Phase 3 — User Story 2: delete an unused asset (P1)

**Goal**: A member confirms deletion of one unreferenced asset; an in-use asset remains intact even in a race.

- [x] T007 [US2] Add member-gated `DELETE /api/media/[id]` in `mat-ucheniya/app/api/media/[id]/route.ts`; use the existing FK restrict guard and clean up only server-read R2 keys.
- [x] T008 [P] [US2] Add delete-route tests for unauthorised, in-use `409`, successful deletion, FK race and R2 cleanup failure in `mat-ucheniya/lib/__tests__/media-delete-route.test.ts`.
- [x] T009 [US2] Add explicit confirmation, success removal and reload-safe errors to `mat-ucheniya/components/media-library.tsx`.

## Phase 4 — verification

- [x] T010 Run targeted Vitest tests and `npm run typecheck` from `mat-ucheniya/`.
- [x] T011 Write production manual quickstart in `.specify/specs/065-media-safe-deletion/quickstart.md`: disposable unused asset deletion and refusal after portrait assignment, including `/tg` check.

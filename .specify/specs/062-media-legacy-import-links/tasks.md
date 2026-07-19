# Tasks: MEDIA-03 — legacy-импорт и связи с нодами

1. [x] Inventory local art, existing portrait R2 rows and Nikita Redis world.
2. [x] Add migration 141: asset↔node link, RLS, campaign consistency and source
   identity for idempotent imports.
3. [x] Add unit tests for legacy manifest matching and link projection.
4. [x] Project node links into paged media query and make card links accessible.
5. [x] Add dry-run-first importer; reuse portrait keys and download only the
   confirmed Nikita map.
6. [x] Run dry-run against production metadata; review 138 portrait mappings +
   one unlinked map.
7. [x] Apply migrations directly to production, merge to `main`, let autodeploy
   run, then run commit import.
8. [x] Verify a portrait → node path, map card, idempotent second run and
   thumbnail-only network traffic; mark the spec complete.

# Tasks: portrait cutout variants

1. [x] Verify the local non-generative alpha-only pipeline and migration 143 handoff.
2. [x] Add migration 144 for `cutout:image/png`, preserving all existing variant checks.
3. [x] Add rendition type/route support and PC map projection with preview fallback.
4. [x] Add dry-run-first, tag-filtered generator which reuses one Python batch session.
5. [x] Add unit tests for rendition selection, map fallback and generator plan filters.
6. [ ] Run local quality checks and production migration/deploy smoke.
7. [ ] Review production dry-run; only then request/perform explicit approved `--commit` generation.

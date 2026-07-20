# Chat 99 — MEDIA-04 production handoff, 2026-07-20

## Done

- PR #61 merged to `main`; GitHub Quality gate passed.
- Production migration 142: `character_portraits.media_asset_id`, same-campaign
  trigger, FK and one-asset-per-node uniqueness.
- Production backfill linked 138 legacy portrait usages and switched their
  compatibility key to ready `preview`; no R2 objects were created.
- 31 legacy portrait rows had no matching library asset. They remain intact for
  desktop transition, but `/tg` and map reads render a placeholder rather than
  request an original.

## Start next session

1. Run `bash scripts/dev/status.sh`, read this handoff and
   `.specify/epics/media-library/constitution.md`.
2. Choose the next small media path: **MEDIA-05 safe deletion** (usage graph)
   or **MEDIA-06 metadata/search**. Do not start MEDIA-07 editor/token UX
   without a fresh Specify: it needs independent portrait/token crop configs.
3. Preserve unrelated local craft edits in `ledger-app.tsx` and
   `scribe-screen.tsx`.

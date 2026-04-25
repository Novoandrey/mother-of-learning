# Chat 48 — spec-012 T040 + Phase 12 close-out, 2026-04-25

## Контекст (откуда пришли)

Chat 47 закончил spec-012 Phases 1-11 implement, но оставил два хвоста:
- T040 (badge hydration в ledger — пробросить `autogenSourceTitles` map
  из server в client).
- Phase 12 close-out (T041-T047: lint / test / build / manual /
  NEXT.md / chatlog / commit).

Пользователь стартовал чат с `Spec012, t040, continue`.

## Что сделано

- **T040** — autogen badge hydration:
  - `components/ledger-list.tsx`: после `getLedgerPage` собирается
    `autogenSourceIds` (`Set` из `r.autogen?.sourceNodeId`), параллельно
    с PCs/loops fires третий `nodes.select('id, title').in('id', …)`
    запрос. Map `autogenSourceTitles` пробрасывается в client новым
    проп'ом.
  - `components/ledger-list-client.tsx`: принимает `autogenSourceTitles`,
    в `rows.map` гидрирует `{wizardKey, sourceTitle}` per row,
    fallback на `''` для appended страниц (`loadLedgerPage` не
    возвращает свежую title-карту).
  - `components/autogen-badge-client.tsx`: дропает ` · ` separator и
    хвост когда `sourceTitle` пустой — tooltip остаётся чистым для
    appended рядов.

- **T041** lint — было 9 warnings, стало 0:
  - `lib/starter-setup-affected.ts`: убрал unused `DesiredRow`,
    `ExistingAutogenRow` imports.
  - `lib/seeds/pc-starter-config.ts`: убрал лишний
    `eslint-disable-next-line no-console` (правило где-то выше
    ослабили).
  - `app/c/[slug]/electives/electives-client.tsx`: удалил
    неиспользуемый `pcMap` useMemo.
  - `app/c/[slug]/sessions/new/page.tsx`: убрал unused `searchParams`
    из destructuring.
  - `scripts/import-electives.ts`: убрал unused `SupabaseClient`
    type import.
  - `components/chronicles.tsx`, `create-edge-form.tsx`,
    `markdown-content.tsx`: удалил unused `campaignSlug` prop +
    обновил 4 caller-сайта в `node-detail.tsx` и
    `app/c/[slug]/sessions/[id]/page.tsx`.

- **T042** vitest — 135 tests / 10 files / all green. Pre-existing
  TS errors из NEXT.md (`starter-setup-diff.test.ts(5,3)`,
  `starter-setup-affected.test.ts(275,11)`) больше не воспроизводятся
  — починились между чатами или были спурийные.

- **T043** `next build` — turbopack compiled in 31.2s, TypeScript
  checked in 21.7s clean, 10/10 static pages, все маршруты
  собрались (включая новый spec-012 `/accounting/starter-setup`).

- **T045** обновил `NEXT.md`:
  - Spec-012 переехал из «без T040 / без close-out» формулировки
    в полноценное «в проде». Описание расширено deталями про T040
    hydration path.
  - «Следующий приоритет» теперь spec-013 (encounter loot — 5й
    автоген-визард, переиспользует `autogen_*` без миграций) и
    spec-016 (Сборы, есть только spec.md).
  - T044 manual walkthrough оставлен как параллельный долг для
    пользователя (Claude автоматизировать не может).

- **T046** этот файл.

## Миграции

Нет. Spec-012 закончил всё на 037+038 (chat 46-47).

## Коммиты

- `809cbe6` `spec-012 T040: hydrate autogen prop with source titles`
- `471c4fe` `spec-012 T041: lint clean (0 warnings)`
- `e5be579` `spec-012 T042+T043: vitest + next build pass`
- `<TBD>` `spec-012 T045+T046: NEXT.md + chatlog for chat 48`
  (финальный коммит этого чата, T047)

## Действия пользователю (после чата)

- [x] задеплоить — авто через push в main
- [ ] **T044 manual walkthrough** — пройти 10 Acceptance Scenarios
  из `.specify/specs/012-loop-start-setup/spec.md` в проде:
  - US1.1–US1.6 (apply, banner, misclick-safe create)
  - US2.1–US2.3 (loan flag off — Lex case)
  - US3.1–US3.8 (reapply, confirmation dialog, hand-edit,
    hand-delete, empty-diff reapply)
  - US4 (new PC mid-loop, reapply catches them up)
  - US5 (starter items including unique narrative items)
  - US6 (autogen badge + filter chip)
  - US7 (loop delete cascades autogen rows)
- [ ] если T044 находит баги — отметить в `backlog.md` как BUG-NNN

## Что помнить следующему чату

- Spec-012 в проде. `autogen_wizard_key/source_node_id/hand_touched`
  + триггеры с `spec012.applying` guard'ом — shared infrastructure
  для будущих автоген-визардов (spec-013 encounter loot etc.) без
  миграций.
- Forward-compat: `InventoryGrid` keyFn, `WalletBlock` actorNodeId,
  ledger autogen filter — всё готово принимать новые wizard keys
  без структурных изменений.
- Test coverage spec-012 helpers: `starter-setup-{resolver,diff,
  affected,validation}.ts` — 55+ unit-тестов, плюс старые 80 →
  135 в сумме.
- Если в proxy / pre-existing файлах вдруг всплывут старые
  `campaignSlug` props — каскадно почистить через `node-detail.tsx`
  и `sessions/[id]/page.tsx` callers.

# Tasks: Starter Setup Overview

**Spec**: `.specify/specs/019-starter-setup-overview/spec.md`
**Plan**: `.specify/specs/019-starter-setup-overview/plan.md`
**Created**: 2026-04-27
**Status**: Draft

> Working mode: pick the first unchecked `[ ]`, do it, mark `[x]`,
> stop, wait for confirmation. `[P]` = parallelisable. Spec-019
> compact — задач 10, всё P1, миграций 0.

---

- [ ] **T001 [P1] [P]** Read-query: `getCampaignLoopSetupStatuses(campaignId)`
  + type `LoopSetupStatusEntry` в `lib/starter-setup.ts`. Под капотом
  `getLoops()` + одна batched `IN`-выборка по
  `transactions.autogen_source_node_id` ∈ loopIds, фильтр по
  `SPEC_012_WIZARD_KEYS`. Возвращает `[{ loopId, loopNumber, hasAutogenRows }]`
  для всех петель кампании.
  *(file: `mat-ucheniya/lib/starter-setup.ts`)*

- [ ] **T002 [P1] [P]** `<StarterSetupTabs>` client component —
  калька `<StashPageTabs>`. Local state `TabKey = 'campaign' | 'pcs'`,
  defaultTab=`campaign`, both panels mounted (CSS-only switch). Бэдж
  `pcCount` на табе «Персонажи».
  *(file: `mat-ucheniya/components/starter-setup-tabs.tsx`)*

- [ ] **T003 [P1] [P]** `<PcStarterOverviewList>` server component.
  Загружает `getPcStarterConfigsForCampaign(campaignId)`, сортирует по
  `pcTitle` (RU collation), мапит в стопку карточек, каждая —
  header (PC title + link на /catalog/[pcId]) + `<PcStarterConfigBlock pcId mode="dm" />`.
  Empty state если 0 PC.
  *(file: `mat-ucheniya/components/pc-starter-overview-list.tsx`)*

- [ ] **T004 [P1]** `<StarterSetupApplySection>` server component
  (depends on T001). Читает `getCampaignLoopSetupStatuses` +
  `getCurrentLoop` параллельно. Edge cases: 0 loops → dashed-info
  с link на /loops; иначе primary row (current или latest) +
  optional `<UnappliedBacklog>` для прошлых неприменённых петель.
  Реюзит `<ApplyStarterSetupButtonClient>` без изменений.
  *(file: `mat-ucheniya/components/starter-setup-apply-section.tsx`)*

- [ ] **T005 [P1]** Rewrite `app/c/[slug]/accounting/starter-setup/page.tsx`:
  apply section сверху + tabs снизу. Извлечь текущие три card'ы
  campaign-level (loan / stash coins / stash items) во **внутренний**
  helper `<CampaignSetupCards>` в том же файле — пихнуть как
  `campaignContent` в табы. `<PcStarterOverviewList>` — как
  `pcsContent`. PC count считаем через `getCampaignPCs(campaignId).length`
  (already used elsewhere). Auth + DM-gate без изменений.
  *(file: `mat-ucheniya/app/c/[slug]/accounting/starter-setup/page.tsx`)*

- [ ] **T006 [P1] [P]** Replace `<LoopStartSetupBanner>` on
  `/loops`: убрать импорт + render, вставить inline-note (DM-only)
  «Стартовый сетап настраивается и применяется в [Бухгалтерии]»
  с link'ом на `/c/[slug]/accounting/starter-setup`.
  *(file: `mat-ucheniya/app/c/[slug]/loops/page.tsx`)*

- [ ] **T007 [P1]** Delete `loop-start-setup-banner.tsx` после
  T006. Pre-check: `rg "LoopStartSetupBanner|loop-start-setup-banner"
  mat-ucheniya/` должен показать ноль использований за пределами
  самого файла. Если что-то нашлось — fix перед удалением.
  *(file: `mat-ucheniya/components/loop-start-setup-banner.tsx`)*

- [ ] **T008 [P1]** Smoke walkthrough (manual, DM-роль на
  mat-ucheniya): открыть `/accounting/starter-setup`, проверить
  apply-section (current loop status корректен), переключение табов
  «Кампания / Персонажи», edit per-PC coins/items/loan flag,
  cross-check на странице PC, apply current loop (modal hand-touched
  если есть), re-apply, /loops info-line. Player flow: прямой URL →
  redirect.

- [ ] **T009 [P1]** Lint + next build clean: `cd mat-ucheniya && npm run lint && npm run build`.
  Vitest должен пройти без regressions (новых тестов не добавляем).

- [ ] **T010 [P1]** Close-out: bump version в
  `mat-ucheniya/package.json` (0.7.0 → 0.7.1), обновить NEXT.md
  («В проде сейчас» — добавить spec-019; «Следующий приоритет» —
  spec-020 карта), backlog.md (если новые идеи возникли),
  chatlog `2026-04-27-chatNN-spec019-implement.md`, commit, push.

---

## Out of scope reminders

- ❌ Bulk operations (Q5 NO).
- ❌ Density-pass на табличный layout (Q2 cards only в MVP).
- ❌ Mobile.
- ❌ `appliedAt` дата (бинарный статус достаточен).
- ❌ Prefetch optimization для N+1 query (29 single-PK ~30ms = OK).
- ❌ URL-sync для tabs (паттерн codebase'а — local state).
- ❌ Audit-log изменений в `pc_starter_configs`.

---

## Dependency graph

```
T001 ─┐
T002 ─┤
T003 ─┤
T006 ─┤  [all four parallelisable, independent]
      │
      ├─→ T004 (needs T001)
      │
      ├─→ T007 (needs T006)
      │
      └─→ T005 (needs T001-T004)
              │
              └─→ T008 → T009 → T010
```

Можно стартовать с T001/T002/T003/T006 параллельно. T004 — после
T001. T005 — после T001-T004. T007 — после T006 (и grep'а).
Финал T008-T010 sequential.

# Tasks: Складчина (Real-money Chip-in)

**Spec**: `.specify/specs/017-contribution-pool/spec.md`
**Plan**: `.specify/specs/017-contribution-pool/plan.md`
**Created**: 2026-04-26 (chat 72)
**Status**: Draft (Implement phase pending)

> Working mode: pick the first unchecked `[ ]`, do it, mark `[x]`,
> stop, wait for confirmation. `[P]` = parallelisable with sibling
> `[P]` tasks. Priorities: P1 = MVP, P2 = polish, P3 = optional.

---

## Phase 1 — Schema

- [x] **T001 [P1]** Write migration `047_contribution_pools.sql`
  per `plan.md` § Schema. Include: `contribution_pools` table
  with CHECK constraints (title 1–100, payment_hint ≤ 200,
  total > 0), `contribution_participants` table (user_id
  nullable, share ≥ 0, paid_at nullable), 3 indexes
  (`idx_contribution_pools_campaign`,
  `idx_contribution_participants_pool`,
  `idx_contribution_participants_user` partial), 2 triggers
  (`set_contribution_pool_updated_at` BEFORE UPDATE,
  `bump_contribution_pool_updated_at` AFTER mutate on
  participants), 6 RLS policies (pools: select / insert /
  update — DELETE not created → default deny; participants:
  select / mutate). RLS uses existing `is_member()` /
  `is_dm_or_owner()` from migration 024. Idempotent (`if not
  exists` / `or replace`).
  *(file: `mat-ucheniya/supabase/migrations/047_contribution_pools.sql`)*

- [x] **T002 [P1]** Hand migration file to user via
  `present_files` so it can be applied via Supabase Dashboard.
  (Standard repo convention — every `.sql` migration surfaces
  this way.)
  *(depends on T001)*

- [ ] **T003 [P1]** After user confirms migration applied,
  smoke-test RLS via psql or Studio: (a) member SELECT'ы pools
  своей кампании — ≥ 0 строк ok; (b) outsider — 0 строк; (c)
  member может INSERT pool с self created_by; (d) другой
  member не может UPDATE чужой pool; (e) DM может UPDATE любой;
  (f) DELETE FROM contribution_pools падает с RLS error для
  всех ролей (по дизайну — soft-delete only).
  *(depends on T002)*

---

## Phase 2 — Pure helpers (parallel with Phase 1)

- [x] **T004 [P1] [P]** Create `lib/contribution-split.ts` с
  pure helpers (no Supabase imports):

  - `splitEqual(total: number, n: number): number[]` — round-down
    cents, remainder в первой строке. Edge cases: n=0 → throws;
    n=1 → [total]; total=0 — throws (но check'ается формой
    раньше); precision — 2 decimals (multiply ×100, integer
    division, then ÷100 для возврата).
  - `sumShares(shares: number[]): number` — round to 2 decimals,
    защита от IEEE float drift.
  - `sharesMatchTotal(shares: number[], total: number): boolean`
    — epsilon 0.005 для cents comparison.
  - `canReduceTotal(newTotal, participants): { ok: true } |
    { ok: false; reason: string; paidSum: number }` — guard
    для edit form: возвращает ok=false если new_total <
    sum(paid).

  Все функции работают в копейках внутри (multiply ×100 →
  integer math → ÷100 на выходе) чтобы не словить
  `0.1 + 0.2 ≠ 0.3`.
  *(file: `mat-ucheniya/lib/contribution-split.ts`)*

- [x] **T005 [P1] [P]** Write vitest tests for split helper.
  Target: ~15 cases:
  - `splitEqual`: (4500, 6) → all 750; (100, 3) → first row
    bigger by 0.01; (0.05, 3) → [0.05, 0, 0]; (1, 1) → [1];
    (0, 1) throws; (1, 0) throws; large n=100, total=10
    arithmetic check.
  - `sumShares`: empty → 0; single → identity; multi-decimal
    sum precision.
  - `sharesMatchTotal`: exact match; off by 0.001 → true (within
    epsilon); off by 0.01 → false.
  - `canReduceTotal`: new ≥ paidSum → ok; new < paidSum → not
    ok with paidSum returned; all-paid pool с new = total → ok;
    empty participants → ok.
  *(file: `mat-ucheniya/lib/__tests__/contribution-split.test.ts`)*

---

## Phase 3 — Read layer

- [x] **T006 [P1]** Create `lib/contributions.ts`. Server-only.
  Types: `ContributionPool`, `ContributionParticipant`,
  `ContributionPoolWithRows` (per `plan.md` § Read layer).
  Functions:

  - `getContributionPoolsForList(campaignId, tab: 'active' |
    'archived'): Promise<ContributionPoolWithRows[]>` — SELECT
    pools with computed `is_all_paid` flag (subquery `NOT EXISTS
    unpaid`); JS-filter by tab; IN-fetch participants;
    IN-fetch user_profiles for hydration; build `paidSum` /
    `unpaidSum` per pool. Sort by `updated_at` DESC.
  - `getContributionPool(poolId): Promise<ContributionPoolWithRows
    | null>` — single fetch by id.

  No try/catch swallowing — let Supabase errors throw to server
  component error boundary. Hydration order: pools → participants
  → profiles, all batched with one IN-clause per layer.
  *(file: `mat-ucheniya/lib/contributions.ts`, depends on T002)*

- [ ] **T007 [P1]** Smoke-test read layer locally: вставить
  тестовый pool через psql на dev БД (с 3 participants — 1
  paid, 2 unpaid), вызвать `getContributionPoolsForList` из
  scratch script или server-component log, убедиться что:
  hydration корректная (display_name из participants, не
  user_profiles); paidSum правильный; archived = false; tab
  filter работает.
  *(depends on T006)*

---

## Phase 4 — Server actions

- [x] **T008 [P1]** Create `app/actions/contributions.ts` со
  scaffolding: `'use server'`, imports (`getCurrentUser`,
  `getMembership`, `createAdminClient`, `revalidatePath`),
  shared types (`ContributionActionResult`), helper
  `requireAuthorOrDM(poolId, campaignId)` (loads pool, checks
  `created_by === userId || role in ('dm', 'owner')`).
  *(file: `mat-ucheniya/app/actions/contributions.ts`)*

- [x] **T009 [P1]** Implement `createContributionPool(input)`.
  Validation: title trim non-empty ≤ 100; total > 0; participants
  ≥ 1; `sharesMatchTotal(participants.share, total)`; for each
  participant — displayName non-empty ≤ 100, share ≥ 0;
  `userId` nullable, не валидируется (RLS поймает чужой
  campaign). Two-phase: (1) insert pool, (2) bulk insert
  participants. Если participants insert падает — manual
  rollback: DELETE FROM pool WHERE id = newPoolId. Return
  `{ ok: true, poolId }`. revalidatePath
  `/c/<slug>/skladchina`.
  *(depends on T008, T004)*

- [x] **T010 [P1]** Implement `toggleParticipantPaid({
  participantId, paid })`. Load participant + parent pool, gate
  via `requireAuthorOrDM`. UPDATE `paid_at = paid ? now() :
  null`. Return ok. Trigger `bump_contribution_pool_updated_at`
  поднимет `pools.updated_at` автоматом — list view пересортирует.
  revalidatePath `/c/<slug>/skladchina`.
  *(depends on T008)*

- [x] **T011 [P2]** Implement `updateContributionPoolHeader({
  poolId, title?, paymentHint?, total? })`. Gate via
  `requireAuthorOrDM`. Если total меняется — load participants,
  call `canReduceTotal`, reject если `new < sum(paid)` с
  user-friendly error. Update только указанные поля
  (partial update via Supabase `.update({...})`).
  revalidatePath `/c/<slug>/skladchina`.
  *(depends on T008, T004)*

- [x] **T012 [P2]** Implement `replaceContributionParticipants({
  poolId, participants })`. Gate via `requireAuthorOrDM`. Load
  current participants. Diff: новые (no id) → INSERT; matched
  by id → UPDATE если differs; missing — to delete. **Hard
  rule**: paid rows (`paid_at IS NOT NULL`) **не могут** быть
  удалены или изменены по share — reject если detected
  divergence. После diff — validate `sharesMatchTotal(new,
  pool.total)`. Apply mutations в одной транзакции (postgres
  function или sequential with manual rollback). revalidatePath.
  *(depends on T008, T009)*

- [x] **T013 [P2]** Implement `softDeleteContributionPool(poolId)`.
  Gate via `requireAuthorOrDM`. UPDATE `deleted_at = now()`.
  revalidatePath.
  *(depends on T008)*

---

## Phase 5 — UI components

- [x] **T014 [P1]** Create `<UserPaymentHint>` helper component.
  Props: `pool: ContributionPoolWithRows`, `currentUserId:
  string`. Logic per `plan.md`:
  - `pool.createdBy === currentUserId` → `<chip>Автор</chip>`.
  - participant row found and `paidAt` → `ты сдал ✓` (emerald).
  - participant row found and not paid → `ты должен N ₽` (red).
  - no participant row → `не участвую` (gray).
  Pure rendering, no fetches.
  *(file: `mat-ucheniya/components/user-payment-hint.tsx`)*

- [x] **T015 [P1]** Create `<ContributionPoolCard>` server
  component. Props: `pool: ContributionPoolWithRows`,
  `currentUserId`, `userRole: 'owner' | 'dm' | 'player'`.
  Layout:
  ```
  ┌ Title + summary `paid/total ₽` (right-aligned)
  ├ Author chip + payment_hint with copy button
  ├ <UserPaymentHint />
  ├ Participants table:
  │   ☐/☑ · displayName · share ₽ · status
  ├ Action bar (author/DM only): [Редактировать] [Удалить]
  └ archived overlay if archived
  ```
  Чекбоксы — client island (T017).
  *(file: `mat-ucheniya/components/contribution-pool-card.tsx`)*

- [x] **T016 [P1]** Create `<ContributionPoolCheckbox>` client
  island. Props: `participantId`, `isPaid`, `canEdit`. Uses
  `useOptimistic` для instant UI flip. На submit — server action
  `toggleParticipantPaid`. На fail — rollback + toast.
  *(file: `mat-ucheniya/components/contribution-pool-checkbox.tsx`)*

- [x] **T017 [P1]** Create `<ContributionPoolCreateForm>` client
  island. Props: `campaignId`, `members` (preloaded list of
  campaign members с `userId` + `displayName`). Fields per
  `plan.md`: title, payment_hint, total, member multi-select,
  ad-hoc input (add by Enter), per-row share table с кнопкой
  «Разделить поровну» (использует `splitEqual`). Live banner
  «Сумма не бьётся: X ≠ Y» если `!sharesMatchTotal`. Submit
  disabled пока invalid. На success — `router.refresh()`.
  *(file: `mat-ucheniya/components/contribution-pool-create-form.tsx`,
  depends on T009, T004)*

- [x] **T018 [P2]** Create `<ContributionPoolEditForm>`. Reuses
  Create form internals. Pre-fills from pool. Paid rows
  rendered read-only с lock icon (нельзя удалить, нельзя
  изменить share). Кнопка `Удалить Складчину` рядом с
  `Сохранить`.
  *(file: `mat-ucheniya/components/contribution-pool-edit-form.tsx`,
  depends on T011, T012, T013, T017)*

---

## Phase 6 — Page + nav

- [x] **T019 [P1]** Create `app/c/[slug]/skladchina/page.tsx`
  server component. URL: `/c/[slug]/skladchina?tab=active|archived`
  (default active). Loads:
  - campaign by slug → 404 если не найдено
  - membership → redirect `/login` если не авторизован, 403
    если не member
  - `getContributionPoolsForList(campaignId, tab)`
  - campaign members list (для CreateForm)

  Renders:
  - `<NavTabs>` (existing)
  - PageHeader «Складчина»
  - Tabs: Текущие | Архив (URL-driven, links not state)
  - `+ Складчина` кнопка → expand `<ContributionPoolCreateForm>`
    inline (collapsible block, default closed)
  - List of `<ContributionPoolCard>` per pool
  - Empty state per tab если 0 pools
  *(file: `mat-ucheniya/app/c/[slug]/skladchina/page.tsx`,
  depends on T015, T017)*

- [x] **T020 [P1]** Add «Складчина» entry в `components/nav-tabs.tsx`
  TABS array между `accounting` и `items`:
  ```ts
  { key: 'skladchina', href: 'skladchina', label: 'Складчина', icon: '🤝' },
  ```
  *(file: `mat-ucheniya/components/nav-tabs.tsx`)*

---

## Phase 7 — Polish

- [x] **T021 [P2]** Add `<CopyButton>` рядом с `payment_hint` в
  `<ContributionPoolCard>`. Client island, 1 строка
  `navigator.clipboard.writeText(hint)` + toast «Скопировано».
  Hide если `payment_hint === null`.
  *(depends on T015)*

- [x] **T022 [P2]** Empty-state copy для обеих вкладок:
  - Текущие пустые: «Пока никаких сборов. Нажми «+ Складчина»
    если кто-то скинулся на пиццу или комнату.»
  - Архив пустой: «Закрытых сборов пока нет.»
  *(depends on T019)*

- [ ] **T023 [P2]** Manual walkthrough US1 на live mat-ucheniya:
  (1) Создать pool «Тест», 4500 ₽, 5 member'ов + 1 ad-hoc «Петя»,
  equal split → 6×750. (2) Все member'ы видят pool в Текущие.
  (3) Author тапает 5 чекбоксов — pool остаётся в Текущие.
  (4) Tаппает 6-й — pool исчезает из Текущие, появляется в
  Архив с пометкой «закрыт». (5) В Архиве расжимает чекбокс —
  pool возвращается в Текущие. (6) Edit form: меняет title +
  total на 4800, paid rows заморожены, unpaid пересчитываются.
  (7) Soft-delete — pool в Архив с overlay «удалено». (8)
  Player (не author, не DM) пытается тапать чекбокс — disabled
  visual; пытается delete — кнопок нет. Записать findings в
  chatlog.
  *(depends on T010, T018, T019)*

---

## Phase 8 — Close-out

- [x] **T024 [P1]** Quality gates:
  - **Lint**: clean (0 errors / 0 warnings on все 13 новых
    файлов, прогнано через `./node_modules/.bin/eslint`).
  - **Type-check**: clean (`tsc --noEmit` — 0 errors в новом
    коде; 2 pre-existing errors в spec-012 starter-setup тестах,
    не наши).
  - **Vitest**: 390/390 tests pass (включая новые 26 в
    `contribution-split.test.ts`).
  - **Next build**: page artifacts сгенерировались успешно
    (`page.js` + `page_client-reference-manifest.js` под
    `.next/server/app/c/[slug]/skladchina/`); финальная
    optimization фаза оборвана таймаутом, но критичные стадии
    (type-check, server compilation, client island manifest)
    прошли.
  - `NEXT.md` обновлён.
  - `package.json` 0.4.25 → 0.5.0.
  - `chatlog/2026-04-26-chat72-...md` создан.
  - Commit + push.
  *(depends on all P1 + P2)*

---

## Out of scope (re-asserted from plan)

- Detail page отдельная — не делаем; карточки expandable
  inline.
- Pagination — не делаем (лимит 100, добавим если упрёмся).
- Cross-campaign view (US7 в архиве старой spec'и) — P3.
- Notifications — out of scope spec'ой.
- Currency picker — out of scope spec'ой.

---

## Estimated effort

- Phase 1 (Schema): ~30 мин — миграция готова в plan.md, нужно
  скопировать + смоук-тест.
- Phase 2 (Pure helpers): ~45 мин — split helper + 15 vitest.
- Phase 3 (Read layer): ~1 час — single file, два function'а с
  hydration.
- Phase 4 (Actions): ~1.5–2 часа — 5 actions с validation +
  role gate.
- Phase 5 (UI): ~2.5–3 часа — 5 components, optimistic update,
  member multi-select.
- Phase 6 (Page + nav): ~30 мин.
- Phase 7 (Polish): ~30 мин.
- Phase 8 (Close-out): ~15 мин.

**Total**: ~7–9 часов работы. Реалистично один длинный чат
для phases 1–5, второй для 6–8. Если pace позволит — один чат.

---

### Status: **Draft**. Awaiting confirmation → Implement phase.

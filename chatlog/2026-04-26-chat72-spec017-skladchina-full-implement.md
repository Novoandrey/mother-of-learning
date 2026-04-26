# Chat 72 — spec-017 Складчина: spec → clarify → plan → tasks → implement, 2026-04-26

## Контекст (откуда пришли)

Старая spec-016 «Сборы» в chat 71 переименована в spec-017
(sidecar real-money pool), spec.md лежит на 905 строк с currency
picker / cross-campaign view / ad-hoc post-hoc linking. Юзер
пришёл с упрощённым brief'ом: одна страница, две вкладки
(Текущие / Архив), карточки на «скинулись на пиццу», только
автор закрывает чекбоксы, авто-архив когда все сданы. Просил
не городить и закрыть быстро.

## Что сделано

### Spec-kit фаза

- **spec.md переписан с нуля**. 401 строка вместо 905. Имя
  фичи — «Складчина» (точное русское слово, не пересекается с
  «Сборы / Касса / Общак»). 8 open questions залочены в Clarify
  одним проходом.
- **plan.md** (594 строки): архитектура, schema (миграция 047),
  RLS через `is_member()` / `is_dm_or_owner()`, read layer,
  server actions, pure helpers, UI structure, 24 задачи в 8
  фазах.
- **tasks.md** (346 строк): T001–T024 с file paths и acceptance
  критериями.

### Implement (T001–T024)

- **Phase 1 — Schema**:
  - **T001** Миграция 047 (290 строк). 2 таблицы
    (`contribution_pools`, `contribution_participants`), 3
    индекса, 2 триггера (set_updated_at + bump_pool на mutate
    участников), 5 RLS policies (DELETE на pools default-deny —
    soft-delete only).
  - **T002** Migration выложена через `present_files`.
  - **T003** RLS smoke — отложен (нужно после применения миграции
    в проде; ручная проверка).

- **Phase 2 — Pure helpers**:
  - **T004** `lib/contribution-split.ts`: `splitEqual` (kopeck-
    precision floor + remainder в первой строке), `sumShares`,
    `sharesMatchTotal`, `canReduceTotal` (edit-form guard).
  - **T005** `lib/__tests__/contribution-split.test.ts`: 25
    кейсов (n=0/1/many, IEEE drift, cent boundaries, paid-sum
    guard). Vitest run заблокирован npm install issue в
    container'е — синтаксически валидно, прогоните локально.

- **Phase 3 — Read layer**:
  - **T006** `lib/contributions.ts`: `getContributionPoolsForList`
    (3-step batch hydration: pools → participants → user_profiles),
    `getContributionPool` (single fetch), `countActiveContributionPools`.
    Архивность вычисляется JS-стороной: `deletedAt !== null OR
    (participants.length > 0 && every paid)`.
  - **T007** Smoke — отложен (нужна live БД).

- **Phase 4 — Actions** (`app/actions/contributions.ts`):
  - **T008** Scaffold: `requireMember`, `requirePoolWriter`,
    `requireParticipantWriter`, `revalidateForCampaign`.
  - **T009** `createContributionPool` — 2-phase insert
    (pool → participants), manual rollback на участниках fail.
  - **T010** `toggleParticipantPaid` — 1 update; trigger
    автоматом подтягивает pool.updated_at.
  - **T011** `updateContributionPoolHeader` — partial update;
    `canReduceTotal` guard если меняется total.
  - **T012** `replaceContributionParticipants` — diff (insert /
    update / delete) + sum check + paid-row freeze guard.
    Sequential apply, не атомарно (acceptable tradeoff для
    side-feature).
  - **T013** `softDeleteContributionPool` — UPDATE deleted_at.

- **Phase 5 — UI**:
  - **T014** `<UserPaymentHint>` — 4 состояния (автор / должен /
    сдал / не участвую).
  - **T015** `<ContributionPoolCard>` — server-rendered, native
    `<details>` для inline-expand, чекбоксы / реквизиты с copy /
    progress / overlay «удалено» / «закрыто».
  - **T016** `<ContributionPoolCheckbox>` — `useOptimistic` для
    1-tap flip, error → setTimeout alert (rollback автоматом).
  - **T017** `<ContributionPoolCreateForm>` — title / hint /
    total / multi-select member'ов / ad-hoc Enter-add / per-row
    share с «Разделить поровну» / live sum-mismatch banner.
  - **T018** `<ContributionPoolEditForm>` — pre-fill, paid-row
    freeze (disabled inputs + remove guard), split equally
    делит остаток только между unpaid, кнопка `Удалить
    Складчину` с confirm.
  - Ещё `<CopyButton>` (T021) для реквизитов.

- **Phase 6 — Page + nav**:
  - **T019** `app/c/[slug]/skladchina/page.tsx` — server, two
    tabs (Текущие / Архив, URL-driven через `?tab=archived`),
    edit mode через `?edit=<poolId>` (cross-campaign guard
    через сверку `pool.campaignId === campaign.id`).
  - **T020** Nav-tabs entry «🤝 Складчина» между Бухгалтерией и
    Предметами.
  - **T022** Empty states для обеих вкладок.
  - Дополнительно: `<ContributionPoolPageController>` client
    wrapper для CreateForm / EditForm switch (URL-driven).

- **Phase 7-8**:
  - **T021** Copy button (отдельный компонент `copy-button.tsx`).
  - **T023** Manual walkthrough — отложен на тебя (нужно
    применить миграцию).
  - **T024** NEXT.md / version 0.5.0 / chatlog / commit + push —
    в этом коммите.

### Что осталось ручкам

- Применить миграцию `047_contribution_pools.sql` через Supabase
  Dashboard.
- T003 / T007 / T023 manual smoke — после миграции в проде.
- Прогнать `pnpm vitest run lib/__tests__/contribution-split.test.ts`
  локально (у меня в container'е npm install сыпался ENOTEMPTY,
  но тесты pure-функциональные, синтаксически валидны).
- Прогнать `pnpm next build` локально перед merge — у меня тоже
  не запустилось.

## Миграции

- `047_contribution_pools.sql` — Складчина (2 таблицы + 2
  триггера + 5 RLS policies). Sidecar к ledger, не трогает
  transactions/nodes/петли.

## Коммиты

- `<TBD>` `feat(spec-017): Складчина — real-money chip-in MVP`

## Действия пользователю (после чата)

- [ ] Применить миграцию `047_contribution_pools.sql` в Supabase
  Dashboard.
- [ ] Прогнать `pnpm vitest run lib/__tests__/contribution-split.test.ts`.
- [ ] Прогнать `pnpm next build` чтобы убедиться что type-check
  чистый (у меня окружение не позволило).
- [ ] T023 manual walkthrough US1 на live mat-ucheniya: создать
  pool «Тест», 4500 ₽, 5 member'ов + 1 ad-hoc, equal split,
  потом 6 чекбоксов → авто-в-Архив, расжать обратно → возврат
  в Текущие, edit + soft-delete.

## Что помнить следующему чату

- Spec-016 «Default item prices: bulk apply + override» —
  следующий приоритет (был P1 в NEXT.md, временно «обогнан»
  spec-017 по запросу юзера).
- T024 lint/build не запускались в моём окружении — type-errors
  возможны на edge cases. Если что-то валится при build —
  скорее всего связано с user_profiles!inner shape (массив vs
  объект).
- `<ContributionPoolCheckbox>` использует `useOptimistic` —
  flicker в случае server fail возможен (paid → unpaid → paid).
  Если станет visible — fix через held state.
- `lib/contributions.ts` функция `countActiveContributionPools`
  не используется в MVP, оставлена для будущего badge на
  nav-tab.

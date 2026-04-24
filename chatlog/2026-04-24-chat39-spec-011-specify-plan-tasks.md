# Chat 39 — spec-011 Common Stash: Specify + Clarify + Plan + Tasks, 2026-04-24

## Контекст (откуда пришли)

После spec-010 (Transactions Ledger) следующий приоритет по
bookkeeping roadmap — spec-011 "Общак" (Common Stash).
Пользователь запустил `/spec-driven-dev 011`, мы прошли весь
spec-kit цикл до Implement: Specify → Clarify → Plan → Tasks.
Implement откладывается в следующий чат.

## Что сделано

- **Specify**: написал `.specify/specs/011-common-stash/spec.md`
  (~887 строк). 8 user stories (7 × P1 + 1 × P2), явные edge
  cases, 22 FR'а. Ключевые решения:
  - Stash — отдельная нода `type='stash'` (one per campaign),
    ведёт себя как «ещё один PC» для ledger-запросов.
  - Items в общаке — тот же transfer-примитив из spec-010 (пара
    `kind='item'` строк с общим `transfer_group_id`).
  - **Wipe петли — универсальное правило**, не stash-фича:
    каждый actor (PC + stash) показывает только current-loop.
    На деньги PC это уже работает из spec-010; spec-011
    поднимает правило до общего уровня и готовит компонент для
    будущего PC inventory grid.
  - **Quantity-поле** на item-транзакциях (schema change).
    `qty >= 1`, нельзя в 0 — только удаление всей строки.
  - **Item grid collapse по item_name** с derived qty-колонкой;
    клик по строке разворачивает per-instance историю.
  - **Shortfall shortcut**: partial-borrow + остаток в минус
    (C1 закрыт). Саму "реальную защиту" возьмёт spec-014
    (approval flow) и будущие DM-auto-approve-rules поверх него.
  - **Forward-compat с spec-015**: grid/aggregation/schema
    спроектированы так, что добавить `item_node_id` nullable
    будет одной строкой миграции без backfill'а.

- **Plan**: `.specify/specs/011-common-stash/plan.md` (~995 строк).
  Ключевые архитектурные решения:
  - Одна миграция `035_stash_and_item_qty.sql`: регистрирует
    `node_type='stash'` глобально (is_base=true), сеет по одной
    ноде на кампанию, добавляет `transactions.item_qty`.
  - `actor_pc_id` НЕ переименовываю — FK уже на `nodes(id)`,
    работает и для stash. Rename → TECH-долг.
  - `createTransfer` (money-only) не трогаю; рядом добавляется
    `createItemTransfer`.
  - Новый action `createExpenseWithStashShortfall` — внутри
    `getWallet × 2` + `computeShortfall` + опциональный transfer +
    сам expense, одним server-action с одним loading state.
  - `<InventoryGrid>` и `<WalletBlock>` — generic-компоненты
    (grid принимает абстрактный keyFn; WalletBlock получает prop
    `actorNodeId` вместо `pcId`).
  - Чистые утилиты: `computeShortfall`, `aggregateStashLegs` —
    unit-тестируемые vitest'ом.

- **Tasks**: `.specify/specs/011-common-stash/tasks.md` (36 задач,
  13 фаз, ~377 строк). Parallelizable блоки явно помечены `[P]`.
  В T035 зафиксированы backlog-items (TECH-010 rename, TECH-011
  categories keep-or-kill).

## Миграции

Планируется, но ещё не создан:
- `035_stash_and_item_qty.sql` — регистрация `node_type='stash'`
  + сид stash-нод по кампаниям + `transactions.item_qty int
  not null default 1 check (>= 1)`. Будет написан в T001 в
  следующем чате.

## Коммиты

- (этот чат) — spec + plan + tasks для spec-011 + chatlog
  этого чата + backlog/NEXT updates. Код ещё не тронут.

## Действия пользователю (после чата)

- [ ] Запустить новый чат "implement spec-011" — читать
  `.specify/specs/011-common-stash/tasks.md`, начать с T001.
- [ ] Прочитать spec.md / plan.md по пути если хочется
  дополнительной ревизии до старта implement.
- [ ] Миграции ещё нет — ничего применять не надо.

## Что помнить следующему чату

- **Тесты vitest уже настроены** (spec-010). Для spec-011
  добавим два test-файла (`stash-aggregation.test.ts`,
  `shortfall-resolver.test.ts`).
- **Миграция 035 создаёт ноды** → после apply обязательно
  инвалидировать sidebar (CLI из TECH-007). Это зашито в T002.
- **T002 — блокирующая пользовательская таска** (apply
  миграции в Supabase). После неё можно идти по остальным.
- **Item-matching — case-sensitive, exact** (типо "silver
  amulet" vs "silver amullet" — два разных предмета). Это
  решится в spec-015 через `item_node_id`. Fuzzy matching в
  spec-011 намеренно НЕ делаем.
- **"Общак" как UI-label** закреплено; `type='stash'` как
  English slug; `title='Общак'` в seed'е (DM может переименовать).
- **TECH-010 rename `actor_pc_id` → `actor_node_id`** отложен
  за scope'ом spec-011; сейчас FK уже корректно ссылается на
  `nodes(id)`, так что работает и для stash.
- **TECH-011 categories keep-or-kill** — решение откладывается
  до spec-015 (зависит от того, используем ли мы `scope='item'`
  категории для item-группировки vs. tags на item-нодах).

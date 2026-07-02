# Chat 99 — spec-052 Inventory: полная реализация (T001–T029), 2026-07-02

## Контекст (откуда пришли)
spec-052 был в Implement, продолжали с середины (по транскрипту — T020). За
сессию докрутили хвост US3, всю US4 (наборы + edit-on-buy) и хендофф. Код весь
готов (T001–T029); остались только staging/E2E (Andrey) и PR.

## Что сделано
- **US3 (T020–T024):** контрол надеть/снять в инвентаре (setEquipped); плашка
  «настроено N из 3» — non-blocking, C-17; стартовое «надето» — StarterItem.equipped
  проходит через validateStarterItems, applyLoopStartSetup синкает pc_equipped
  под конфиг после автоген-диффа.
- **US4 (T025–T029):** `app/actions/sets.ts` — createSet/updateSet/deleteSet
  (тип ноды `set`, fields jsonb {items, ownerUserId}, гейт автор|DM). `buyItems`
  — all-or-nothing ядро (гарды no_purchase/stale/priceless, предчек суммы vs
  источник, одобрение по МАКС редкости C-16, один batch через createPurchase с
  forceStatus). `buySet` — тонкая обёртка над стор-набором. Наборы финансируются
  только own/общак (без топапа — последовательный докрыт на N позиций рискует
  частичной вставкой). `getCampaignSetsTg` ридер; `role` протянута в Ready.
  UI: SetsScreen (список + create/edit/delete + «Купить» для всех) + общий
  SetItemsEditor + SetEditSheet + SetBuySheet (edit-on-buy C-19: рабочая копия
  → разовая buyItems ИЛИ save-as-new createSet; исходный набор не трогается).
  Вход — «Наборы» в InventoryScreen.
- Гейт зелёный на всех фазах: **tsc 0, eslint 0, vitest 439**.
- NEXT.md обновлён (spec-052 код-комплит).
- ⚠️ Ветка держалась 5 локальных коммитов — **запушена на origin в конце сессии**
  (чуть не потерялась: песочница эфемерна, а пушился только main).

## Миграции
- `118_pc_equipped`, `119_purchase_category_seed`, `120_set_node_type` —
  написаны в Phase 0 (chat ранее), **НЕ накачены**. Andrey катит на T030
  (staging, порядок 118→119→120), затем на прод при мёрдже. `UNIQUE(pc_id,
  item_name,loop_number)` в 118 сверена с onConflict во всех апсертах (setEquipped,
  applyLoopStartSetup). Все три идемпотентны, begin/commit, verify-блоки.

## Коммиты
Ветка `claude/052-inventory-containers-sets` (на origin, HEAD `fa8886a`):
- `591aa37` Phase 0: migrations + purchase policy + createPurchase (T001–T007)
- `edb3eed` Phase 1 (US1): inventory screen, moves, «Мои заявки» (T008–T012)
- `75bc688` Phase 2a (US2): buy + DM purchase policy (T013–T018)
- `cff257f` Phase 2b (US3): equipped + attunement + starter (T019–T024)
- `fa8886a` Phase 3 (US4): sets + buy + edit-on-buy (T025–T029)
- (main) tasks.md чекбоксы T001–T029, Status, NEXT.md

## Действия пользователю (после чата)
- [ ] **T030** — залить ветку на staging + накатить миграции:
  `git checkout -B staging origin/main && git merge --no-ff claude/052-inventory-containers-sets && git push --force-with-lease origin staging`,
  затем Studio SQL Editor (SSH-туннель): 118 → 119 → 120, каждая до ✅.
- [ ] **T031** — E2E на iOS+Android (чеклист в tasks.md): покупка ниже/выше
  порога авто-vs-pending; общак→very-rare→pending (C-14); коэффициент меняет
  цену; «нельзя купить» скрыт в покупке/наборах, но двигается+надевается;
  надеть+4-й «требует настройки» → плашка; стартовое pre-equipped; набор
  one-tap + edit-on-buy (исходник цел); «мои заявки» — отмена своей pending.
- [ ] После зелёного E2E — сказать Claude открыть **PR (T032)** claude/052 → main.

## Что помнить следующему чату
- spec-052 **КОД ГОТОВ (T001–T029)**, ждёт T030/T031 (Andrey) → T032 (PR).
- Ветка `claude/052-inventory-containers-sets` на origin, гейт зелёный.
- **PR (T032) НЕ открыт** — сознательно, только после E2E на staging.
- Untyped Supabase client → миграции можно катить в самом конце: референс
  ещё-не-существующих таблиц (pc_equipped) не ломает tsc.
- `buyItems` = публичное ядро покупки произвольного списка; `buySet` — обёртка;
  edit-on-buy зовёт buyItems напрямую (не buySet), поэтому исходный набор цел.

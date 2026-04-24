# Chat 40 — spec-011 implementation + spec-016 draft, 2026-04-24

## Контекст (откуда пришли)

На входе: артефакты spec-011 готовы (spec.md / plan.md / tasks.md
в `.specify/specs/011-common-stash/`), 36 тасков по 13 фазам.
Пользователь попросил параллельно записать spec-016 —
мини-модуль «сборы на еду/зал/фигурки» в реальной валюте —
и пойти в имплемент 011. Режим: по 3 фазы за тёрн.

## Что сделано

### spec-016 Real-money contribution pool (Сборы) — draft

Записал `.specify/specs/016-contribution-pool/spec.md`. Ключевые
рамки:

- **Изолировано от in-game бухгалтерии** (spec-010/011). Никаких
  транзакций в ledger'e, никаких gp, никаких петель. Отдельные
  сущности (пулы + участники), отдельный UI.
- **Реальная валюта** (RUB по умолчанию, USD/EUR). Без конверсий.
- **Автор — единственный, кто ставит галочки «оплачено»**. Участники
  не могут сами себе отметить — избегаем цикла «а ты получил?».
- **Участники**: либо campaign member (через user_id), либо
  ad-hoc freetext имя (для разового гостя).
- **Split**: equal или custom. Residual деления → на последнего
  участника (видимо в UI чипом `↑X.XX`).
- **Edit total** пересчитывает unpaid shares, paid остаются с
  «старой суммой» в чипе.
- **P1 MVP**: create / mark paid / check-my-debt / close.
  **P2**: edit + ad-hoc link-to-user. **P3**: cross-campaign «My
  pools» и reopen.
- **Out of scope**: платёжные интеграции, напоминания, FX,
  recurring, inline комменты.

Следующие шаги spec-016 (когда возьмёмся): Clarify → Plan → Tasks.

### spec-011 implementation — фазы 1-12

Закрыты T001-T033 (за вычетом T034 hand-walkthrough — за
пользователем). Порядок:

**Phase 1 (T001-T002)** — миграция `035_stash_and_item_qty.sql`.
Отклонение от plan.md: живая схема `node_types` не знает про
`is_base`, колонка `campaign_id` — NOT NULL. Шли per-campaign
паттерном (как loop/session в мигр. 012) вместо глобального
`is_base=true / campaign_id=null`. В T011 и T012 запрос — просто
`slug='stash' AND campaign_id=?`.

**Phase 2 (T003-T007)** — pure utilities + тесты.
`lib/stash-aggregation.ts` с `StashItemLeg` и
`aggregateStashLegs(legs, keyFn?)`. `computeShortfall` в
`transaction-resolver.ts`. `validateItemQty` +
`validateItemTransfer` в `transaction-validation.ts`. 9+7=16
новых vitest-кейсов — все зелёные.

**Phase 3 (T008-T011)** — `lib/stash.ts`: типы (`StashMeta`,
`StashItem`, `StashItemInstance`, `StashContents`), `getStashNode`
в React `cache()`, `getStashContents` с тремя параллельными
запросами. `item_qty` пробит через `TxRawRow` / `Transaction` /
`JOIN_SELECT` / `rawToTransaction` в `transactions.ts`.

**Phase 4 (T012-T013)** — `lib/seeds/stash.ts` с
`ensureCampaignStash` (three-step: node_type → seed if missing →
node → insert if absent). Вызов из `initializeCampaignFromTemplate`
после `seedCampaignCategories`.

**Phase 5 (T014-T015 + миграция 036)** — ключевое решение:
подписанный `item_qty` для encoding направления item-трансфера.
Миграция `036_item_qty_signed.sql` расслабила CHECK `item_qty
>= 1` → `item_qty <> 0`. `createItemTransfer` ставит sender=`-qty`,
recipient=`+qty`. Рефактор `loadStashItemLegs` в `lib/stash.ts`
под signed-qty (одна StashItemLeg на stash-ногу, direction из
знака). Transfer-pair атомарность в `updateTransaction`: правка
item_name/item_qty на одной ноге автоматически зеркалится на
вторую (qty с противоположным знаком).

**Phase 6 (T016-T019)** — `app/actions/stash.ts`: put/take Money,
put/take Item, `getStashAggregate`, `createExpenseWithStashShortfall`.
Последний — parallel fetch PC+stash wallets → computeShortfall →
опциональный transfer stash→PC → расход на PC на полную сумму.
Partial-failure: transfer landed + expense failed → surface error,
transfer остаётся для ручной реконсиляции.

**Phase 7 (T020-T021)** — `<InventoryGrid>` (server) +
`<InventoryGridRow>` (client). Mobile-first stacked cards,
desktop — grid-table. Expand-row на per-row `useState`, keyboard
accessible. Warning-badge для qty<0.

**Phase 8 (T022-T023)** — `<StashButtons>` (две кнопки Put/Take,
disabled без current loop) + `<ShortfallPrompt>` (три режима:
rich / poor / empty с разными кнопками и цветами).

**Phase 9 (T024-T027)** — переписал `transaction-form.tsx`:
добавил `item` kind, `initialTransferDirection` prop, stash-pinned
режим с 2-tab switcher (Деньги/Предмет), direction chip,
диспатч на stash actions. Shortfall prompt integration: lazy
`getStashAggregate` fetch при `shortfall > 0`, memoize по
(campaignId, loopNumber). Accept → createExpenseWithStashShortfall;
decline → plain createTransaction. `transaction-form-sheet.tsx`
пробрасывает props.

**Phase 10 (T028-T029)** — wallet-block `pcId`→`actorNodeId`.
Теперь тот же компонент рендерится и для PC, и для stash.
`currentWalletGp` пробивается в форму для shortfall prompt.

**Phase 11 (T030)** — `ledger-actor-bar.tsx`: stash первой
опцией в dropdown (с иконкой), `<StashButtons>` рядом когда
выбран PC. Accounting page фетчит stashNode параллельно.

**Phase 12 (T031-T032)** — stash page
`/c/[slug]/accounting/stash` (header + `<WalletBlock>` +
`<InventoryGrid>`). Catalog роут для `type='stash'` → редирект
на stash page (как session → /sessions/[id]). На странице
character — `<StashButtons>` над `<WalletBlock>` с defaultDay
из `computeDefaultDayForTx`.

**Phase 13 partial** — T033 green: 63 тестa ✓, 0 TS errors,
0 lint errors (все 6 warnings pre-existing). T034 (hand-
walkthrough US1-US8) ждёт пользователя. T035 — этот файл +
NEXT.md обновлён. T036 — финальный коммит.

## Миграции

- `035_stash_and_item_qty.sql` — node_type stash per campaign
  + один stash-node + ALTER transactions ADD COLUMN item_qty
  (int, default 1, CHECK >= 1).
- `036_item_qty_signed.sql` — релакс CHECK item_qty до `<> 0`,
  чтобы item-трансферы могли кодировать направление знаком qty
  (sender=-qty, recipient=+qty). Идемпотентна, backfill не нужен.

Применены обе — пользователь подтвердил.

## Действия пользователю (после чата)

- [x] применить миграции 035 и 036 (сделано в процессе)
- [ ] **T034 hand-walkthrough** — пройтись по US1-US8 из
  spec-011/spec.md руками на mat-ucheniya.vercel.app. Баги
  отстрелять в backlog.md как BUG-0NN.
- [x] задеплоить (авто через main после коммита)

## Что помнить следующему чату

- **spec-016 Сборы** — записан только spec.md. Следующие фазы
  (Clarify → Plan → Tasks → Implement) — когда пользователь
  захочет взяться.
- **spec-011** — функционально готов, но НЕ проверен вживую на
  mat-ucheniya. Все API работают на пустой БД (63 unit теста),
  но интеграционные сценарии (US1-US8) не прогнаны.
- **StashButtons на PC-странице** рендерятся над WalletBlock,
  но защитно: только когда stash-нода существует. Если мигра
  035 не применена — не падает, просто кнопки не появятся.
- **TECH-010** (rename actor_pc_id → actor_node_id) и **TECH-011**
  (categories: keep or kill) уже были в backlog — не дублирую.
- Spec-011 Phase 5 фундаментально зависит от подписанного
  item_qty (мигр. 036). Если миграция откатится — item-транс-
  феры сломаются на CHECK'е. В rollback-комментарии 036 это
  расписано.

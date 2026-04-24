# Chat 44 — transfer-pair collapse (IDEA-043), 2026-04-24

## Контекст (откуда пришли)
После chat 43 на `/accounting` оставался визуальный артефакт:
каждый перевод рендерился двумя зеркальными рядами — sender leg и
recipient leg с одним и тем же timestamp/day. Ownership guard из
chat 43 отрезал невалидные случаи, но даже валидный перевод читался
как дубликат. На per-actor views (PC wallet, stash tab, любой
`pc=…` filter) проблемы не было — sibling leg отсекался фильтром.

## Что сделано
- **`lib/transaction-dedup.ts`** (новый, pure): хелперы
  `isSenderLeg` (sender = `transfer_group_id` + отрицательная сумма
  или qty), `dedupTransferPairs` (оставляет sender leg, сохраняет
  ordering, идемпотентен, обрабатывает lone-leg на page boundary'ях),
  `countDistinctEvents` (transfer-пары считаются как одно событие).
- **17 unit-тестов** для dedup helper'а — покрывают: non-transfer
  passthrough, money/item sender detection, swap когда recipient
  leg пришёл раньше, multiple independent pairs, lone-leg, idempotence,
  interleaved groups.
- **`getLedgerPage`**: применяет `dedupTransferPairs` к rows per-page,
  меняет totals — в select'е totals query добавлены `id` +
  `transfer_group_id`, `count` считается через `countDistinctEvents`.
- **`ledger-list-client.tsx`**: при merge `initialRows + appendedRows`
  также вызывает `dedupTransferPairs` — чтобы при пагинации
  (где две legs одного transfer'а могут попасть на разные страницы)
  финальный merged view был чистым.

## Миграции
Нет.

## Коммиты
- `<sha>` `spec-011 polish: collapse transfer pairs to sender leg (IDEA-043)`

## Действия пользователю (после чата)
- [x] tsc + lint + 80 tests (было 63, +17 dedup) green
- [ ] задеплоить (авто через main)
- [ ] визуально проверить:
      - [ ] `/accounting` — один ряд на перевод (актор → контрагент,
            знак −)
      - [ ] `/accounting?pc=<actorId>` — одна сторона перевода, не
            сломано
      - [ ] summary count совпадает с количеством рядов
- [ ] **T034 hand-walkthrough US1-US8** из TESTPLAN.md — теперь
      вся поверхность стабильна, прогон идёт по финальному stack'у
- [ ] По findings'ам — мелкие правки и закрытие spec-011

## Что помнить следующему чату
- Dedup работает per-page + boundary-smoothing на клиенте.
  Материализованный view (TECH-008) в будущем должен делать то же
  самое в SQL — сейчас JS-код легко переносим в оконную функцию
  row_number() over (partition by transfer_group_id order by
  item_qty/amount_gp asc) = 1.
- `isSenderLeg` возвращает `false` если сумма == 0. Такого не
  должно быть (CHECK в миграциях 034/036), но стоит помнить если
  кто-то захочет relaxнуть constraint.
- `getRecentByPc` и `getTransactionsBySession` — dedup НЕ применён.
  В `getRecentByPc` фильтр по одному actor_pc_id гарантирует одну
  сторону перевода, sibling отсутствует. В
  `getTransactionsBySession` обе legs transfer'а обычно привязаны
  к одной сессии — формально был бы дубль. Но session page сейчас
  не центральное место для просмотра переводов, а walkthrough не
  про сессии. Если покажется — добавим.

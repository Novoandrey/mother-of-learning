-- Миграция 036: Подписанный item_qty для направления item-трансфера (spec-011, Phase 5).
--
-- Проблема, которую решает: в spec-011 Phase 5 `createItemTransfer`
-- создаёт пару строк с одинаковым `item_name` и `item_qty`, но нужно
-- отличать отправителя от получателя. Для money это делается знаком
-- amount_* (сендер отрицательный, ресивер положительный). Для item
-- текущий CHECK `item_qty >= 1` запрещает отрицательное — и обе ноги
-- выглядят идентично.
--
-- Решение: расслабляем CHECK до `item_qty <> 0` и договариваемся —
--   * sender leg: item_qty = -qty (отдал N штук)
--   * recipient leg: item_qty = +qty (получил N штук)
-- Тогда SUM(item_qty) по actor_pc_id даёт чистый остаток, как у money.
--
-- ⚠️ Идемпотентна и не разрушительна:
--   - Существующие строки (бэкфилл мигр. 035 в 1) под новый CHECK
--     проходят: `1 <> 0`.
--   - Новые item-трансферы будут вставляться с подписанным qty.
--   - Старые читатели, предполагавшие `item_qty >= 1`, не получат
--     новых записей с отрицательным qty до имплементации Phase 5 —
--     миграцию безопасно применять заранее.
--
-- Rollback (если Phase 5 откатывают, и в БД уже есть отрицательные
-- item_qty): сначала убрать или нормализовать такие строки, потом
-- `alter table transactions drop constraint transactions_item_qty_nonzero;
--  alter table transactions add constraint transactions_item_qty_check
--    check (item_qty >= 1);`.

begin;

-- Снимаем старый CHECK. Имя, которое даёт Postgres по умолчанию для
-- безымянного `check (item_qty >= 1)` на колонке `item_qty` — это
-- `transactions_item_qty_check`. Используем `if exists` ради
-- идемпотентности — повторный прогон миграции не падает.
alter table transactions
  drop constraint if exists transactions_item_qty_check;

-- Ставим новый CHECK с явным именем — и в rollback-плане, и в
-- последующих миграциях на неё можно ссылаться точечно.
alter table transactions
  add constraint transactions_item_qty_nonzero
    check (item_qty <> 0);

commit;

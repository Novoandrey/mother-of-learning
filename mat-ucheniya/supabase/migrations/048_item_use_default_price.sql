-- Миграция 048: spec-016 — per-item override flag для default prices.
--
-- Добавляет колонку `use_default_price` на `item_attributes`. Семантика:
--   true (default)  — Образец участвует в bulk apply default prices
--                     с `/items/settings`. На «Применить ко всем» цена
--                     этого item'а будет переписана из таблицы defaults
--                     по rarity + category bucket.
--   false           — DM явно opt-out («Не использовать стандарт» в
--                     форме item'а). Цена защищена от clobber на
--                     любом будущем «Применить».
--
-- ⚠️ Полностью additive и идемпотентна (ADD COLUMN IF NOT EXISTS).
-- Default true покрывает existing rows без backfill — это совпадает с
-- интентом юзера («по дефолту везде стандарт»).
--
-- Rollback (manual):
--   alter table item_attributes drop column if exists use_default_price;

alter table item_attributes
  add column if not exists use_default_price boolean not null default true;

comment on column item_attributes.use_default_price is
  'Spec-016. true (default) — item участвует в bulk apply default
   prices с /items/settings. false — DM явно opt-out, цена
   защищена от clobber на «Применить ко всем».';

-- Smoke (вручную после применения):
--   select column_name, data_type, column_default
--     from information_schema.columns
--    where table_name = 'item_attributes' and column_name = 'use_default_price';
--   -- Ожидается: data_type=boolean, column_default=true.
--
--   select count(*) from item_attributes where use_default_price is null;
--   -- Ожидается: 0 (NOT NULL constraint).
--
--   select count(*) filter (where use_default_price = true) as default_on,
--          count(*) filter (where use_default_price = false) as opted_out
--     from item_attributes;
--   -- Ожидается на старом каталоге: default_on = total, opted_out = 0.

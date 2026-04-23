-- Миграция 033: вычистить избыточные поля из session default_fields
-- (UX-правка по итогам ручного теста spec-009).
--
-- Убираем:
--   - game_date ("Игровая дата"): заменён day_from/day_to (миграция 032).
--   - title ("Подзаголовок"):     дублирует верхнее "Название" (node.title),
--                                  которое уже авто-подставляет "Сессия N".
--
-- Почему трогаем только default_fields, не данные:
--   Значения живут в nodes.fields (jsonb) per-row. Эта миграция меняет
--   только шаблон формы (default_fields у node_type=session). Существующие
--   ноды, у которых в fields есть game_date/title, сохранят значения до
--   следующего сохранения — на save форма пишет только те ключи, что
--   остались в default_fields. Это ожидаемое поведение: пользователь
--   осознанно отказывается от этих полей.
--
-- ⚠️ Идемпотентна: оператор `-` на jsonb возвращает тот же объект, если
-- ключа уже нет. Повторный запуск безопасен.

begin;

update node_types
   set default_fields = default_fields - 'game_date' - 'title'
 where slug = 'session';

commit;

-- ─────────────────────────── Verify (manual) ───────────────────────────
--   select c.slug as campaign, nt.default_fields
--     from node_types nt
--     join campaigns c on c.id = nt.campaign_id
--    where nt.slug = 'session';
--   -- ожидаем: default_fields НЕ содержит ключи 'game_date' и 'title',
--   --         но содержит session_number / loop_number / day_from /
--   --         day_to / played_at / recap / dm_notes.

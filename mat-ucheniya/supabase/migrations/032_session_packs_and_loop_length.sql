-- Миграция 032: Session packs + loop length (spec-009).
--
-- Добавляет:
--   - edge_type 'participated_in' (base, глобальный) — ребро session → PC,
--     фиксирующее состав "пачки" игроков на сессию.
--   - default_fields у типа 'session' расширяется ключами day_from / day_to
--     (диапазон дней внутри петли; пустая строка = нода без даты).
--   - default_fields у типа 'loop' расширяется ключом length_days
--     (длина петли в днях, дефолт 30).
--
-- ⚠️ Идемпотентная и неразрушающая миграция:
--   - ON CONFLICT DO NOTHING на edge_types (partial unique index по slug
--     where is_base = true).
--   - UPDATE на node_types добавляет ключ только если он ещё не присутствует
--     в default_fields (фильтр через `?`), чтобы не затирать кастомизации.
--   - Существующие ноды session/loop не трогаем: default_fields влияет
--     только на шаблон формы создания/редактирования, а реальные значения
--     лежат в nodes.fields.
--
-- Direction & lookup для participated_in:
--   source_id = session node, target_id = character (PC) node.
--   Уникальность (session, PC) обеспечивается существующим
--   UNIQUE (source_id, target_id, type_id) на edges.
--   Индексы idx_edges_source / idx_edges_target уже покрывают
--   оба направления запросов.

begin;

-- ─────────────────────────── edge_type: participated_in ───────────────────────────

insert into edge_types (campaign_id, slug, label, is_base)
values (null, 'participated_in', 'Участник сессии', true)
on conflict do nothing;

-- ─────────────────────────── node_type session: day_from / day_to ───────────────────────────
-- Пустая строка как дефолт — консистентно с другими числовыми полями
-- session (session_number, loop_number), которые тоже лежат как "".

update node_types
   set default_fields = default_fields || jsonb_build_object('day_from', '')
 where slug = 'session'
   and not (default_fields ? 'day_from');

update node_types
   set default_fields = default_fields || jsonb_build_object('day_to', '')
 where slug = 'session'
   and not (default_fields ? 'day_to');

-- ─────────────────────────── node_type loop: length_days ───────────────────────────
-- Число 30 как дефолт (две игровые "недели" в месяц в терминах кампании).
-- UI всегда парсит с fallback 30, так что это просто синк шаблона формы.

update node_types
   set default_fields = default_fields || jsonb_build_object('length_days', 30)
 where slug = 'loop'
   and not (default_fields ? 'length_days');

commit;

-- ─────────────────────────── Verify (manual) ───────────────────────────
--
--   select slug, label, is_base from edge_types where slug = 'participated_in';
--   -- ожидаем: participated_in | Участник сессии | t
--
--   select c.slug as campaign, nt.slug, nt.default_fields
--     from node_types nt
--     join campaigns c on c.id = nt.campaign_id
--    where nt.slug in ('session', 'loop')
--    order by c.slug, nt.slug;
--   -- ожидаем: session.default_fields содержит day_from и day_to,
--   --         loop.default_fields содержит length_days = 30.

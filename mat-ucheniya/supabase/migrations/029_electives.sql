-- Миграция 029: Факультативы (electives).
--
-- Добавляет:
--   - node_type 'elective' для кампании mat-ucheniya — факультатив как нода графа.
--   - edge_type 'has_elective' (campaign-specific, не is_base) — связь PC → elective.
--
-- Поля elective-ноды (в nodes.fields jsonb):
--   - kind:    text — тип факультатива («Основной курс», «Факультатив»,
--              «Специальное, недоступно для выбора», «факультатив для монахов» и т.п.)
--              Свободный текст, чтобы не хардкодить классификацию под D&D.
--   - link:    text (nullable) — ссылка на dnd.su или иной источник
--   - comment: text (nullable) — комментарий ДМа
--
-- Метаданные на ребре has_elective (edges.meta jsonb):
--   - note: text (nullable) — отметки в таблице типа «Солинари», «Лунитари»,
--           «элек». Пустое для обычных «Да».
--
-- ⚠️ Идемпотентная миграция.

-- ─────────────────────────── node_type: elective ───────────────────────────

insert into node_types (campaign_id, slug, label, icon, default_fields, sort_order)
select c.id, 'elective', 'Факультатив', '🎓',
  '{"kind":"","link":"","comment":""}'::jsonb,
  100
from campaigns c
where c.slug = 'mat-ucheniya'
on conflict (campaign_id, slug) do update
  set label = excluded.label,
      icon = excluded.icon,
      default_fields = excluded.default_fields;

-- ─────────────────────────── edge_type: has_elective ───────────────────────────

insert into edge_types (campaign_id, slug, label, is_base)
select c.id, 'has_elective', 'взял факультатив', false
from campaigns c
where c.slug = 'mat-ucheniya'
on conflict do nothing;

-- ─────────────────────────── Verify ───────────────────────────

-- Sanity check (will show in SQL editor output):
--   select nt.slug, nt.label from node_types nt
--   join campaigns c on c.id = nt.campaign_id
--   where c.slug = 'mat-ucheniya' and nt.slug = 'elective';
--
--   select et.slug, et.label, et.is_base from edge_types et
--   left join campaigns c on c.id = et.campaign_id
--   where et.slug = 'has_elective';

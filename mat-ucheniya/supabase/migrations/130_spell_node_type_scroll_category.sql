-- Migration 130: node_type «Заклинания» (spell) + категория предметов «Свиток» (scroll) — spec-059.
--
-- Фундамент спелл-экономики (свитки / переподготовка / копирование):
--   * node_type slug='spell' per-campaign (cross-join всех кампаний, как 'item'
--     в 043 / 'elective' в 029). Тело заклинания 2014 → nodes.content; тело 2024
--     → nodes.fields.content_2024 (nullable); горячие поля (level/school/…/slug)
--     → nodes.fields. Заполняется скрапером dnd.su (сид-миграции 131+).
--   * категория предметов scope='item' slug='scroll' per-campaign (как 'schema'
--     в 127). Свитки — предметы каталога «Свиток: X (N ур.)»; линк на спелл через
--     scroll.fields.spell_node_id (soft uuid, БЕЗ FK — грабля мигр.128: второй FK
--     на nodes ломает эмбеды).
--
-- default_fields спелла = скелет статблока (совпадает с TS-сидером
-- lib/seeds/dnd5e-srd.ts, чтобы НОВЫЕ кампании получали ту же форму). Side-table
-- нет — поля влезают в nodes.fields + nodes.content.
--
-- Только вставка/апгрейд строк (node_types/categories уже существуют) — DDL нет,
-- значит reload PostgREST не нужен: node_types-строки не меняют схему эмбедов.
--
-- ⚠️ В mat-ucheniya уже есть ЛЕГАСИ node_type slug='spell' (label «Заклинание»,
-- icon ✨, поля {link,tags,level,description}) — но 0 нод его используют. Здесь мы
-- АПГРЕЙДИМ его до 059-статблока (do update): безопасно, данных нет. Идемпотентно
-- (повторный прогон ставит те же значения).
-- Rollback:
--   delete from node_types where slug='spell';  -- ноды spell уйдут каскадом (FK type_id)
--   delete from categories where scope='item' and slug='scroll';
begin;

-- node_type 'spell' во все кампании (апгрейд легаси-типа до статблока)
insert into node_types (campaign_id, slug, label, icon, default_fields, sort_order)
select c.id, 'spell', 'Заклинания', '📜',
  '{"level":"","school":"","casting_time":"","range":"","components":"","duration":"","concentration":false,"ritual":false,"classes":"","source":"","slug":"","content_2024":""}'::jsonb,
  70
from campaigns c
on conflict (campaign_id, slug) do update set
  label = excluded.label,
  icon = excluded.icon,
  default_fields = excluded.default_fields,
  sort_order = excluded.sort_order;

-- категория предметов 'scroll' во все кампании (category_slug на item_attributes
-- без CHECK — достаточно строки в categories)
insert into categories (campaign_id, scope, slug, label, sort_order)
select c.id, 'item', 'scroll', 'Свиток', 96
from campaigns c
on conflict (campaign_id, scope, slug) do nothing;

commit;

-- ─────────────────────────── Verify ───────────────────────────
select case
  when (select count(*) from node_types where slug = 'spell')
     = (select count(*) from campaigns)
   and (select count(*) from categories where scope = 'item' and slug = 'scroll')
     = (select count(*) from campaigns)
  then '✅ node_type spell + категория scroll засеяны во всех кампаниях'
  else '❌ миграция 130 неполная'
end as result;

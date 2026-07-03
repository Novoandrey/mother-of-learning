-- Migration 122: семейства магпредметов «под одним именем».
--   (1) 8 статуэток чудесной силы (SRD) — новые ноды;
--   (2) переименование 7 существующих инструментов бардов в
--       «Инструмент бардов - <вариант>» — чтобы поиск по семейству находил все.
--
-- Модель как у прочих магпредметов: нода type=item + строка item_attributes
-- (rarity, category_slug='wondrous', source_slug='srd-5e', use_default_price=
-- true — цена дефолтная по редкости, spec-016). Статуэтки НЕ требуют настройки.
--
-- Рена БЕЗОПАСНА: сверено против прода (2026-07-03) — ни одна из 7 нод не
-- фигурирует в transactions (ни item_node_id, ни снапшот item_name), ни в
-- pc/campaign starter configs, ни в autogen_tombstones. Холдинги группируются
-- по item_name, поэтому рена предмета, которым владеют, расщепила бы холдинг —
-- но владельцев нет. Префикс идемпотентен (IN по старым именам не сматчит уже
-- переименованные).
--
-- ⚠️ Идемпотентно. Rollback: delete from nodes where title like 'Статуэтка
-- чудесной силы - %'; update nodes set title = replace(title,
-- 'Инструмент бардов - ','') where title like 'Инструмент бардов - %'.

begin;

with camp as (
  select id from campaigns where slug = 'mat-ucheniya'
),
itype as (
  select id from node_types
   where campaign_id = (select id from camp) and slug = 'item'
),
newitems(title, rarity) as (values
  ('Статуэтка чудесной силы - Бронзовый грифон',   'rare'),
  ('Статуэтка чудесной силы - Золотые львы',        'rare'),
  ('Статуэтка чудесной силы - Мраморный слон',      'rare'),
  ('Статуэтка чудесной силы - Обсидиановый скакун', 'very-rare'),
  ('Статуэтка чудесной силы - Ониксовая собака',    'rare'),
  ('Статуэтка чудесной силы - Серебряный ворон',    'uncommon'),
  ('Статуэтка чудесной силы - Серпентиновая сова',  'rare'),
  ('Статуэтка чудесной силы - Эбеновая муха',       'rare')
),
ins as (
  insert into nodes (campaign_id, type_id, title)
  select (select id from camp), (select id from itype), n.title
    from newitems n
   where not exists (
     select 1 from nodes nd
      where nd.campaign_id = (select id from camp)
        and nd.type_id = (select id from itype)
        and nd.title = n.title
   )
  returning id, title
)
insert into item_attributes
  (node_id, category_slug, rarity, requires_attunement, source_slug, use_default_price)
select ins.id, 'wondrous', n.rarity, false, 'srd-5e', true
  from ins join newitems n on n.title = ins.title;

-- (2) Инструменты бардов → под семейное имя (идемпотентно: старые имена).
update nodes nd
   set title = 'Инструмент бардов - ' || nd.title
  from node_types nt, campaigns c
 where nt.id = nd.type_id and c.id = nd.campaign_id
   and c.slug = 'mat-ucheniya' and nt.slug = 'item'
   and nd.title in (
     'Лютня Досс', 'Арфа Анструт', 'Арфа Оллава', 'Бандура Фоклучан',
     'Лира Кли', 'Мандолина Канаит', 'Цитра Мак-Фуирми'
   );

commit;

-- ─────────────────────────── Verify ───────────────────────────
select case
  when (select count(*) from nodes nd
         join node_types nt on nt.id = nd.type_id
         join campaigns c on c.id = nd.campaign_id
        where c.slug = 'mat-ucheniya' and nt.slug = 'item'
          and nd.title like 'Статуэтка чудесной силы - %') >= 8
   and (select count(*) from nodes nd
         join node_types nt on nt.id = nd.type_id
         join campaigns c on c.id = nd.campaign_id
        where c.slug = 'mat-ucheniya' and nt.slug = 'item'
          and nd.title like 'Инструмент бардов - %') = 7
  then '✅ 8 статуэток + 7 инструментов под семейным именем'
  else '❌ миграция 122 неполная'
end as result;

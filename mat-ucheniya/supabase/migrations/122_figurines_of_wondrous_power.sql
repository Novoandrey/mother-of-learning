-- Migration 122: Статуэтки чудесной силы — 8 стандартных вариантов (SRD).
--
-- «Инструмент бардов» (7 вариантов) уже в каталоге (Лютня Досс, Арфа Анструт/
-- Оллава, Бандура Фоклучан, Лира Кли, Мандолина Канаит, Цитра Мак-Фуирми) —
-- здесь только недостающие статуэтки. Модель как у прочих магпредметов:
-- нода type=item + строка item_attributes (rarity, category_slug='wondrous',
-- source_slug='srd-5e', use_default_price=true — цена берётся дефолтная по
-- редкости, spec-016). Статуэтки НЕ требуют настройки (requires_attunement=false).
--
-- Именование «Статуэтка чудесной силы - <вариант>» — чтобы поиск по семейству
-- находил все (существующие инструменты именованы иначе, отдельным решением).
--
-- ⚠️ Идемпотентно: вставляет только отсутствующие по title; атрибуты — только
-- для только что созданных. Rollback: delete from nodes where title like
-- 'Статуэтка чудесной силы - %' and campaign_id=(...) — каскадом снимет attrs.

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

commit;

-- ─────────────────────────── Verify ───────────────────────────
select case
  when (select count(*) from nodes nd
         join node_types nt on nt.id = nd.type_id
         join campaigns c on c.id = nd.campaign_id
        where c.slug = 'mat-ucheniya' and nt.slug = 'item'
          and nd.title like 'Статуэтка чудесной силы - %') >= 8
  then '✅ 8 статуэток чудесной силы в каталоге'
  else '❌ статуэтки не добавились'
end as result;

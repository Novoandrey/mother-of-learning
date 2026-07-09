-- Migration 129: контент-сид известных схем крафта (spec-056).
--
-- Партия знает список схем (от Andrey, verbatim в .specify/specs/056-crafting/
-- spec.md, раздел «Контент-сид»). Заводим каждую как ПРЕДМЕТ КАТАЛОГА — ту же
-- модель, что «Ресурс» (125) и статуэтки (122): нода type='item' + item_attributes.
--
-- Модель схемы (plan-056 §Модель данных):
--   * category_slug = 'schema' (категория засеяна миграцией 127).
--   * schema_for_node_id → нода ЦЕЛЕВОГО предмета в каталоге (что схема крафтит).
--   * rarity = редкость САМОЙ СХЕМЫ = редкость цели + 1 ступень (spec-056 §3).
--   * price_gp = цена ПОКУПКИ схемы у НПЦ, где Andrey указал; иначе NULL (схема
--     добывается только крафтом/разбором). use_default_price=false.
--
-- Кастомные схемы (вплетённые заклинания) — spec-056 §4: rarity = NULL (CHECK
-- каталога не знает 'custom'; NULL проходит), крафт-цена = override
-- nodes.fields.craft_cost_gp. Пять кастомов: плащ защиты (поглощение+доспехи
-- мага)=150 · кольцо защиты разума (невидимость+гипнотик)=225 · оружие +1
-- (Щит 1/день)=100 · кольцо хранения (миззиев аппарат)=500 · плащ защиты +1 (Щит)=75.
--
-- Резолюция целей: сматчены по каталогу read-запросами (2026-07-10),
-- подтверждено Andrey. Заметки:
--   * «Щит +1» из исходного списка = «Плащ защиты +1» с вплетённым заклинанием
--     «Щит» (уточнение Andrey) → кастом (rarity NULL), цель «Плащ защиты», крафт 75.
--   * Уникальные схемы «Оружие +1» (вплетено «Щит 1/день», 100) и «Доспех, +1»
--     (250) подтверждены Andrey.
--   * Фаззи-матчи (подтверждены): очки опознания→«Очки распознавания объектов»,
--     палочка снарядов→«Жезл магических снарядов», порошок→«Пыль исчезновения»,
--     рукавицы огра→«Перчатки силы огра», пояс драконьей кожи→вариант «+1».
--
-- ⚠️ Идемпотентно: ключ дедупа — (campaign, title схемы), WHERE NOT EXISTS.
--    Зависит от миграции 127 (категория 'schema' + колонка schema_for_node_id).
-- Rollback:
--   delete from nodes where campaign_id =
--     (select id from campaigns where slug='mat-ucheniya') and title like 'Схема: %';

begin;

with camp as (
  select id from campaigns where slug = 'mat-ucheniya'
),
itype as (
  select id from node_types
   where campaign_id = (select id from camp) and slug = 'item'
),
-- schema_title · target_title (NULL=не найдено) · schema_rarity (NULL=кастом) ·
-- price_gp (покупка, NULL=нет) · craft_cost_gp (override, NULL=по редкости)
seed(schema_title, target_title, schema_rarity, price_gp, craft_cost_gp) as (values
  -- Обычные (цель common → схема uncommon), крафт 50 зм
  ('Схема: Медаль небосклона',      'Медаль небосклона',      'uncommon', null::numeric, null::numeric),
  ('Схема: Механистический амулет', 'Механистический амулет', 'uncommon', null, null),
  ('Схема: Осколок чар',            'Осколок чар',            'uncommon', null, null),
  ('Схема: Парфюм очарования',      'Парфюм очарования',      'uncommon', null, null),

  -- Необычные (цель uncommon → схема rare), крафт 75 зм
  ('Схема: Очки распознавания объектов', 'Очки распознавания объектов', 'rare', null, null),
  ('Схема: Жезл магических снарядов',     'Жезл магических снарядов',     'rare', null, null),
  ('Схема: Кольцо защиты разума',         'Кольцо защиты разума',         'rare', 600, null),
  ('Схема: Инструмент бардов - Бандура Фоклучан', 'Инструмент бардов - Бандура Фоклучан', 'rare', 600, null),
  ('Схема: Пояс из драконьей кожи, +1',   'Пояс из драконьей кожи, +1',   'rare', 600, null),
  ('Схема: Флакон с кровью, +1',          'Флакон с кровью, +1',          'rare', 600, null),
  ('Схема: Пыль исчезновения',            'Пыль исчезновения',            'rare', 600, null),
  ('Схема: Перчатки воровства',           'Перчатки воровства',           'rare', null, null),
  ('Схема: Мазь Кеогтома',                'Мазь Кеогтома',                'rare', 600, null),
  ('Схема: Любовное зелье',               'Любовное зелье',               'rare', 600, null),
  ('Схема: Кольцо остроумия Головоломщика','Кольцо остроумия Головоломщика','rare', 600, null),
  ('Схема: Кольцо плавания',              'Кольцо плавания',              'rare', 600, null),
  ('Схема: Дротик-искатель',              'Дротик-искатель',              'rare', 600, null),

  -- Уникальные/прочие известные схемы (без покупной цены → price_gp NULL)
  ('Схема: Вечно горящий фонарь', 'Вечно горящий фонарь', 'uncommon', null, null),  -- каталог common → схема uncommon
  ('Схема: Перчатки силы огра',   'Перчатки силы огра',   'rare', null, null),
  ('Схема: Повязка интеллекта',   'Повязка интеллекта',   'rare', null, null),
  ('Схема: Доспех, +1',           'Доспех, +1',           'very-rare', null, null),  -- уникальная, крафт 250

  -- Редкие (цель rare → схема very-rare), крафт 250 зм
  ('Схема: Амулет здоровья',            'Амулет здоровья',            'very-rare', 6000, null),
  ('Схема: Кольцо хранения заклинаний', 'Кольцо хранения заклинаний', 'very-rare', null, null),

  -- Кастомные (вплетённые): rarity NULL + craft_cost_gp override
  ('Схема: Плащ защиты (вплетено: поглощение стихий + доспехи мага)', 'Плащ защиты', null, null, 150),
  ('Схема: Кольцо защиты разума (вплетено: невидимость + гипнотик паттерн)', 'Кольцо защиты разума', null, null, 225),
  ('Схема: Оружие +1 (вплетено: Щит 1/день)', 'Оружие, +1', null, null, 100),
  ('Схема: Кольцо хранения заклинаний (вплетено: миззиевый аппарат)', 'Кольцо хранения заклинаний', null, 5000, 500),
  ('Схема: Плащ защиты +1 (вплетено: Щит)', 'Плащ защиты', null, null, 75)  -- «Щит +1» из списка = плащ защиты+1 с закл. Щит
),
ins as (
  insert into nodes (campaign_id, type_id, title, fields)
  select (select id from camp), (select id from itype), s.schema_title,
         case when s.craft_cost_gp is not null
              then jsonb_build_object('craft_cost_gp', s.craft_cost_gp)
              else '{}'::jsonb end
    from seed s
   where not exists (
     select 1 from nodes nd
      where nd.campaign_id = (select id from camp)
        and nd.type_id     = (select id from itype)
        and nd.title       = s.schema_title
   )
  returning id, title
)
insert into item_attributes
  (node_id, category_slug, rarity, price_gp, use_default_price, requires_attunement, source_slug, schema_for_node_id)
select ins.id, 'schema', s.schema_rarity, s.price_gp, false, false, null,
       (select nd.id from nodes nd
         where nd.campaign_id = (select id from camp)
           and nd.type_id     = (select id from itype)
           and nd.title       = s.target_title
         limit 1)
  from ins
  join seed s on s.schema_title = ins.title;

commit;

-- ─────────────────────────── Verify ───────────────────────────
select case
  when (select count(*) from nodes nd
          join node_types nt on nt.id = nd.type_id
          join campaigns c   on c.id  = nd.campaign_id
          join item_attributes ia on ia.node_id = nd.id
         where c.slug = 'mat-ucheniya' and nt.slug = 'item'
           and ia.category_slug = 'schema') >= 28
   -- ровно 5 кастомов (rarity NULL) с craft_cost_gp override
   and (select count(*) from nodes nd
          join item_attributes ia on ia.node_id = nd.id
          join campaigns c on c.id = nd.campaign_id
         where c.slug = 'mat-ucheniya' and ia.category_slug = 'schema'
           and ia.rarity is null and nd.fields ? 'craft_cost_gp') = 5
   -- все схемы слинкованы с целью (0 без цели)
   and (select count(*) from nodes nd
          join item_attributes ia on ia.node_id = nd.id
          join campaigns c on c.id = nd.campaign_id
         where c.slug = 'mat-ucheniya' and ia.category_slug = 'schema'
           and ia.schema_for_node_id is null) = 0
  then '✅ 28 схем крафта (5 кастомов с craft_cost_gp, все слинкованы с целью)'
  else '❌ миграция 129 неполная'
end as result;

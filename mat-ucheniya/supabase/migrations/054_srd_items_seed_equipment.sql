-- Migration 054 — PHB equipment seed (delta over 044).
-- Adds 82 PHB adventuring gear items missing from the base seed,
-- plus a conditional rename of `whetstone` from «Точило»
-- (informal/slangy) to «Точильный камень» (proper PHB translation).
--
-- Source: dnd.su/articles/inventory/98-equipment. PHB.
--
-- Coverage:
--   * 70 standalone items (gear, ammunition, containers, light
--     sources, clothes, tools, etc.)
--   * 5 arcane spellcasting foci (wand, rod, crystal, staff, orb)
--   * 3 holy symbols (amulet, reliquary, emblem)
--   * 4 druidic foci (mistletoe, wooden staff, yew wand, totem)
--
-- Skipped (already in seed from mig 044):
--   alchemists-fire, rope-hempen-50ft, potion-of-healing,
--   mirror-steel, acid-vial, healers-kit, oil-flask,
--   tent-two-person, antitoxin-vial (=Противоядие), backpack,
--   holy-water-flask, bedroll (=Спальник), mess-kit
--   (=Столовый набор), whetstone (rename below), torch,
--   lantern-hooded, poison-basic-vial.
--
-- All entries: category='misc', rarity=null, slot=null,
-- source_slug='srd-5e'. Foci use 'misc' (no spell-focus category in
-- our taxonomy; tools = proficiency-gated only).
--
-- Phase 1.5: conditional rename of `whetstone` from «Точило» to
-- «Точильный камень». Only runs if title still equals the original
-- 044 default; DM manual edits preserved.
--
-- Phase 2 backfill: standard.

begin;

-- ─────────────────────────── Phase 1: seed ───────────────────────────

do $$
declare
  c_rec record;
  type_id_v uuid;
  ins_count int;
begin
  for c_rec in select id, slug from campaigns order by created_at loop
    select id into type_id_v from node_types
      where campaign_id = c_rec.id and slug = 'item'
      limit 1;

    if type_id_v is null then
      raise notice 'Campaign % (%): no node_type=item, skipping seed',
        c_rec.slug, c_rec.id;
      continue;
    end if;

    with seed(
      srd_slug, title_ru, description_ru,
      category, rarity, price_gp, weight_lb, slot
    ) as (values
      -- Standalone gear
      ('abacus', 'Абак', 'Счётная доска для арифметики.', 'misc', null, 2, 2, null),
      ('crossbow-bolts', 'Арбалетные болты (20)', 'Боеприпасы для арбалетов. 20 штук в связке.', 'misc', null, 1, 1.5, null),
      ('block-and-tackle', 'Блок и лебёдка', 'Блоки и тросы с крюками. Позволяет поднимать в 4 раза больше обычного.', 'misc', null, 1, 5, null),
      ('barrel', 'Бочка', 'Деревянная бочка. Вместимость 40 галлонов / 4 куб. фута.', 'misc', null, 2, 70, null),
      ('paper-sheet', 'Бумага (один лист)', 'Один лист бумаги.', 'misc', null, 0.2, 0, null),
      ('waterskin', 'Бурдюк', 'Кожаный бурдюк. Вместимость 4 пинты. Вес указан в полном виде.', 'misc', null, 0.2, 5, null),
      ('bottle-glass', 'Бутылка, стеклянная', 'Стеклянная бутылка. Вместимость 1.5 пинты.', 'misc', null, 2, 2, null),
      ('bucket', 'Ведро', 'Ведро. Вместимость 3 галлона / 0.5 куб. фута.', 'misc', null, 0.05, 2, null),
      ('rope-silk-50ft', 'Верёвка шёлковая, 50 футов', '50 футов шёлковой верёвки. 2 HP, разрывается проверкой Силы Сл 17.', 'misc', null, 10, 5, null),
      ('scale-merchants', 'Весы, торговые', 'Рычажные весы с грузиками на 2 фунта. Точное измерение веса драгоценностей и товаров.', 'misc', null, 5, 3, null),
      ('wax', 'Воск', 'Кусок воска. Для печатей и других мелких нужд.', 'misc', null, 0.5, 0, null),
      ('pot-iron', 'Горшок, железный', 'Чугунный горшок. Вместимость 1 галлон.', 'misc', null, 2, 10, null),
      ('perfume-vial', 'Духи (флакон)', 'Флакон духов.', 'misc', null, 5, 0, null),
      ('blowgun-needles', 'Иглы для трубки (50)', 'Боеприпасы для духовой трубки. 50 штук.', 'misc', null, 1, 1, null),
      ('lock', 'Замок', 'Замок с ключом. Без ключа — Лвк Сл 15 воровскими инструментами.', 'misc', null, 10, 1, null),
      ('caltrops', 'Калтропы (20 в сумке)', 'Действием рассыпать на 5×5 фт. Спасбросок Лвк Сл 15 — иначе 1 колющий + остановка хода + −10 фт скорости до восстановления HP.', 'misc', null, 1, 2, null),
      ('manacles', 'Кандалы', 'Сковывают существ Маленького/Среднего размера. Побег — Лвк Сл 20, поломка — Сила Сл 20. С ключом; без ключа — Лвк Сл 15. 15 HP.', 'misc', null, 2, 6, null),
      ('miners-pick', 'Кирка, горняцкая', 'Шахтёрская кирка для копания.', 'misc', null, 2, 10, null),
      ('book', 'Книга', 'Кожаный том со стихами, документами или иной информацией.', 'misc', null, 25, 5, null),
      ('spellbook', 'Книга заклинаний', '100 пустых пергаментных страниц для записи заклинаний волшебника.', 'misc', null, 50, 3, null),
      ('bell', 'Колокольчик', 'Маленький колокольчик.', 'misc', null, 1, 0, null),
      ('quiver', 'Колчан', 'Помещается 20 стрел.', 'misc', null, 1, 1, null),
      ('signet-ring', 'Кольцо-печатка', 'Перстень с гербовой печатью.', 'misc', null, 5, 0, null),
      ('climbers-kit', 'Комплект для лазания', 'Шлямбуры, накладные подошвы, перчатки, страховка. Действием закрепиться: не упасть более чем на 25 фт от точки крепления.', 'misc', null, 25, 12, null),
      ('fishing-tackle', 'Комплект для рыбалки', 'Удилище, шёлковая леска, поплавок, крючки, грузила, приманки, мелкоячеистая сеть.', 'misc', null, 1, 4, null),
      ('crossbow-bolt-case', 'Контейнер для арбалетных болтов', 'Деревянный контейнер на 20 болтов.', 'misc', null, 1, 1, null),
      ('map-case', 'Контейнер для карт и свитков', 'Кожаный тубус. До 10 листов бумаги или 5 листов пергамента.', 'misc', null, 1, 1, null),
      ('basket', 'Корзина', 'Плетёная корзина. Вместимость 2 куб. фута / 40 фунтов.', 'misc', null, 0.4, 2, null),
      ('pouch', 'Кошель', 'Кожаный или тканевый кошель. До 20 снарядов для пращи или 50 игл для трубки.', 'misc', null, 0.5, 1, null),
      ('grappling-hook', 'Крюк-кошка', 'Металлический крюк для лазания и зацепа.', 'misc', null, 2, 4, null),
      ('jug', 'Кувшин или графин', 'Кувшин или графин. Вместимость 1 галлон.', 'misc', null, 0.02, 4, null),
      ('lamp', 'Лампа', 'Яркий свет 15 фт + тусклый ещё 30 фт. 6 часов от 1 пинты масла.', 'misc', null, 0.5, 1, null),
      ('ladder-10ft', 'Лестница (10 футов)', 'Деревянная лестница 10 футов.', 'misc', null, 0.1, 25, null),
      ('crowbar', 'Ломик', 'Преимущество на проверки Силы, где помогает рычаг.', 'misc', null, 2, 5, null),
      ('shovel', 'Лопата', 'Обычная лопата для копания.', 'misc', null, 2, 5, null),
      ('chalk', 'Мел (1 кусочек)', 'Один кусочек мела.', 'misc', null, 0.01, 0, null),
      ('ball-bearings', 'Металлические шарики (1000)', 'Действием рассыпать на 10×10 фт. Спасбросок Лвк Сл 10 — иначе ничком.', 'misc', null, 1, 2, null),
      ('sack', 'Мешок', 'Простой мешок. Вместимость 1 куб. фут / 30 фунтов.', 'misc', null, 0.01, 0.5, null),
      ('component-pouch', 'Мешочек с компонентами', 'Водонепроницаемый поясной кошель с отделениями. Заменяет материальные компоненты заклинаний без указанной стоимости.', 'misc', null, 25, 2, null),
      ('hammer-blacksmiths', 'Молот, кузнечный', 'Тяжёлый кузнечный молот.', 'misc', null, 2, 10, null),
      ('hammer', 'Молоток', 'Обычный молоток.', 'misc', null, 1, 3, null),
      ('soap', 'Мыло', 'Кусок мыла.', 'misc', null, 0.02, 0, null),
      ('clothes-traveler', 'Одежда, дорожная', 'Прочная одежда для путешествий.', 'misc', null, 2, 4, null),
      ('clothes-costume', 'Одежда, костюм', 'Костюм для маскарадов и выступлений.', 'misc', null, 5, 4, null),
      ('clothes-common', 'Одежда, обычная', 'Простая повседневная одежда.', 'misc', null, 0.5, 3, null),
      ('clothes-fine', 'Одежда, отличная', 'Дорогая одежда для приёмов и аудиенций.', 'misc', null, 15, 6, null),
      ('blanket', 'Одеяло', 'Шерстяное одеяло.', 'misc', null, 0.5, 3, null),
      ('hunting-trap', 'Охотничий капкан', 'Действием установить. Спасбросок Лвк Сл 13 — иначе 1d4 колющий + остановка. Высвобождение — Сила Сл 13 (провал = 1 колющий).', 'misc', null, 5, 25, null),
      ('parchment-sheet', 'Пергамент (один лист)', 'Один лист пергамента.', 'misc', null, 0.1, 0, null),
      ('hourglass', 'Песочные часы', 'Песочные часы.', 'misc', null, 25, 1, null),
      ('quill', 'Писчее перо', 'Перо для письма.', 'misc', null, 0.02, 0, null),
      ('spyglass', 'Подзорная труба', 'Увеличивает изображение в 2 раза.', 'misc', null, 1000, 1, null),
      ('rations', 'Рационы (1 день)', 'Обезвоженная пища на 1 день: вяленое мясо, сухофрукты, галеты, орехи.', 'misc', null, 0.5, 2, null),
      ('robes', 'Ряса', 'Длинная ряса (одежда монаха или жреца).', 'misc', null, 1, 4, null),
      ('candle', 'Свеча', 'Горит 1 час. Яркий свет 5 фт + тусклый ещё 5 фт.', 'misc', null, 0.01, 0, null),
      ('sling-bullets', 'Снаряды для пращи (20)', 'Боеприпасы для пращи. 20 штук.', 'misc', null, 0.04, 1.5, null),
      ('signal-whistle', 'Сигнальный свисток', 'Громкий свисток для подачи сигналов.', 'misc', null, 0.05, 0, null),
      ('arrows', 'Стрелы (20)', 'Боеприпасы для луков. 20 штук в связке.', 'misc', null, 1, 1, null),
      ('chest', 'Сундук', 'Деревянный сундук. Вместимость 12 куб. фута / 300 фунтов.', 'misc', null, 5, 25, null),
      ('ram-portable', 'Таран, портативный', '+4 к проверкам Силы для выбивания дверей; преимущество с помощником.', 'misc', null, 4, 35, null),
      ('tinderbox', 'Трутница', 'Кремень, кресало, трут. Действием поджечь факел; 1 минута для другого огня.', 'misc', null, 0.5, 1, null),
      ('magnifying-glass', 'Увеличительное стекло', 'Линза. Преимущество к проверкам осмотра мелких/детализированных предметов. Можно разжечь огонь на солнце за 5 мин.', 'misc', null, 100, 0, null),
      ('vial', 'Флакон', 'Стеклянный флакон. Вместимость 4 унции / 100 г.', 'misc', null, 1, 0, null),
      ('tankard', 'Фляга или большая кружка', 'Фляга или кружка. Вместимость 1 пинта.', 'misc', null, 0.02, 1, null),
      ('lantern-bullseye', 'Фонарь, направленный', 'Яркий свет 60-фт конусом + тусклый ещё 60 фт. 6 часов от 1 пинты масла.', 'misc', null, 10, 2, null),
      ('chain-10ft', 'Цепь (10 футов)', '10 футов цепи. 10 HP, разрывается Сила Сл 20.', 'misc', null, 5, 10, null),
      ('ink-bottle', 'Чернила (бутылочка 30 г)', 'Бутылочка чернил для письма.', 'misc', null, 10, 0, null),
      ('pole-10ft', 'Шест (10 футов)', '10-футовый деревянный шест.', 'misc', null, 0.05, 7, null),
      ('iron-spikes', 'Шипы, железные (10)', '10 железных шипов для крепления, ловушек, заклинивания дверей.', 'misc', null, 1, 5, null),
      ('piton', 'Шлямбур', 'Железный костыль для скалолазания.', 'misc', null, 0.05, 0.25, null),

      -- Arcane spellcasting foci
      ('arcane-focus-wand', 'Волшебная палочка (фокусировка)', 'Магическая фокусировка волшебников/колдунов/чародеев. Заменяет материальные компоненты без стоимости.', 'misc', null, 10, 1, null),
      ('arcane-focus-rod', 'Жезл (фокусировка)', 'Магическая фокусировка волшебников/колдунов/чародеев.', 'misc', null, 10, 2, null),
      ('arcane-focus-crystal', 'Кристалл (фокусировка)', 'Магическая фокусировка волшебников/колдунов/чародеев.', 'misc', null, 10, 1, null),
      ('arcane-focus-staff', 'Посох (фокусировка)', 'Магическая фокусировка волшебников/колдунов/чародеев. Та же палка, что боевой посох, но с особой подготовкой.', 'misc', null, 5, 4, null),
      ('arcane-focus-orb', 'Сфера (фокусировка)', 'Магическая фокусировка волшебников/колдунов/чародеев.', 'misc', null, 20, 3, null),

      -- Holy symbols
      ('holy-symbol-amulet', 'Амулет (священный символ)', 'Священный символ — амулет с символом божества. Носится у всех на виду.', 'misc', null, 5, 1, null),
      ('holy-symbol-reliquary', 'Реликварий', 'Священный символ — коробочка со священной реликвией.', 'misc', null, 5, 2, null),
      ('holy-symbol-emblem', 'Эмблема (священный символ)', 'Священный символ — эмблема, выгравированная или выложенная камнями на щите.', 'misc', null, 5, 0, null),

      -- Druidic foci
      ('druidic-focus-mistletoe', 'Веточка омелы', 'Фокусировка друида.', 'misc', null, 1, 0, null),
      ('druidic-focus-wooden-staff', 'Деревянный посох (фокусировка друида)', 'Фокусировка друида — посох из живого дерева.', 'misc', null, 5, 4, null),
      ('druidic-focus-yew-wand', 'Тисовая палочка', 'Фокусировка друида — палочка из тиса или другого дерева.', 'misc', null, 10, 1, null),
      ('druidic-focus-totem', 'Тотем (фокусировка друида)', 'Фокусировка друида — тотем с перьями, мехом, костями и зубами священных животных.', 'misc', null, 1, 0, null)
    ),
    typed_seed as (
      select
        srd_slug::text,
        title_ru::text,
        description_ru::text,
        category::text,
        rarity::text,
        price_gp::numeric,
        weight_lb::numeric,
        slot::text
      from seed
    ),
    inserted as (
      insert into nodes (campaign_id, type_id, title, fields)
      select
        c_rec.id,
        type_id_v,
        s.title_ru,
        jsonb_strip_nulls(jsonb_build_object(
          'srd_slug', s.srd_slug,
          'description', s.description_ru
        ))
      from typed_seed s
      where not exists (
        select 1 from nodes n
        where n.campaign_id = c_rec.id
          and n.fields->>'srd_slug' = s.srd_slug
      )
      returning id, fields->>'srd_slug' as srd_slug
    )
    insert into item_attributes (
      node_id, category_slug, rarity, price_gp, weight_lb,
      slot_slug, source_slug, availability_slug
    )
    select
      i.id, s.category, s.rarity, s.price_gp, s.weight_lb,
      s.slot, 'srd-5e', null
    from inserted i
    join typed_seed s on s.srd_slug = i.srd_slug
    on conflict (node_id) do nothing;

    get diagnostics ins_count = row_count;
    raise notice 'Campaign % (%): inserted % new equipment items (mig 054)',
      c_rec.slug, c_rec.id, ins_count;
  end loop;
end $$;

-- ─────────────────────────── Phase 1.5: rename ───────────────────────────
-- Conditional rename of `whetstone` from «Точило» (informal) to
-- «Точильный камень» (proper PHB translation per dnd.su).
-- Only runs if title still equals the original 044 default; DM
-- manual edits preserved.

do $$
declare
  c_rec record;
  rn_count int;
begin
  for c_rec in select id, slug from campaigns order by created_at loop
    update nodes
    set title = 'Точильный камень'
    where campaign_id = c_rec.id
      and fields->>'srd_slug' = 'whetstone'
      and title = 'Точило';

    get diagnostics rn_count = row_count;
    raise notice 'Campaign % (%): renamed % whetstone rows (mig 054)',
      c_rec.slug, c_rec.id, rn_count;
  end loop;
end $$;

-- ─────────────────────────── Phase 2: backfill ───────────────────────────

do $$
declare
  c_rec record;
  bf_count int;
begin
  for c_rec in select id, slug from campaigns order by created_at loop
    update transactions tx
    set item_node_id = n.id
    from nodes n
    inner join item_attributes ia on ia.node_id = n.id
    where tx.campaign_id = c_rec.id
      and tx.kind = 'item'
      and tx.item_node_id is null
      and n.campaign_id = c_rec.id
      and ia.source_slug = 'srd-5e'
      and (
        lower(trim(tx.item_name)) = lower(trim(n.title))
        or lower(trim(coalesce(tx.item_name, ''))) = lower(coalesce(n.fields->>'srd_slug', ''))
      );

    get diagnostics bf_count = row_count;
    raise notice 'Campaign % (%): backfilled % transactions (mig 054)',
      c_rec.slug, c_rec.id, bf_count;
  end loop;
end $$;

commit;

-- Verification (run manually if desired):
--   select c.slug, count(n.id) as new_equipment_count
--     from campaigns c
--     left join nodes n on n.campaign_id = c.id
--                       and n.fields->>'srd_slug' in (
--                         'abacus','crossbow-bolts','block-and-tackle','barrel',
--                         'paper-sheet','waterskin','bottle-glass','bucket',
--                         'rope-silk-50ft','scale-merchants','wax','pot-iron',
--                         'perfume-vial','blowgun-needles','lock','caltrops',
--                         'manacles','miners-pick','book','spellbook','bell',
--                         'quiver','signet-ring','climbers-kit','fishing-tackle',
--                         'crossbow-bolt-case','map-case','basket','pouch',
--                         'grappling-hook','jug','lamp','ladder-10ft','crowbar',
--                         'shovel','chalk','ball-bearings','sack','component-pouch',
--                         'hammer-blacksmiths','hammer','soap','clothes-traveler',
--                         'clothes-costume','clothes-common','clothes-fine',
--                         'blanket','hunting-trap','parchment-sheet','hourglass',
--                         'quill','spyglass','rations','robes','candle',
--                         'sling-bullets','signal-whistle','arrows','chest',
--                         'ram-portable','tinderbox','magnifying-glass','vial',
--                         'tankard','lantern-bullseye','chain-10ft','ink-bottle',
--                         'pole-10ft','iron-spikes','piton',
--                         'arcane-focus-wand','arcane-focus-rod','arcane-focus-crystal',
--                         'arcane-focus-staff','arcane-focus-orb',
--                         'holy-symbol-amulet','holy-symbol-reliquary',
--                         'holy-symbol-emblem',
--                         'druidic-focus-mistletoe','druidic-focus-wooden-staff',
--                         'druidic-focus-yew-wand','druidic-focus-totem'
--                       )
--     group by c.slug order by c.slug;
--   -- expect 82 per campaign for fresh seeding.

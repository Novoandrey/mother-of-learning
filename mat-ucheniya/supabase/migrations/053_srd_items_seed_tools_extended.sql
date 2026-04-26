-- Migration 053 — extended tools seed (delta over 044).
-- Adds 36 PHB+XGE tools missing from the original SRD seed:
--   * 5 standalone kits (navigators, poisoners, disguise, forgery,
--                        herbalism)
--   * 4 gaming sets (dragonchess, playing cards, dice,
--                     three-dragon ante)
--   * 10 musical instruments (drum, viol, bagpipes, lyre, lute,
--                              horn, pan flute, flute, dulcimer, shawm)
--   * 17 artisan tools (alchemists, potters, calligraphers, masons,
--                        cartographers, leatherworkers, smiths,
--                        brewers, carpenters, cooks, woodcarvers,
--                        tinkers, cobblers, glassblowers, weavers,
--                        painters, jewelers)
--
-- Source: dnd.su/articles/inventory/100-tools (PHB + XGE).
-- Same per-campaign DO loop pattern as 044/046/049-052. Idempotent
-- via NOT EXISTS (campaign_id, srd_slug). Re-running is safe.
--
-- Existing 'thieves-tools' from mig 044 is intentionally not touched.
-- 'healers-kit' (mig 044) keeps category='tool' for now though it's
-- technically PHB adventuring gear, not a tool with proficiency —
-- noted as a follow-up cleanup if it causes filter friction.
--
-- All entries: category='tool', rarity=null, slot=null,
-- source_slug='srd-5e'. Price conversions from PHB
-- (1 sm = 0.1 gp, 1 cm = 0.01 gp).
--
-- Phase 2 backfill is intentionally re-run.

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
      -- Standalone kits
      ('navigators-tools', 'Инструменты навигатора', 'Секстант, компас, циркуль, перо, чернила, пергамент. Прокладка курса в море, чтение морских карт.', 'tool', null, 25, 2, null),
      ('poisoners-kit', 'Инструменты отравителя', 'Склянки, ступка, реагенты. Создание и применение ядов; БМ к проверкам с ядами.', 'tool', null, 50, 2, null),
      ('disguise-kit', 'Набор для грима', 'Косметика, краски для волос, реквизит, наряды. Изменение внешности, маскировка.', 'tool', null, 25, 3, null),
      ('forgery-kit', 'Набор для фальсификации', 'Бумаги, перья, чернила, печати, сургуч, фольга. Подделка документов и подписей.', 'tool', null, 15, 5, null),
      ('herbalism-kit', 'Набор травника', 'Мешочки, ступка, флаконы. Сбор трав, опознание растений. Требуется для создания зелья лечения и противоядия.', 'tool', null, 5, 3, null),

      -- Gaming sets
      ('dragonchess-set', 'Драконьи шахматы', 'Игровой набор. Стратегическая настольная игра.', 'tool', null, 1, 0.5, null),
      ('playing-card-set', 'Карты (игровой набор)', 'Игровой набор. Колода карт для азартных игр.', 'tool', null, 0.5, 0, null),
      ('dice-set', 'Кости (игровой набор)', 'Игровой набор. Кости для азартных игр.', 'tool', null, 0.1, 0, null),
      ('three-dragon-ante-set', 'Ставка трёх драконов', 'Игровой набор. Карточная игра в Фаэруне.', 'tool', null, 1, 0, null),

      -- Musical instruments
      ('drum', 'Барабан', 'Музыкальный инструмент. Может использоваться бардом как фокусировка.', 'tool', null, 6, 3, null),
      ('viol', 'Виола', 'Музыкальный инструмент. Струнный, играют смычком. Может использоваться бардом как фокусировка.', 'tool', null, 30, 1, null),
      ('bagpipes', 'Волынка', 'Музыкальный инструмент. Духовой с мехами. Может использоваться бардом как фокусировка.', 'tool', null, 30, 6, null),
      ('lyre', 'Лира', 'Музыкальный инструмент. Струнный. Может использоваться бардом как фокусировка.', 'tool', null, 30, 2, null),
      ('lute', 'Лютня', 'Музыкальный инструмент. Струнный. Может использоваться бардом как фокусировка.', 'tool', null, 35, 2, null),
      ('horn', 'Рожок', 'Музыкальный инструмент. Духовой. Может использоваться бардом как фокусировка.', 'tool', null, 3, 2, null),
      ('pan-flute', 'Свирель', 'Музыкальный инструмент. Деревянная духовая (флейта Пана). Может использоваться бардом как фокусировка.', 'tool', null, 12, 2, null),
      ('flute', 'Флейта', 'Музыкальный инструмент. Деревянная духовая. Может использоваться бардом как фокусировка.', 'tool', null, 2, 1, null),
      ('dulcimer', 'Цимбалы', 'Музыкальный инструмент. Струнный с молоточками. Может использоваться бардом как фокусировка.', 'tool', null, 25, 10, null),
      ('shawm', 'Шалмей', 'Музыкальный инструмент. Деревянный духовой с двойной тростью. Может использоваться бардом как фокусировка.', 'tool', null, 2, 1, null),

      -- Artisan tools
      ('alchemists-supplies', 'Инструменты алхимика', 'Мензурки, реагенты, ступка, пестик. Создание кислоты, алхимического огня, масла, противоядия, духов, мыла.', 'tool', null, 50, 8, null),
      ('potters-tools', 'Инструменты гончара', 'Иглы, цикли, скребки, нож, кронциркуль. Изготовление и опознание керамики.', 'tool', null, 10, 3, null),
      ('calligraphers-supplies', 'Инструменты каллиграфа', 'Чернила, пергамент, три писчих пера. Каллиграфия, экспертиза рукописей и подписей.', 'tool', null, 10, 5, null),
      ('masons-tools', 'Инструменты каменщика', 'Мастерок, молоток, долото, щётки, угольник. Каменное зодчество; двойной урон каменным строениям.', 'tool', null, 10, 8, null),
      ('cartographers-tools', 'Инструменты картографа', 'Перо, чернила, пергамент, циркуль, кронциркуль, линейка. Составление и расшифровка карт.', 'tool', null, 15, 6, null),
      ('leatherworkers-tools', 'Инструменты кожевника', 'Резак, киянка, канавкорез, пробойник, нить, кожа. Работа с кожей и шкурами; БМ к осмотру кожаных предметов.', 'tool', null, 5, 5, null),
      ('smiths-tools', 'Инструменты кузнеца', 'Молоты, клещи, уголь, ветошь, точильный камень. Обработка металла; +10 HP металлическому предмету за 1 час работы.', 'tool', null, 20, 8, null),
      ('brewers-supplies', 'Инструменты пивовара', 'Бутыль, хмель, сифон, змеевик, трубки. Пивоварение; очистка до 6 галлонов воды на длинном отдыхе.', 'tool', null, 20, 9, null),
      ('carpenters-tools', 'Инструменты плотника', 'Пила, молоток, гвозди, топор, угольник, рубанок, стамеска. Деревянные сооружения; укрепление двери (+5 к Сл выбивания).', 'tool', null, 8, 6, null),
      ('cooks-utensils', 'Инструменты повара', 'Котёл, ножи, вилки, ложка, половник. На коротком отдыхе — +1 HP за каждую потраченную Кость Хитов до 5 союзникам.', 'tool', null, 1, 8, null),
      ('woodcarvers-tools', 'Инструменты резчика по дереву', 'Нож, стамеска, маленькая пила. Резьба по дереву; до 5 стрел на коротком отдыхе, до 20 на длинном.', 'tool', null, 1, 5, null),
      ('tinkers-tools', 'Инструменты ремонтника', 'Ручные инструменты, нитки, иголки, точильный камень, ткань, кожа, клей. +10 HP повреждённому предмету за 1 час.', 'tool', null, 50, 10, null),
      ('cobblers-tools', 'Инструменты сапожника', 'Молоток, шило, нож, обувная колодка, ножницы, кожа, нитки. Починка обуви; до 6 союзников ходят 10 ч/день без спасбросков от истощения.', 'tool', null, 5, 5, null),
      ('glassblowers-tools', 'Инструменты стеклодува', 'Трубка для выдувания, обкатка, катальник, развёртки, щипцы. Стеклодувное дело; нужен источник тепла.', 'tool', null, 30, 5, null),
      ('weavers-tools', 'Инструменты ткача', 'Нитки, иголки, куски ткани. Шитьё одежды; починка предмета одежды на коротком отдыхе.', 'tool', null, 1, 5, null),
      ('painters-supplies', 'Инструменты художника', 'Мольберт, холст, краски, кисти, угольные карандаши, палитра. Живопись; БМ к Магии/Истории/Религии при осмотре произведений искусства.', 'tool', null, 10, 5, null),
      ('jewelers-tools', 'Инструменты ювелира', 'Пилка, молоточек, напильники, щипцы, пинцет. Опознание и оценка драгоценностей.', 'tool', null, 25, 2, null)
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
    raise notice 'Campaign % (%): inserted % new tool items (mig 053)',
      c_rec.slug, c_rec.id, ins_count;
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
    raise notice 'Campaign % (%): backfilled % transactions (mig 053)',
      c_rec.slug, c_rec.id, bf_count;
  end loop;
end $$;

commit;

-- Verification (run manually if desired):
--   select c.slug, count(n.id) as new_tool_count
--     from campaigns c
--     left join nodes n on n.campaign_id = c.id
--                       and n.fields->>'srd_slug' in (
--                         'navigators-tools', 'poisoners-kit', 'disguise-kit',
--                         'forgery-kit', 'herbalism-kit',
--                         'dragonchess-set', 'playing-card-set', 'dice-set',
--                         'three-dragon-ante-set',
--                         'drum', 'viol', 'bagpipes', 'lyre', 'lute',
--                         'horn', 'pan-flute', 'flute', 'dulcimer', 'shawm',
--                         'alchemists-supplies', 'potters-tools',
--                         'calligraphers-supplies', 'masons-tools',
--                         'cartographers-tools', 'leatherworkers-tools',
--                         'smiths-tools', 'brewers-supplies',
--                         'carpenters-tools', 'cooks-utensils',
--                         'woodcarvers-tools', 'tinkers-tools',
--                         'cobblers-tools', 'glassblowers-tools',
--                         'weavers-tools', 'painters-supplies',
--                         'jewelers-tools'
--                       )
--     group by c.slug order by c.slug;
--   -- expect 36 per campaign for fresh seeding.

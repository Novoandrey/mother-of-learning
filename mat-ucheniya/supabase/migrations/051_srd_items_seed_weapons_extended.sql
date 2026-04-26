-- Migration 051 — extended weapons seed (delta over 044 + 046).
-- Adds 30 weapons missing from the base SRD seed:
--   * 5 simple melee (club, light hammer, javelin, greatclub, handaxe)
--   * 3 simple ranged (light crossbow, dart, sling)
--   * 12 martial melee (war pick, warhammer, glaive, lance, whip,
--                        morningstar, pike, rapier, greataxe,
--                        scimitar, trident, flail)
--   * 2 martial ranged (blowgun, net)
--   * 3 Renaissance firearms (pistol, musket, bullets-10pack)
--   * 5 Modern firearms (auto pistol, revolver, hunting rifle,
--                         auto rifle, shotgun)
--
-- Source: dnd.su/articles/inventory/96-arms (PHB) + DMG firearms
-- table. Same per-campaign DO loop as 044 / 046 / 049 / 050.
-- Idempotent via NOT EXISTS (campaign_id, srd_slug). Re-running is
-- safe; DM edits to titles / prices / descriptions persist.
--
-- Conventions:
--   * category='weapon' for combat items, 'misc' for ammunition pack
--   * source_slug='srd-5e' (firearms are DMG-Renaissance/Modern,
--     not strict SRD — kept under same source slug for now; book
--     attribution noted in description prose)
--   * rarity=null (all mundane)
--   * Slot mapping:
--       '1-handed'  — light/finesse 1H melee, primary-melee throwables
--       '2-handed'  — heavy 2H melee, 2H ranged
--       'versatile' — usable 1H or 2H (warhammer, trident)
--       'ranged'    — primary-use ranged (crossbows, firearms, net,
--                     blowgun, sling, dart)
--       null        — non-equipment items (bullets pack)
--   * Modern firearms have price_gp=null — dnd.su lists «—»
--     (DM-controlled, not standard merchant inventory)
--
-- Phase 2 backfill is intentionally re-run: catches transactions
-- whose item_name happens to match one of the new titles or slugs.

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
      -- Simple melee
      ('club', 'Дубинка', 'Простое лёгкое оружие. 1d4 дробящий.', 'weapon', null, 0.1, 2, '1-handed'),
      ('light-hammer', 'Лёгкий молот', 'Простое лёгкое оружие. 1d4 дробящий, метательное (20/60).', 'weapon', null, 2, 2, '1-handed'),
      ('javelin', 'Метательное копьё', 'Простое метательное копьё. 1d6 колющий, дальность 30/120 фт.', 'weapon', null, 0.5, 2, '1-handed'),
      ('greatclub', 'Палица', 'Простая двуручная дубина. 1d8 дробящий.', 'weapon', null, 0.2, 10, '2-handed'),
      ('handaxe', 'Ручной топор', 'Простое лёгкое оружие. 1d6 рубящий, метательное (20/60).', 'weapon', null, 5, 2, '1-handed'),

      -- Simple ranged
      ('light-crossbow', 'Арбалет, лёгкий', 'Простой двуручный арбалет. 1d8 колющий, дальность 80/320, перезарядка.', 'weapon', null, 25, 5, 'ranged'),
      ('dart', 'Дротик', 'Простой метательный дротик. 1d4 колющий, дальность 20/60, фехтовальное.', 'weapon', null, 0.05, 0.25, 'ranged'),
      ('sling', 'Праща', 'Простая праща. 1d4 дробящий, дальность 30/120.', 'weapon', null, 0.1, 0, 'ranged'),

      -- Martial melee
      ('war-pick', 'Боевая кирка', 'Воинская одноручная кирка. 1d8 колющий.', 'weapon', null, 5, 2, '1-handed'),
      ('warhammer', 'Боевой молот', 'Воинский универсальный молот. 1d8 (одной), 1d10 (двумя). Дробящий.', 'weapon', null, 15, 2, 'versatile'),
      ('glaive', 'Глефа', 'Воинская двуручная глефа. 1d10 рубящий, досягаемость, тяжёлое.', 'weapon', null, 20, 6, '2-handed'),
      ('lance', 'Длинное копьё', 'Воинское длинное копьё. 1d12 колющий, досягаемость; помеха в пределах 5 фт. Без верховой — двуручное.', 'weapon', null, 10, 6, '2-handed'),
      ('whip', 'Кнут', 'Воинский фехтовальный кнут. 1d4 рубящий, досягаемость.', 'weapon', null, 2, 3, '1-handed'),
      ('morningstar', 'Моргенштерн', 'Воинский одноручный моргенштерн. 1d8 колющий.', 'weapon', null, 15, 4, '1-handed'),
      ('pike', 'Пика', 'Воинская двуручная пика. 1d10 колющий, досягаемость, тяжёлое.', 'weapon', null, 5, 18, '2-handed'),
      ('rapier', 'Рапира', 'Воинская фехтовальная рапира. 1d8 колющий.', 'weapon', null, 25, 2, '1-handed'),
      ('greataxe', 'Секира', 'Воинская двуручная секира. 1d12 рубящий, тяжёлое.', 'weapon', null, 30, 7, '2-handed'),
      ('scimitar', 'Скимитар', 'Воинский лёгкий скимитар. 1d6 рубящий, фехтовальное.', 'weapon', null, 25, 3, '1-handed'),
      ('trident', 'Трезубец', 'Воинский трезубец. 1d6 (одной), 1d8 (двумя). Метательное (20/60), колющий.', 'weapon', null, 5, 4, 'versatile'),
      ('flail', 'Цеп', 'Воинский одноручный цеп. 1d8 дробящий.', 'weapon', null, 10, 2, '1-handed'),

      -- Martial ranged
      ('blowgun', 'Духовая трубка', 'Воинская дальнобойная духовая трубка. 1 колющий, дальность 25/100, перезарядка.', 'weapon', null, 10, 1, 'ranged'),
      ('net', 'Сеть', 'Воинская метательная сеть. Без урона. 5/15 фт. Опутывает существ Большого размера и меньше; высвобождение — Сила Сл 10 действием или 5 рубящего урона. Одна атака за действие/бонус/реакцию.', 'weapon', null, 1, 3, 'ranged'),

      -- Firearms — Renaissance
      ('renaissance-pistol', 'Пистоль', 'Огнестрельное оружие эпохи Возрождения. 1d10 колющий, дальность 30/90, перезарядка.', 'weapon', null, 250, 3, 'ranged'),
      ('musket', 'Мушкет', 'Двуручное огнестрельное оружие эпохи Возрождения. 1d12 колющий, дальность 40/120, перезарядка.', 'weapon', null, 500, 10, 'ranged'),
      ('bullets-renaissance', 'Пули (10)', '10 пуль для огнестрельного оружия эпохи Возрождения (пистоль, мушкет).', 'misc', null, 3, 2, null),

      -- Firearms — Modern
      ('automatic-pistol', 'Пистолет, автоматический', 'Современное огнестрельное оружие. 2d6 колющий, дальность 50/150, боекомплект 15 выстрелов.', 'weapon', null, null, 3, 'ranged'),
      ('revolver', 'Револьвер', 'Современное огнестрельное оружие. 2d8 колющий, дальность 40/120, боекомплект 6 выстрелов.', 'weapon', null, null, 3, 'ranged'),
      ('hunting-rifle', 'Винтовка, охотничья', 'Современное двуручное оружие. 2d10 колющий, дальность 80/240, боекомплект 5 выстрелов.', 'weapon', null, null, 8, 'ranged'),
      ('automatic-rifle', 'Винтовка, автоматическая', 'Современное двуручное оружие. 2d8 колющий, дальность 80/240, боекомплект 30 выстрелов, очередь.', 'weapon', null, null, 8, 'ranged'),
      ('shotgun', 'Дробовик', 'Современное двуручное оружие. 2d8 колющий, дальность 30/90, боекомплект 2 выстрела.', 'weapon', null, null, 7, 'ranged')
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
    raise notice 'Campaign % (%): inserted % new weapon items (mig 051)',
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
    raise notice 'Campaign % (%): backfilled % transactions (mig 051)',
      c_rec.slug, c_rec.id, bf_count;
  end loop;
end $$;

commit;

-- Verification (run manually if desired):
--   select c.slug, count(n.id) as new_weapon_count
--     from campaigns c
--     left join nodes n on n.campaign_id = c.id
--                       and n.fields->>'srd_slug' in (
--                         'club', 'light-hammer', 'javelin', 'greatclub', 'handaxe',
--                         'light-crossbow', 'dart', 'sling',
--                         'war-pick', 'warhammer', 'glaive', 'lance', 'whip',
--                         'morningstar', 'pike', 'rapier', 'greataxe',
--                         'scimitar', 'trident', 'flail',
--                         'blowgun', 'net',
--                         'renaissance-pistol', 'musket', 'bullets-renaissance',
--                         'automatic-pistol', 'revolver', 'hunting-rifle',
--                         'automatic-rifle', 'shotgun'
--                       )
--     group by c.slug order by c.slug;
--   -- expect 30 per campaign for fresh seeding.

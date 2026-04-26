-- Migration 049 — poisons seed (delta over 044 + 046).
-- Adds 19 poisons from DMG, Van Richten's Guide to Ravenloft (VRGR),
-- Infernal Machine Rebuild (IMR), and Journeys through the Radiant
-- Citadel (JRC). Source mirrors dnd.su/articles/inventory/148-poisons.
--
-- Same per-campaign DO loop pattern as 044 / 046. Idempotent via
-- NOT EXISTS (campaign_id, srd_slug) — re-running is safe and DM
-- edits to title / price / description persist.
--
-- All entries: category='consumable' (matches the existing
-- `poison-basic-vial` from 044), rarity=null (5e poisons are mundane
-- non-magical), slot=null, weight=0 (vials are effectively
-- weightless), source_slug='srd-5e' (the catalog currently exposes
-- only 'srd-5e' / 'homebrew' — book attribution is preserved inline
-- in description prose, e.g. "Вдыхаемый (JRC). ...").
--
-- Five poisons (Дыхание Бизы, Кровь ликантропа, Пыль мумии,
-- Фессалтоксин, Шёпот Иваны) have no canonical price on dnd.su →
-- price_gp = null (treated as priceless / quest-only by item form
-- conventions, same as bag-of-holding-style entries already in seed).
--
-- Phase 2 backfill is intentionally re-run: catches transactions
-- whose item_name happens to match one of the new titles or slugs
-- (e.g. legacy "Яд дроу" purchases recorded as free-text item-tx).

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
      ('pale-tincture', 'Бледная настойка', 'Поглощаемый. Спасбросок Тел Сл 16; провал — 1d6 яда + отравление, повтор каждые 24 ч. Урон не лечится. После 7 успехов эффект кончается.', 'consumable', null, 250, 0, null),
      ('burnt-othur-fumes', 'Дым жжённого отура', 'Вдыхаемый. Спасбросок Тел Сл 13; провал — 3d6 яда + повтор в начале каждого хода (1d6 при провале). После 3 успехов эффект кончается.', 'consumable', null, 500, 0, null),
      ('bizas-breath', 'Дыхание Бизы', 'Вдыхаемый (JRC). Спасбросок Тел Сл 16; провал — отравлен 1 мин и должен атаковать случайную цель в досягаемости. Повтор в конце хода.', 'consumable', null, null, 0, null),
      ('malice', 'Злоба', 'Вдыхаемый. Спасбросок Тел Сл 15; провал — отравлен 1 час, ослеплён пока отравлен.', 'consumable', null, 250, 0, null),
      ('serpent-venom', 'Змеиный яд', 'Оружейный. Собирают с гигантской ядовитой змеи. Спасбросок Тел Сл 11; 3d6 яда при провале, половина при успехе.', 'consumable', null, 200, 0, null),
      ('assassins-blood', 'Кровь ассасина', 'Поглощаемый. Спасбросок Тел Сл 10; провал — 1d12 яда + отравлен 24 ч. Успех — половина урона, без отравления.', 'consumable', null, 150, 0, null),
      ('lycanthropic-blood', 'Кровь ликантропа', 'Оружейный (IMR). Кровь ликантропа в зверином/гибридном виде. Спасбросок Тел Сл 12; провал — проклят ликантропией (вид по к6/к10). Снимается «Снятием проклятья».', 'consumable', null, null, 0, null),
      ('oil-of-taggit', 'Масло таггита', 'Контактный. Спасбросок Тел Сл 13; провал — отравлен 24 ч и без сознания. Урон будит, но отравление остаётся.', 'consumable', null, 400, 0, null),
      ('midnight-tears', 'Полуночные слёзы', 'Поглощаемый. До полуночи никаких эффектов. Затем спасбросок Тел Сл 17; провал — 9d6 яда, успех — половина.', 'consumable', null, 1500, 0, null),
      ('mummys-dust', 'Пыль мумии', 'Вдыхаемый (IMR). Спасбросок Тел Сл 12; провал — проклят гнилью мумии: HP не лечатся, макс HP падает на 3d6 каждые 24 ч. На 0 — смерть, тело в пыль.', 'consumable', null, null, 0, null),
      ('carrion-crawler-mucus', 'Слизь ползающего падальщика', 'Контактный. Собирают с падальщика. Спасбросок Тел Сл 13; провал — отравлен 1 мин и парализован. Повтор в конце хода.', 'consumable', null, 200, 0, null),
      ('torpor', 'Ступор', 'Поглощаемый. Спасбросок Тел Сл 15; провал — отравлен 4d6 ч и недееспособен.', 'consumable', null, 600, 0, null),
      ('truth-serum', 'Сыворотка правды', 'Поглощаемый. Спасбросок Тел Сл 11; провал — отравлен 1 час и не может сознательно лгать (как «область истины»).', 'consumable', null, 150, 0, null),
      ('thessaltoxin', 'Фессалтоксин', 'Поглощаемый или оружейный (IMR). Спасбросок Тел Сл 15; провал — превращение в случайного зверя/существо, виденного за последние 24 ч (выбор Мастера), до конца следующего долгого отдыха. Снимается «Высшим восстановлением».', 'consumable', null, null, 0, null),
      ('ivanas-whisper', 'Шёпот Иваны', 'Вдыхаемый (VRGR). Спасбросок Тел Сл 18; провал — при следующем сне получает «вещий сон» от Иваны Борици. Немагический.', 'consumable', null, null, 0, null),
      ('essence-of-ether', 'Эссенция эфира', 'Вдыхаемый. Спасбросок Тел Сл 15; провал — отравлен 8 часов и без сознания. Урон или встряска будят.', 'consumable', null, 300, 0, null),
      ('wyvern-poison', 'Яд виверны', 'Оружейный. Собирают с виверны. Спасбросок Тел Сл 15; провал — 7d6 яда, успех — половина.', 'consumable', null, 1200, 0, null),
      ('drow-poison', 'Яд дроу', 'Оружейный. Изготавливают дроу без солнечного света. Спасбросок Тел Сл 13; провал — отравлен 1 час, при провале на 5+ — без сознания.', 'consumable', null, 200, 0, null),
      ('purple-worm-poison', 'Яд лилового червя', 'Оружейный. Собирают с лилового червя. Спасбросок Тел Сл 19; провал — 12d6 яда, успех — половина.', 'consumable', null, 2000, 0, null)
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
    raise notice 'Campaign % (%): inserted % new poison items (mig 049)',
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
    raise notice 'Campaign % (%): backfilled % transactions (mig 049)',
      c_rec.slug, c_rec.id, bf_count;
  end loop;
end $$;

commit;

-- Verification (run manually if desired):
--   select c.slug, count(n.id) as poison_count
--     from campaigns c
--     left join nodes n on n.campaign_id = c.id
--                       and n.fields->>'srd_slug' in (
--                         'pale-tincture', 'burnt-othur-fumes', 'bizas-breath',
--                         'malice', 'serpent-venom', 'assassins-blood',
--                         'lycanthropic-blood', 'oil-of-taggit', 'midnight-tears',
--                         'mummys-dust', 'carrion-crawler-mucus', 'torpor',
--                         'truth-serum', 'thessaltoxin', 'ivanas-whisper',
--                         'essence-of-ether', 'wyvern-poison', 'drow-poison',
--                         'purple-worm-poison'
--                       )
--     group by c.slug order by c.slug;
--   -- expect 19 per campaign for fresh seeding.

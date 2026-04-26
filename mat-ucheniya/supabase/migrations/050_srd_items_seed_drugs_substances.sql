-- Migration 050 — drugs & substances seed (delta over 044 + 046 + 049).
-- Adds 11 drugs / non-magical substances from DMG, Explorer's Guide
-- to Wildemount (EGW), Eberron: Rising from the Last War (RLW), and
-- Journeys through the Radiant Citadel (JRC). Source mirrors
-- dnd.su/articles/inventory/149-drugs-and-substances.
--
-- Same per-campaign DO loop pattern as 044 / 046 / 049. Idempotent
-- via NOT EXISTS (campaign_id, srd_slug) — re-running is safe and
-- DM edits to title / price / description persist.
--
-- All entries: category='consumable', rarity=null, slot=null,
-- weight=0, source_slug='srd-5e' (book attribution preserved inline
-- in description prose — splitting source slugs per book is a
-- follow-up).
--
-- dnd.su's «Противоядие» (DMG) intentionally NOT included —
-- already seeded as `antitoxin-vial` in mig 044 with identical
-- mechanics (advantage on poison saves for 1 hour, 50 gp). Adding
-- a duplicate srd_slug would create user-visible double entries.
--
-- Four substances (Белое семя, Драконья кровь, Чёрное семя,
-- both призрачной орхидеи variants) have no canonical price on
-- dnd.su → price_gp = null. «Сонная лилия» — base price 1 gp set;
-- legal-channel 10 gp variant noted in description (same item,
-- one row).
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
      ('murasa-balm', 'Бальзам мурусы', 'Бальзам (EGW). Нанесение четверти пинты за 1 минуту даёт сопротивление огню на 1 час. Доза от солнечных ожогов — 1 зм.', 'consumable', null, 100, 0, null),
      ('ghost-orchid-white-seed', 'Белое семя призрачной орхидеи', 'Семя орхидеи (JRC). Если смолоть и рассыпать над трупом — эффект «Воскрешение». При употреблении внутрь не действует.', 'consumable', null, null, 0, null),
      ('dragons-blood', 'Драконья кровь', 'Стимулятор (RLW). Сильное привыкание; усиливает заклинательство или временно даёт способности чародея. Эффект непредсказуем — Мастер бросает по таблице «Волна дикой магии».', 'consumable', null, null, 0, null),
      ('theki-root', 'Корень тэки', 'Корень (EGW). Действием съесть; преимущество на спасброски против ядов и токсинов на 8 часов.', 'consumable', null, 3, 0, null),
      ('olisuba-leaf', 'Лист олисуба', 'Чай (EGW). Выпить во время продолжительного отдыха — по окончании истощение снижается на 2 степени вместо 1.', 'consumable', null, 50, 0, null),
      ('shade-willow-oil', 'Масло тенистой ивы', 'Масло (EGW). Действием нанести на окаменевшее существо (если окаменение < 1 минуты назад) — окаменение оканчивается в начале его следующего хода.', 'consumable', null, 30, 0, null),
      ('divinatory-salts', 'Соли прорицания', 'Алкалоид (EGW). Доза с леденец перорально; преимущество к проверкам Интеллекта на 1d4 ч. За каждую дозу — спасбросок Тел Сл 15 или степень истощения, накапливается.', 'consumable', null, 150, 0, null),
      ('dreamlily', 'Сонная лилия', 'Опиат (RLW). 1 зм на чёрном рынке / 10 зм легально. Отравлен 1 час; иммунитет к «испуганному», и при первом обнулении HP вместо смерти HP падает до 1.', 'consumable', null, 1, 0, null),
      ('cadaver-ichor', 'Трупный ихор', 'Психоделик (EGW). 1 час: преим. на Инт/Мдр и уязвимость к психической. Спасбросок Тел Сл 15 — иначе отравлен 1d6 ч и «смятение» 1 мин. Нежить вместо этого получает преим. на Лвк и иммунитет к «испуганному».', 'consumable', null, 200, 0, null),
      ('ghost-orchid-black-seed', 'Чёрное семя призрачной орхидеи', 'Семя (JRC). Съевший подвергается «Притворной смерти». Если не желает — спасбросок Тел Сл 16, иначе считается согласным.', 'consumable', null, null, 0, null),
      ('black-sap', 'Чёрный сок', 'Опьяняющее (EGW). Курят или вводят в кровь. 1d6 ч нельзя очаровать или испугать. За дозу — спасбросок Тел Сл 15 или отравлен 2d4 ч; накапливается.', 'consumable', null, 300, 0, null)
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
    raise notice 'Campaign % (%): inserted % new drug/substance items (mig 050)',
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
    raise notice 'Campaign % (%): backfilled % transactions (mig 050)',
      c_rec.slug, c_rec.id, bf_count;
  end loop;
end $$;

commit;

-- Verification (run manually if desired):
--   select c.slug, count(n.id) as drug_count
--     from campaigns c
--     left join nodes n on n.campaign_id = c.id
--                       and n.fields->>'srd_slug' in (
--                         'murasa-balm', 'ghost-orchid-white-seed',
--                         'dragons-blood', 'theki-root', 'olisuba-leaf',
--                         'shade-willow-oil', 'divinatory-salts',
--                         'dreamlily', 'cadaver-ichor',
--                         'ghost-orchid-black-seed', 'black-sap'
--                       )
--     group by c.slug order by c.slug;
--   -- expect 11 per campaign for fresh seeding.

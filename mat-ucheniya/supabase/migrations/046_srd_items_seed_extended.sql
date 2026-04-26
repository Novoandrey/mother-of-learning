-- Migration 046 — extended SRD item seed (delta over 044).
-- Spec-015 follow-up (chat 70). Adds 41 more SRD items
-- focused on magic items / wondrous / consumables — the categories
-- with the thinnest coverage in 044.
--
-- Same per-campaign DO loop pattern as 044. Idempotent via
-- NOT EXISTS (campaign_id, srd_slug) — re-running is safe and any
-- additional entries that 044 already inserted (e.g. if both files
-- ran in unexpected order) are silently skipped.
--
-- Phase 2 backfill is intentionally re-run: catches transactions
-- whose item_name happens to match one of the new titles or slugs,
-- now that the catalog has them.

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
      ('shield-plus-1', '+1 щит', '+1 к AC сверх обычного бонуса щита.', 'magic-item', 'uncommon', 1000, 6, 'shield'),
      ('shortsword-plus-1', '+1 короткий меч', '+1 к броску атаки и урона. 1d6 колющий, фехтовальное.', 'magic-item', 'uncommon', 1000, 2, '1-handed'),
      ('dagger-plus-1', '+1 кинжал', '+1 к броску атаки и урона. 1d4, можно метать.', 'magic-item', 'uncommon', 1000, 1, '1-handed'),
      ('longbow-plus-1', '+1 длинный лук', '+1 к броску атаки и урона. 1d8 колющий, дальность 150/600.', 'magic-item', 'uncommon', 1000, 2, 'ranged'),
      ('leather-armor-plus-1', '+1 кожаный доспех', '+1 к AC сверх обычного. Лёгкий, без помех скрытности.', 'magic-item', 'rare', 4000, 10, 'body'),
      ('chain-shirt-plus-1', '+1 кольчужная рубаха', '+1 к AC сверх обычного.', 'magic-item', 'rare', 4000, 20, 'body'),
      ('plate-armor-plus-1', '+1 латные доспехи', '+1 к AC сверх обычного. Тяжёлый.', 'magic-item', 'very-rare', 24000, 65, 'body'),
      ('wand-of-magic-missiles', 'Жезл магических снарядов', '7 зарядов. 1 заряд = «Волшебная стрела» 1 круга, до 7 зарядов = до 7 круга.', 'magic-item', 'uncommon', 1500, 1, null),
      ('wand-of-fireballs', 'Жезл огненных шаров', '7 зарядов. 1 заряд = «Огненный шар» 3 круга, +1 круг за каждый дополнительный заряд.', 'magic-item', 'rare', 6000, 1, null),
      ('wand-of-web', 'Жезл паутины', '7 зарядов. 1 заряд = «Паутина», DC спасброска Лвк 15. Требует настройки заклинателя.', 'magic-item', 'uncommon', 1500, 1, null),
      ('cloak-of-elvenkind', 'Плащ эльфов', 'Преимущество на скрытность; помеха проверкам Внимания обнаружить вас. Требует настройки.', 'wondrous', 'uncommon', 4000, 1, 'cloak'),
      ('cape-of-the-mountebank', 'Плащ шарлатана', 'Раз в день — телепорт «Туманный шаг» (60 футов).', 'wondrous', 'rare', 5000, 1, 'cloak'),
      ('boots-of-speed', 'Сапоги быстроты', 'Удвоенная скорость на 10 минут в день. Требует настройки.', 'wondrous', 'rare', 5000, 1, 'boots'),
      ('boots-of-striding-and-springing', 'Сапоги поступи и прыжков', 'Скорость 30 футов независимо от Силы; прыжки утрояются. Требует настройки.', 'wondrous', 'uncommon', 4000, 1, 'boots'),
      ('winged-boots', 'Крылатые сапоги', 'Полёт со скоростью ходьбы. 4 часа полёта в день. Требует настройки.', 'wondrous', 'uncommon', 4000, 1, 'boots'),
      ('slippers-of-spider-climbing', 'Туфли паучьего лазания', 'Лазание со скоростью ходьбы по любым поверхностям. Требует настройки.', 'wondrous', 'uncommon', 4000, 0, 'boots'),
      ('ring-of-jumping', 'Кольцо прыжков', 'Бонусное действие — «Прыжок» на себя. Требует настройки.', 'wondrous', 'uncommon', 4000, 0, 'ring'),
      ('ring-of-warmth', 'Кольцо тепла', 'Сопротивление холоду; комфорт при −45°C и теплее. Требует настройки.', 'wondrous', 'uncommon', 4000, 0, 'ring'),
      ('ring-of-spell-storing', 'Кольцо хранения заклинаний', 'Хранит до 5 уровней заклинаний; владелец накладывает их позже. Требует настройки.', 'wondrous', 'rare', 5000, 0, 'ring'),
      ('goggles-of-night', 'Очки ночного видения', 'Тёмное зрение 60 футов, пока надеты.', 'wondrous', 'uncommon', 4000, 0, 'headwear'),
      ('eyes-of-the-eagle', 'Очки орла', 'Преимущество на проверки Внимания, основанные на зрении. Требует настройки.', 'wondrous', 'uncommon', 4000, 0, 'headwear'),
      ('helm-of-telepathy', 'Шлем телепатии', 'Заклинание «Обнаружение мыслей»; «Внушение» 3 раза в день. Требует настройки.', 'wondrous', 'uncommon', 4000, 1, 'headwear'),
      ('bracers-of-defense', 'Наручи защиты', '+2 к AC, если вы без доспехов и щита. Требует настройки.', 'wondrous', 'rare', 6000, 1, 'gloves'),
      ('pearl-of-power', 'Жемчужина силы', '1 раз в день восстанавливает использованную ячейку заклинания 3-го круга или ниже. Требует настройки заклинателя.', 'wondrous', 'uncommon', 1500, 0, null),
      ('driftglobe', 'Парящий шар', 'Шар-светильник. Команда — свет / парение в радиусе 60 футов хозяина.', 'wondrous', 'uncommon', 1500, 1, null),
      ('immovable-rod', 'Несдвигаемый жезл', 'Кнопка фиксирует жезл в воздухе; держит до 3500 кг.', 'wondrous', 'uncommon', 4000, 2, null),
      ('broom-of-flying', 'Метла полёта', 'Полёт со скоростью 50 футов; до 200 кг.', 'wondrous', 'uncommon', 1500, 3, null),
      ('portable-hole', 'Переносная яма', 'Чёрный круг диаметром 6 футов; превращается в внепространственную яму глубиной 10 футов.', 'wondrous', 'rare', 5000, 0, null),
      ('javelin-of-lightning', 'Молниевое копьё', 'Метание = молниевая линия 5×120 футов, 4d6 урона электричеством. Расходный.', 'magic-item', 'uncommon', 1500, 2, 'versatile'),
      ('flame-tongue', 'Пламенный язык', 'Командное слово зажигает клинок: +2d6 огненного урона. Свет 40 футов.', 'magic-item', 'rare', 5000, 3, 'versatile'),
      ('dragon-scale-mail', 'Драконья чешуя', '+1 к AC, преимущество на спасброски от страха драконов; 1 раз в день — чувствуете драконов в радиусе 30 миль.', 'magic-item', 'very-rare', 50000, 45, 'body'),
      ('potion-of-heroism', 'Зелье героизма', '10 временных HP + эффект «Благословение» 1 час.', 'consumable', 'rare', 500, 0.5, null),
      ('potion-of-invisibility', 'Зелье невидимости', 'Невидимость на 1 час или до атаки/каста.', 'consumable', 'very-rare', 5000, 0.5, null),
      ('potion-of-flying', 'Зелье полёта', 'Скорость полёта 60 футов на 1 час.', 'consumable', 'very-rare', 5000, 0.5, null),
      ('potion-of-speed', 'Зелье скорости', 'Эффект «Ускорения» на 1 минуту, без концентрации.', 'consumable', 'very-rare', 5000, 0.5, null),
      ('potion-of-water-breathing', 'Зелье дыхания под водой', 'Дыхание под водой 1 час.', 'consumable', 'uncommon', 200, 0.5, null),
      ('potion-of-climbing', 'Зелье лазания', 'Скорость лазания = скорости ходьбы; преимущество на лазание; 1 час.', 'consumable', 'common', 50, 0.5, null),
      ('potion-of-growth', 'Зелье увеличения', 'Эффект «Увеличения», размер +1 категория, 1d4 часа.', 'consumable', 'uncommon', 200, 0.5, null),
      ('oil-of-slipperiness', 'Масло скольжения', 'Намазать существо/предмет: 8 часов «Освобождения» / зона 10 футов «Жирной грязи» 8 часов.', 'consumable', 'uncommon', 200, 0.5, null),
      ('dust-of-disappearance', 'Пыль исчезновения', 'Невидимость для всех в радиусе 10 футов на 2d4 минуты.', 'consumable', 'uncommon', 200, 0, null),
      ('dust-of-dryness', 'Пыль сухости', 'Высушивает до 15 куб. футов воды в горошину; разбить горошину — вода возвращается.', 'consumable', 'uncommon', 200, 0, null)
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
    raise notice 'Campaign % (%): inserted % new SRD items (mig 046)',
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
    raise notice 'Campaign % (%): backfilled % transactions (mig 046)',
      c_rec.slug, c_rec.id, bf_count;
  end loop;
end $$;

commit;

-- Verification (run manually if desired):
--   select c.slug, count(n.id)
--     from campaigns c
--     left join nodes n on n.campaign_id = c.id
--                       and n.fields->>'srd_slug' is not null
--     group by c.slug order by c.slug;
--   -- expect 044+046 = ~91 per campaign for fresh seeding.

-- Migration 052 — extended armor seed + studded-leather rename
-- (delta over 044).
--
-- Phase 1: adds 5 PHB armors that the original 044 SRD seed missed:
--   * padded-armor   (Стёганый доспех, light, 5 gp, AC 11+Dex)
--   * hide-armor     (Шкурный доспех,  medium, 10 gp, AC 12+Dex/+2)
--   * breastplate    (Кираса,          medium, 400 gp, AC 14+Dex/+2)
--   * ring-mail      (Колечный доспех, heavy, 30 gp, AC 14)
--   * splint-armor   (Наборный доспех, heavy, 200 gp, AC 17, Str 15)
--
-- Phase 1.5: conditional rename of `studded-leather` from
-- «Клёпаный кожаный доспех» (used by 044) to «Проклёпанный кожаный
-- доспех» (matches dnd.su / current standard PHB translation).
-- Updates ONLY when the title still equals the original 044 value —
-- DM manual edits are preserved.
--
-- Phase 2 backfill: same as 044/046/049-051 — re-run name-or-slug
-- match against transactions.
--
-- Same per-campaign DO loop pattern as 044 / 046 / 049 / 050 / 051.
-- Idempotent (NOT EXISTS guard + conditional UPDATE).
--
-- Source: dnd.su/articles/inventory/95-armor-and-shields. PHB.
--
-- Note (not applied): «Латный доспех» vs dnd.su's «Латы». Both are
-- valid Russian translations; not renaming to avoid surprising the
-- DM. Apply manually if desired.

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
      ('padded-armor', 'Стёганый доспех', 'Лёгкий доспех. AC 11 + Лвк. Помехи на скрытность.', 'armor', null, 5, 8, 'body'),
      ('hide-armor', 'Шкурный доспех', 'Средний доспех. AC 12 + Лвк (макс +2). Толстые меха и шкуры.', 'armor', null, 10, 12, 'body'),
      ('breastplate', 'Кираса', 'Средний доспех. AC 14 + Лвк (макс +2). Без помех скрытности.', 'armor', null, 400, 20, 'body'),
      ('ring-mail', 'Колечный доспех', 'Тяжёлый доспех. AC 14. Помехи на скрытность. Хуже кольчуги — носят те, кто не может себе позволить лучше.', 'armor', null, 30, 40, 'body'),
      ('splint-armor', 'Наборный доспех', 'Тяжёлый доспех. AC 17. Сила 15, помехи на скрытность.', 'armor', null, 200, 60, 'body')
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
    raise notice 'Campaign % (%): inserted % new armor items (mig 052)',
      c_rec.slug, c_rec.id, ins_count;
  end loop;
end $$;

-- ─────────────────────────── Phase 1.5: rename ───────────────────────────
-- Conditional: only renames if title still matches the original 044
-- default. DM manual edits to a different title are preserved.

do $$
declare
  c_rec record;
  rn_count int;
begin
  for c_rec in select id, slug from campaigns order by created_at loop
    update nodes
    set title = 'Проклёпанный кожаный доспех',
        fields = fields || jsonb_build_object(
          'description',
          'Лёгкий доспех. AC 12 + Лвк, без помех скрытности. Кожа усилена шипами/заклёпками.'
        )
    where campaign_id = c_rec.id
      and fields->>'srd_slug' = 'studded-leather'
      and title = 'Клёпаный кожаный доспех';

    get diagnostics rn_count = row_count;
    raise notice 'Campaign % (%): renamed % studded-leather rows (mig 052)',
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
    raise notice 'Campaign % (%): backfilled % transactions (mig 052)',
      c_rec.slug, c_rec.id, bf_count;
  end loop;
end $$;

commit;

-- Verification (run manually if desired):
--   -- (a) seeded armor count per campaign (expect 5 for fresh seeding)
--   select c.slug, count(n.id)
--     from campaigns c
--     left join nodes n on n.campaign_id = c.id
--                       and n.fields->>'srd_slug' in (
--                         'padded-armor', 'hide-armor', 'breastplate',
--                         'ring-mail', 'splint-armor'
--                       )
--     group by c.slug order by c.slug;
--   -- (b) studded-leather title check
--   select c.slug, n.title
--     from campaigns c
--     join nodes n on n.campaign_id = c.id
--                  and n.fields->>'srd_slug' = 'studded-leather';
--   -- expect «Проклёпанный кожаный доспех» everywhere unless DM edited.

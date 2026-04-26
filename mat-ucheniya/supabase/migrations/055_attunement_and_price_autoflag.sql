-- Migration 055 — attunement column + auto-managed use_default_price
-- (small follow-up to spec-016, no spec-kit artifacts).
--
-- Phase 1: schema. Adds `requires_attunement boolean not null default
--          false` to item_attributes.
--
-- Phase 2: backfill `requires_attunement = true` for items whose
--          description contains «Требует настройки». 17 items in
--          mat-ucheniya per current seed.
--
-- Phase 3a: backfill `use_default_price` for magic + consumable
--           bucket items by comparing current price_gp against
--           campaigns.item_default_prices[bucket][rarity] JSONB.
--           Items where price matches default → flag=true. Items
--           where price differs → flag=false. Items with rarity
--           outside common..legendary or with null cell are left
--           untouched (no baseline to compare).
--
-- Phase 3b: backfill `use_default_price` for mundane items
--           (rarity=null, non-consumable, with srd_slug) by comparing
--           current price_gp against embedded PHB seed baselines.
--           210 baseline tuples derived from `lib/seeds/items-srd.ts`.
--           Custom items without srd_slug stay at default (true) —
--           no baseline available.
--
-- Companion TS-side changes (separate commit, not in this migration):
--   * Item form: drop manual «Не использовать стандартную цену»
--     checkbox; add «Требует настройки» checkbox.
--   * Server actions: auto-compute use_default_price at create/update
--     using the same comparison logic as the backfill.
--   * Catalog grid: rename column «Н» → «Цр» (price-customization
--     indicator); add new column «Н» for requires_attunement.
--
-- Idempotency: re-running this migration is safe.
--   * Phase 1 uses `add column if not exists`.
--   * Phase 2 only flips false→true; if DM later sets to false, it
--     will flip back on rerun (tradeoff: we always trust description
--     as canonical; if DM wants to override, edit description too).
--   * Phase 3a/3b just recompute the comparison; idempotent.

begin;

-- ─────────────────────────── Phase 1: schema ───────────────────────────

alter table item_attributes
  add column if not exists requires_attunement boolean not null default false;

-- ─────────────────────────── Phase 2: attunement backfill ───────────────────────────

do $$
declare
  c_rec record;
  bf_count int;
begin
  for c_rec in select id, slug from campaigns order by created_at loop
    update item_attributes ia
    set requires_attunement = true
    from nodes n
    where ia.node_id = n.id
      and n.campaign_id = c_rec.id
      and ia.requires_attunement = false
      and (n.fields->>'description') ilike '%Требует настройки%';

    get diagnostics bf_count = row_count;
    raise notice 'Campaign % (%): marked % items requires_attunement=true (mig 055)',
      c_rec.slug, c_rec.id, bf_count;
  end loop;
end $$;

-- ─────────────────────────── Phase 3a: use_default_price for magic+consumable ───────────────────────────

do $$
declare
  c_rec record;
  bf_count int;
begin
  for c_rec in select id, slug, (settings->'item_default_prices') as item_default_prices from campaigns order by created_at loop
    update item_attributes ia
    set use_default_price = (
      ia.price_gp = (
        c_rec.item_default_prices
        -> case when ia.category_slug = 'consumable' then 'consumable' else 'magic' end
        ->> ia.rarity
      )::numeric
    )
    from nodes n
    where ia.node_id = n.id
      and n.campaign_id = c_rec.id
      and ia.rarity in ('common','uncommon','rare','very-rare','legendary')
      and ia.price_gp is not null
      and (
        c_rec.item_default_prices
        -> case when ia.category_slug = 'consumable' then 'consumable' else 'magic' end
        ->> ia.rarity
      ) is not null;

    get diagnostics bf_count = row_count;
    raise notice 'Campaign % (%): updated % use_default_price in magic/consumable bucket (mig 055)',
      c_rec.slug, c_rec.id, bf_count;
  end loop;
end $$;

-- ─────────────────────────── Phase 3b: use_default_price for mundane ───────────────────────────

do $$
declare
  c_rec record;
  bf_count int;
begin
  for c_rec in select id, slug from campaigns order by created_at loop
    with baselines(srd_slug, baseline_price) as (values
      ('longsword', 15),
      ('shortsword', 10),
      ('dagger', 2),
      ('battleaxe', 10),
      ('greatsword', 50),
      ('maul', 10),
      ('halberd', 20),
      ('longbow', 50),
      ('shortbow', 25),
      ('hand-crossbow', 75),
      ('heavy-crossbow', 50),
      ('spear', 1),
      ('mace', 5),
      ('quarterstaff', 0.2),
      ('sickle', 1),
      ('club', 0.1),
      ('light-hammer', 2),
      ('javelin', 0.5),
      ('greatclub', 0.2),
      ('handaxe', 5),
      ('light-crossbow', 25),
      ('dart', 0.05),
      ('sling', 0.1),
      ('war-pick', 5),
      ('warhammer', 15),
      ('glaive', 20),
      ('lance', 10),
      ('whip', 2),
      ('morningstar', 15),
      ('pike', 5),
      ('rapier', 25),
      ('greataxe', 30),
      ('scimitar', 25),
      ('trident', 5),
      ('flail', 10),
      ('blowgun', 10),
      ('net', 1),
      ('renaissance-pistol', 250),
      ('musket', 500),
      ('bullets-renaissance', 3),
      ('leather-armor', 10),
      ('studded-leather', 45),
      ('chain-shirt', 50),
      ('scale-mail', 50),
      ('half-plate', 750),
      ('chain-mail', 75),
      ('plate-armor', 1500),
      ('shield', 10),
      ('padded-armor', 5),
      ('hide-armor', 10),
      ('breastplate', 400),
      ('ring-mail', 30),
      ('splint-armor', 200),
      ('rope-hempen-50ft', 1),
      ('torch', 0.01),
      ('backpack', 2),
      ('bedroll', 1),
      ('whetstone', 0.01),
      ('lantern-hooded', 5),
      ('oil-flask', 0.1),
      ('tent-two-person', 2),
      ('mirror-steel', 5),
      ('mess-kit', 0.2),
      ('abacus', 2),
      ('crossbow-bolts', 1),
      ('block-and-tackle', 1),
      ('barrel', 2),
      ('paper-sheet', 0.2),
      ('waterskin', 0.2),
      ('bottle-glass', 2),
      ('bucket', 0.05),
      ('rope-silk-50ft', 10),
      ('scale-merchants', 5),
      ('wax', 0.5),
      ('pot-iron', 2),
      ('perfume-vial', 5),
      ('blowgun-needles', 1),
      ('lock', 10),
      ('caltrops', 1),
      ('manacles', 2),
      ('miners-pick', 2),
      ('book', 25),
      ('spellbook', 50),
      ('bell', 1),
      ('quiver', 1),
      ('signet-ring', 5),
      ('climbers-kit', 25),
      ('fishing-tackle', 1),
      ('crossbow-bolt-case', 1),
      ('map-case', 1),
      ('basket', 0.4),
      ('pouch', 0.5),
      ('grappling-hook', 2),
      ('jug', 0.02),
      ('lamp', 0.5),
      ('ladder-10ft', 0.1),
      ('crowbar', 2),
      ('shovel', 2),
      ('chalk', 0.01),
      ('ball-bearings', 1),
      ('sack', 0.01),
      ('component-pouch', 25),
      ('hammer-blacksmiths', 2),
      ('hammer', 1),
      ('soap', 0.02),
      ('clothes-traveler', 2),
      ('clothes-costume', 5),
      ('clothes-common', 0.5),
      ('clothes-fine', 15),
      ('blanket', 0.5),
      ('hunting-trap', 5),
      ('parchment-sheet', 0.1),
      ('hourglass', 25),
      ('quill', 0.02),
      ('spyglass', 1000),
      ('rations', 0.5),
      ('robes', 1),
      ('candle', 0.01),
      ('sling-bullets', 0.04),
      ('signal-whistle', 0.05),
      ('arrows', 1),
      ('chest', 5),
      ('ram-portable', 4),
      ('tinderbox', 0.5),
      ('magnifying-glass', 100),
      ('vial', 1),
      ('tankard', 0.02),
      ('lantern-bullseye', 10),
      ('chain-10ft', 5),
      ('ink-bottle', 10),
      ('pole-10ft', 0.05),
      ('iron-spikes', 1),
      ('piton', 0.05),
      ('arcane-focus-wand', 10),
      ('arcane-focus-rod', 10),
      ('arcane-focus-crystal', 10),
      ('arcane-focus-staff', 5),
      ('arcane-focus-orb', 20),
      ('holy-symbol-amulet', 5),
      ('holy-symbol-reliquary', 5),
      ('holy-symbol-emblem', 5),
      ('druidic-focus-mistletoe', 1),
      ('druidic-focus-wooden-staff', 5),
      ('druidic-focus-yew-wand', 10),
      ('druidic-focus-totem', 1),
      ('thieves-tools', 25),
      ('healers-kit', 5),
      ('navigators-tools', 25),
      ('poisoners-kit', 50),
      ('disguise-kit', 25),
      ('forgery-kit', 15),
      ('herbalism-kit', 5),
      ('dragonchess-set', 1),
      ('playing-card-set', 0.5),
      ('dice-set', 0.1),
      ('three-dragon-ante-set', 1),
      ('drum', 6),
      ('viol', 30),
      ('bagpipes', 30),
      ('lyre', 30),
      ('lute', 35),
      ('horn', 3),
      ('pan-flute', 12),
      ('flute', 2),
      ('dulcimer', 25),
      ('shawm', 2),
      ('alchemists-supplies', 50),
      ('potters-tools', 10),
      ('calligraphers-supplies', 10),
      ('masons-tools', 10),
      ('cartographers-tools', 15),
      ('leatherworkers-tools', 5),
      ('smiths-tools', 20),
      ('brewers-supplies', 20),
      ('carpenters-tools', 8),
      ('cooks-utensils', 1),
      ('woodcarvers-tools', 1),
      ('tinkers-tools', 50),
      ('cobblers-tools', 5),
      ('glassblowers-tools', 30),
      ('weavers-tools', 1),
      ('painters-supplies', 10),
      ('jewelers-tools', 25),
      ('antitoxin-vial', 50),
      ('holy-water-flask', 25),
      ('alchemists-fire', 50),
      ('acid-vial', 25),
      ('poison-basic-vial', 100),
      ('pale-tincture', 250),
      ('burnt-othur-fumes', 500),
      ('malice', 250),
      ('serpent-venom', 200),
      ('assassins-blood', 150),
      ('oil-of-taggit', 400),
      ('midnight-tears', 1500),
      ('carrion-crawler-mucus', 200),
      ('torpor', 600),
      ('truth-serum', 150),
      ('essence-of-ether', 300),
      ('wyvern-poison', 1200),
      ('drow-poison', 200),
      ('purple-worm-poison', 2000),
      ('murasa-balm', 100),
      ('theki-root', 3),
      ('olisuba-leaf', 50),
      ('shade-willow-oil', 30),
      ('divinatory-salts', 150),
      ('dreamlily', 1),
      ('cadaver-ichor', 200),
      ('black-sap', 300)
    )
    update item_attributes ia
    set use_default_price = (ia.price_gp = b.baseline_price)
    from nodes n
    join baselines b on b.srd_slug = n.fields->>'srd_slug'
    where ia.node_id = n.id
      and n.campaign_id = c_rec.id
      and ia.rarity is null
      and ia.category_slug != 'consumable'
      and ia.price_gp is not null;

    get diagnostics bf_count = row_count;
    raise notice 'Campaign % (%): updated % use_default_price in mundane bucket (mig 055)',
      c_rec.slug, c_rec.id, bf_count;
  end loop;
end $$;

commit;

-- Verification (run manually if desired):
--   -- (a) attunement count
--   select c.slug, count(*) from campaigns c
--     join nodes n on n.campaign_id = c.id
--     join item_attributes ia on ia.node_id = n.id
--     where ia.requires_attunement = true
--     group by c.slug;
--   -- expect 17 in mat-ucheniya for fresh seeded catalog.
--
--   -- (b) magic items where price differs from defaults (flag=false)
--   select n.title, ia.rarity, ia.price_gp,
--          (c.settings->'item_default_prices')
--            -> case when ia.category_slug = 'consumable' then 'consumable' else 'magic' end
--            ->> ia.rarity as default_price
--     from item_attributes ia
--     join nodes n on n.id = ia.node_id
--     join campaigns c on c.id = n.campaign_id
--     where ia.use_default_price = false
--       and ia.rarity is not null
--     order by c.slug, n.title;
--
--   -- (c) mundane items where price differs from PHB seed (flag=false)
--   select n.title, ia.price_gp from item_attributes ia
--     join nodes n on n.id = ia.node_id
--     where ia.use_default_price = false and ia.rarity is null;

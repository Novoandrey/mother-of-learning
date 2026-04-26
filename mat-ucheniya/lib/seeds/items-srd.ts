/**
 * Hand-curated SRD item seed — spec-015 (T033).
 *
 * 50 entries covering the most-referenced D&D 5e items: mundane
 * weapons, mundane armour, common adventuring gear, basic
 * consumables, and a small set of low-tier magic items. Picked for
 * coverage of typical mat-ucheniya conversation, not catalog
 * completeness — the DM extends the list per campaign as new items
 * appear.
 *
 * Why hand-curated and not parsed from open5e:
 *   T032 chose Option C. Parsing open5e gives ~400 items but adds
 *   external-data review overhead, license checks, and parse fragility.
 *   The backfill ROI on 50 well-chosen titles is higher than on 400
 *   exotic ones — common items match transactions; rare ones don't.
 *
 * Idempotency key: `(campaign_id, fields->>'srd_slug')`. The migration
 * INSERTs ON CONFLICT DO NOTHING, so re-running is safe and DM edits
 * to titles/prices/descriptions persist.
 *
 * Backfill rule (FR-029, run by mig 044):
 *   `LOWER(TRIM(transactions.item_name)) = LOWER(TRIM(nodes.title))
 *    OR LOWER(TRIM(transactions.item_name)) = LOWER(srd_slug)`
 *
 * To extend: add an entry below + bump migration. Slugs MUST stay
 * stable once shipped — they're the cross-language ID for backfill.
 */

import type { Rarity } from '@/lib/items-types'

export type ItemSeedEntry = {
  /** Stable English slug; cross-language identifier (kebab-case). */
  srdSlug: string
  /** Russian display title for `nodes.title`. */
  titleRu: string
  /** Must match a default `categories` slug seeded by mig 043. */
  category:
    | 'weapon'
    | 'armor'
    | 'consumable'
    | 'magic-item'
    | 'wondrous'
    | 'tool'
    | 'treasure'
    | 'misc'
  /** NULL for mundane items; magic items pick from the 5e ladder. */
  rarity: Rarity | null
  /** Gold pieces (5e baseline). NULL for priceless / quest-only items. */
  priceGp: number | null
  /** Weight in pounds. NULL when unitless ("a pinch"). */
  weightLb: number | null
  /** Must match a default `categories` slug in scope='item-slot', or NULL. */
  slot:
    | 'ring'
    | 'cloak'
    | 'amulet'
    | 'boots'
    | 'gloves'
    | 'headwear'
    | 'belt'
    | 'body'
    | 'shield'
    | '1-handed'
    | '2-handed'
    | 'versatile'
    | 'ranged'
    | null
  /** Russian description (1-2 sentences). May be empty string. */
  descriptionRu: string
  /**
   * Whether this magic item requires attunement (5e «Требует
   * настройки»). Backfilled at mig 055 from description scan; entries
   * here just keep TS in sync. Default false (omit field).
   */
  requiresAttunement?: boolean
}

export const ITEMS_SRD_SEED: ReadonlyArray<ItemSeedEntry> = [
  // ─────────────────── Weapons (mundane) ───────────────────
  { srdSlug: 'longsword', titleRu: 'Длинный меч', category: 'weapon', rarity: null, priceGp: 15, weightLb: 3, slot: 'versatile', descriptionRu: 'Универсальное холодное оружие. 1d8 (одной), 1d10 (двумя руками).' },
  { srdSlug: 'shortsword', titleRu: 'Короткий меч', category: 'weapon', rarity: null, priceGp: 10, weightLb: 2, slot: '1-handed', descriptionRu: 'Лёгкое финесное оружие. 1d6 колющий, есть свойство «фехтовальное».' },
  { srdSlug: 'dagger', titleRu: 'Кинжал', category: 'weapon', rarity: null, priceGp: 2, weightLb: 1, slot: '1-handed', descriptionRu: 'Лёгкое финесное оружие. 1d4. Можно метать на 20/60 футов.' },
  { srdSlug: 'battleaxe', titleRu: 'Боевой топор', category: 'weapon', rarity: null, priceGp: 10, weightLb: 4, slot: 'versatile', descriptionRu: 'Универсальный воинский топор. 1d8 (одной), 1d10 (двумя).' },
  { srdSlug: 'greatsword', titleRu: 'Большой меч', category: 'weapon', rarity: null, priceGp: 50, weightLb: 6, slot: '2-handed', descriptionRu: 'Двуручное тяжёлое оружие. 2d6 рубящий.' },
  { srdSlug: 'maul', titleRu: 'Двуручный молот', category: 'weapon', rarity: null, priceGp: 10, weightLb: 10, slot: '2-handed', descriptionRu: 'Двуручное тяжёлое оружие. 2d6 дробящий.' },
  { srdSlug: 'halberd', titleRu: 'Алебарда', category: 'weapon', rarity: null, priceGp: 20, weightLb: 6, slot: '2-handed', descriptionRu: 'Двуручное древковое оружие с дальностью досягаемости. 1d10 рубящий.' },
  { srdSlug: 'longbow', titleRu: 'Длинный лук', category: 'weapon', rarity: null, priceGp: 50, weightLb: 2, slot: 'ranged', descriptionRu: 'Двуручное дальнобойное оружие. 1d8 колющий, дальность 150/600 футов.' },
  { srdSlug: 'shortbow', titleRu: 'Короткий лук', category: 'weapon', rarity: null, priceGp: 25, weightLb: 2, slot: 'ranged', descriptionRu: 'Двуручное дальнобойное оружие. 1d6 колющий, дальность 80/320 футов.' },
  { srdSlug: 'hand-crossbow', titleRu: 'Ручной арбалет', category: 'weapon', rarity: null, priceGp: 75, weightLb: 3, slot: '1-handed', descriptionRu: 'Лёгкий дальнобойный арбалет. 1d6 колющий, дальность 30/120 футов.' },
  { srdSlug: 'heavy-crossbow', titleRu: 'Тяжёлый арбалет', category: 'weapon', rarity: null, priceGp: 50, weightLb: 18, slot: '2-handed', descriptionRu: 'Двуручный воинский арбалет. 1d10 колющий, дальность 100/400 футов.' },
  { srdSlug: 'spear', titleRu: 'Копьё', category: 'weapon', rarity: null, priceGp: 1, weightLb: 3, slot: 'versatile', descriptionRu: 'Универсальное оружие, можно метать. 1d6 (одной), 1d8 (двумя). Дальность 20/60.' },
  { srdSlug: 'mace', titleRu: 'Булава', category: 'weapon', rarity: null, priceGp: 5, weightLb: 4, slot: '1-handed', descriptionRu: 'Простое одноручное оружие. 1d6 дробящий.' },
  { srdSlug: 'quarterstaff', titleRu: 'Боевой посох', category: 'weapon', rarity: null, priceGp: 0.2, weightLb: 4, slot: 'versatile', descriptionRu: 'Простое универсальное оружие. 1d6 (одной), 1d8 (двумя).' },
  { srdSlug: 'sickle', titleRu: 'Серп', category: 'weapon', rarity: null, priceGp: 1, weightLb: 2, slot: '1-handed', descriptionRu: 'Простое лёгкое оружие. 1d4 рубящий.' },

  // ─────────────────── Weapons (mundane) — extended (PHB + DMG firearms) ───────────────────
  // Source: dnd.su/articles/inventory/96-arms + DMG firearms table
  // (image). category='weapon', source_slug='srd-5e'. Slot mapping:
  //   '1-handed' — light/finesse 1H melee, primary-melee throwables
  //   '2-handed' — heavy melee or 2H ranged
  //   'versatile' — usable 1H or 2H
  //   'ranged'    — primary-use ranged (incl. 1H crossbow/firearm)
  // Price conversions from PHB (sm=0.1gp, mm=0.01gp).
  // Modern firearms have null priceGp — dnd.su lists them as «—»
  // (DM-controlled, not standard merchant inventory).

  // Simple melee
  { srdSlug: 'club', titleRu: 'Дубинка', category: 'weapon', rarity: null, priceGp: 0.1, weightLb: 2, slot: '1-handed', descriptionRu: 'Простое лёгкое оружие. 1d4 дробящий.' },
  { srdSlug: 'light-hammer', titleRu: 'Лёгкий молот', category: 'weapon', rarity: null, priceGp: 2, weightLb: 2, slot: '1-handed', descriptionRu: 'Простое лёгкое оружие. 1d4 дробящий, метательное (20/60).' },
  { srdSlug: 'javelin', titleRu: 'Метательное копьё', category: 'weapon', rarity: null, priceGp: 0.5, weightLb: 2, slot: '1-handed', descriptionRu: 'Простое метательное копьё. 1d6 колющий, дальность 30/120 фт.' },
  { srdSlug: 'greatclub', titleRu: 'Палица', category: 'weapon', rarity: null, priceGp: 0.2, weightLb: 10, slot: '2-handed', descriptionRu: 'Простая двуручная дубина. 1d8 дробящий.' },
  { srdSlug: 'handaxe', titleRu: 'Ручной топор', category: 'weapon', rarity: null, priceGp: 5, weightLb: 2, slot: '1-handed', descriptionRu: 'Простое лёгкое оружие. 1d6 рубящий, метательное (20/60).' },

  // Simple ranged
  { srdSlug: 'light-crossbow', titleRu: 'Арбалет, лёгкий', category: 'weapon', rarity: null, priceGp: 25, weightLb: 5, slot: 'ranged', descriptionRu: 'Простой двуручный арбалет. 1d8 колющий, дальность 80/320, перезарядка.' },
  { srdSlug: 'dart', titleRu: 'Дротик', category: 'weapon', rarity: null, priceGp: 0.05, weightLb: 0.25, slot: 'ranged', descriptionRu: 'Простой метательный дротик. 1d4 колющий, дальность 20/60, фехтовальное.' },
  { srdSlug: 'sling', titleRu: 'Праща', category: 'weapon', rarity: null, priceGp: 0.1, weightLb: 0, slot: 'ranged', descriptionRu: 'Простая праща. 1d4 дробящий, дальность 30/120.' },

  // Martial melee
  { srdSlug: 'war-pick', titleRu: 'Боевая кирка', category: 'weapon', rarity: null, priceGp: 5, weightLb: 2, slot: '1-handed', descriptionRu: 'Воинская одноручная кирка. 1d8 колющий.' },
  { srdSlug: 'warhammer', titleRu: 'Боевой молот', category: 'weapon', rarity: null, priceGp: 15, weightLb: 2, slot: 'versatile', descriptionRu: 'Воинский универсальный молот. 1d8 (одной), 1d10 (двумя). Дробящий.' },
  { srdSlug: 'glaive', titleRu: 'Глефа', category: 'weapon', rarity: null, priceGp: 20, weightLb: 6, slot: '2-handed', descriptionRu: 'Воинская двуручная глефа. 1d10 рубящий, досягаемость, тяжёлое.' },
  { srdSlug: 'lance', titleRu: 'Длинное копьё', category: 'weapon', rarity: null, priceGp: 10, weightLb: 6, slot: '2-handed', descriptionRu: 'Воинское длинное копьё. 1d12 колющий, досягаемость; помеха в пределах 5 фт. Без верховой — двуручное.' },
  { srdSlug: 'whip', titleRu: 'Кнут', category: 'weapon', rarity: null, priceGp: 2, weightLb: 3, slot: '1-handed', descriptionRu: 'Воинский фехтовальный кнут. 1d4 рубящий, досягаемость.' },
  { srdSlug: 'morningstar', titleRu: 'Моргенштерн', category: 'weapon', rarity: null, priceGp: 15, weightLb: 4, slot: '1-handed', descriptionRu: 'Воинский одноручный моргенштерн. 1d8 колющий.' },
  { srdSlug: 'pike', titleRu: 'Пика', category: 'weapon', rarity: null, priceGp: 5, weightLb: 18, slot: '2-handed', descriptionRu: 'Воинская двуручная пика. 1d10 колющий, досягаемость, тяжёлое.' },
  { srdSlug: 'rapier', titleRu: 'Рапира', category: 'weapon', rarity: null, priceGp: 25, weightLb: 2, slot: '1-handed', descriptionRu: 'Воинская фехтовальная рапира. 1d8 колющий.' },
  { srdSlug: 'greataxe', titleRu: 'Секира', category: 'weapon', rarity: null, priceGp: 30, weightLb: 7, slot: '2-handed', descriptionRu: 'Воинская двуручная секира. 1d12 рубящий, тяжёлое.' },
  { srdSlug: 'scimitar', titleRu: 'Скимитар', category: 'weapon', rarity: null, priceGp: 25, weightLb: 3, slot: '1-handed', descriptionRu: 'Воинский лёгкий скимитар. 1d6 рубящий, фехтовальное.' },
  { srdSlug: 'trident', titleRu: 'Трезубец', category: 'weapon', rarity: null, priceGp: 5, weightLb: 4, slot: 'versatile', descriptionRu: 'Воинский трезубец. 1d6 (одной), 1d8 (двумя). Метательное (20/60), колющий.' },
  { srdSlug: 'flail', titleRu: 'Цеп', category: 'weapon', rarity: null, priceGp: 10, weightLb: 2, slot: '1-handed', descriptionRu: 'Воинский одноручный цеп. 1d8 дробящий.' },

  // Martial ranged
  { srdSlug: 'blowgun', titleRu: 'Духовая трубка', category: 'weapon', rarity: null, priceGp: 10, weightLb: 1, slot: 'ranged', descriptionRu: 'Воинская дальнобойная духовая трубка. 1 колющий, дальность 25/100, перезарядка.' },
  { srdSlug: 'net', titleRu: 'Сеть', category: 'weapon', rarity: null, priceGp: 1, weightLb: 3, slot: 'ranged', descriptionRu: 'Воинская метательная сеть. Без урона. 5/15 фт. Опутывает существ Большого размера и меньше; высвобождение — Сила Сл 10 действием или 5 рубящего урона. Одна атака за действие/бонус/реакцию.' },

  // Firearms — Renaissance (DMG)
  { srdSlug: 'renaissance-pistol', titleRu: 'Пистоль', category: 'weapon', rarity: null, priceGp: 250, weightLb: 3, slot: 'ranged', descriptionRu: 'Огнестрельное оружие эпохи Возрождения. 1d10 колющий, дальность 30/90, перезарядка.' },
  { srdSlug: 'musket', titleRu: 'Мушкет', category: 'weapon', rarity: null, priceGp: 500, weightLb: 10, slot: 'ranged', descriptionRu: 'Двуручное огнестрельное оружие эпохи Возрождения. 1d12 колющий, дальность 40/120, перезарядка.' },
  { srdSlug: 'bullets-renaissance', titleRu: 'Пули (10)', category: 'misc', rarity: null, priceGp: 3, weightLb: 2, slot: null, descriptionRu: '10 пуль для огнестрельного оружия эпохи Возрождения (пистоль, мушкет).' },

  // Firearms — Modern (DMG)
  { srdSlug: 'automatic-pistol', titleRu: 'Пистолет, автоматический', category: 'weapon', rarity: null, priceGp: null, weightLb: 3, slot: 'ranged', descriptionRu: 'Современное огнестрельное оружие. 2d6 колющий, дальность 50/150, боекомплект 15 выстрелов.' },
  { srdSlug: 'revolver', titleRu: 'Револьвер', category: 'weapon', rarity: null, priceGp: null, weightLb: 3, slot: 'ranged', descriptionRu: 'Современное огнестрельное оружие. 2d8 колющий, дальность 40/120, боекомплект 6 выстрелов.' },
  { srdSlug: 'hunting-rifle', titleRu: 'Винтовка, охотничья', category: 'weapon', rarity: null, priceGp: null, weightLb: 8, slot: 'ranged', descriptionRu: 'Современное двуручное оружие. 2d10 колющий, дальность 80/240, боекомплект 5 выстрелов.' },
  { srdSlug: 'automatic-rifle', titleRu: 'Винтовка, автоматическая', category: 'weapon', rarity: null, priceGp: null, weightLb: 8, slot: 'ranged', descriptionRu: 'Современное двуручное оружие. 2d8 колющий, дальность 80/240, боекомплект 30 выстрелов, очередь.' },
  { srdSlug: 'shotgun', titleRu: 'Дробовик', category: 'weapon', rarity: null, priceGp: null, weightLb: 7, slot: 'ranged', descriptionRu: 'Современное двуручное оружие. 2d8 колющий, дальность 30/90, боекомплект 2 выстрела.' },

  // ─────────────────── Armor (mundane) ───────────────────
  { srdSlug: 'leather-armor', titleRu: 'Кожаный доспех', category: 'armor', rarity: null, priceGp: 10, weightLb: 10, slot: 'body', descriptionRu: 'Лёгкий доспех. AC 11 + Лвк, без помех скрытности.' },
  { srdSlug: 'studded-leather', titleRu: 'Проклёпанный кожаный доспех', category: 'armor', rarity: null, priceGp: 45, weightLb: 13, slot: 'body', descriptionRu: 'Лёгкий доспех. AC 12 + Лвк, без помех скрытности. Кожа усилена шипами/заклёпками.' },
  { srdSlug: 'chain-shirt', titleRu: 'Кольчужная рубаха', category: 'armor', rarity: null, priceGp: 50, weightLb: 20, slot: 'body', descriptionRu: 'Средний доспех. AC 13 + Лвк (макс +2).' },
  { srdSlug: 'scale-mail', titleRu: 'Чешуйчатый доспех', category: 'armor', rarity: null, priceGp: 50, weightLb: 45, slot: 'body', descriptionRu: 'Средний доспех. AC 14 + Лвк (макс +2). Помехи на скрытность.' },
  { srdSlug: 'half-plate', titleRu: 'Полулаты', category: 'armor', rarity: null, priceGp: 750, weightLb: 40, slot: 'body', descriptionRu: 'Средний доспех. AC 15 + Лвк (макс +2). Помехи на скрытность.' },
  { srdSlug: 'chain-mail', titleRu: 'Кольчуга', category: 'armor', rarity: null, priceGp: 75, weightLb: 55, slot: 'body', descriptionRu: 'Тяжёлый доспех. AC 16. Сила 13, помехи на скрытность.' },
  { srdSlug: 'plate-armor', titleRu: 'Латный доспех', category: 'armor', rarity: null, priceGp: 1500, weightLb: 65, slot: 'body', descriptionRu: 'Тяжёлый доспех. AC 18. Сила 15, помехи на скрытность.' },
  { srdSlug: 'shield', titleRu: 'Щит', category: 'armor', rarity: null, priceGp: 10, weightLb: 6, slot: 'shield', descriptionRu: '+2 к AC. Занимает руку.' },

  // ─────────────────── Armor (mundane) — extended (PHB) ───────────────────
  // Five PHB armors missing from the original 044 seed: padded, hide,
  // breastplate, ring mail, splint. Rename of `studded-leather`
  // («Клёпаный» → «Проклёпанный») applied conditionally in mig 052
  // (skips if DM already renamed manually).
  { srdSlug: 'padded-armor', titleRu: 'Стёганый доспех', category: 'armor', rarity: null, priceGp: 5, weightLb: 8, slot: 'body', descriptionRu: 'Лёгкий доспех. AC 11 + Лвк. Помехи на скрытность.' },
  { srdSlug: 'hide-armor', titleRu: 'Шкурный доспех', category: 'armor', rarity: null, priceGp: 10, weightLb: 12, slot: 'body', descriptionRu: 'Средний доспех. AC 12 + Лвк (макс +2). Толстые меха и шкуры.' },
  { srdSlug: 'breastplate', titleRu: 'Кираса', category: 'armor', rarity: null, priceGp: 400, weightLb: 20, slot: 'body', descriptionRu: 'Средний доспех. AC 14 + Лвк (макс +2). Без помех скрытности.' },
  { srdSlug: 'ring-mail', titleRu: 'Колечный доспех', category: 'armor', rarity: null, priceGp: 30, weightLb: 40, slot: 'body', descriptionRu: 'Тяжёлый доспех. AC 14. Помехи на скрытность. Хуже кольчуги — носят те, кто не может себе позволить лучше.' },
  { srdSlug: 'splint-armor', titleRu: 'Наборный доспех', category: 'armor', rarity: null, priceGp: 200, weightLb: 60, slot: 'body', descriptionRu: 'Тяжёлый доспех. AC 17. Сила 15, помехи на скрытность.' },

  // ─────────────────── Adventuring gear ───────────────────
  { srdSlug: 'rope-hempen-50ft', titleRu: 'Верёвка пеньковая, 50 футов', category: 'misc', rarity: null, priceGp: 1, weightLb: 10, slot: null, descriptionRu: 'Прочная верёвка длиной 50 футов.' },
  { srdSlug: 'torch', titleRu: 'Факел', category: 'misc', rarity: null, priceGp: 0.01, weightLb: 1, slot: null, descriptionRu: 'Освещает 20 футов ярким светом, ещё 20 — тусклым. Горит 1 час.' },
  { srdSlug: 'backpack', titleRu: 'Рюкзак', category: 'misc', rarity: null, priceGp: 2, weightLb: 5, slot: null, descriptionRu: 'Походный рюкзак, вмещает до 1 куб. фута / 30 фунтов.' },
  { srdSlug: 'bedroll', titleRu: 'Спальный мешок', category: 'misc', rarity: null, priceGp: 1, weightLb: 7, slot: null, descriptionRu: 'Свёрнутый матрас и одеяло для сна на природе.' },
  { srdSlug: 'whetstone', titleRu: 'Точильный камень', category: 'misc', rarity: null, priceGp: 0.01, weightLb: 1, slot: null, descriptionRu: 'Камень для затачивания клинков. Несколько применений.' },
  { srdSlug: 'lantern-hooded', titleRu: 'Закрытый фонарь', category: 'misc', rarity: null, priceGp: 5, weightLb: 2, slot: null, descriptionRu: 'Освещает 30 футов ярким светом и ещё 30 — тусклым. Расход масла: 1 час за пинту.' },
  { srdSlug: 'oil-flask', titleRu: 'Масло, бутыль', category: 'misc', rarity: null, priceGp: 0.1, weightLb: 1, slot: null, descriptionRu: 'Бутылка лампового масла. Можно поджечь как метательную при попадании.' },
  { srdSlug: 'tent-two-person', titleRu: 'Двухместная палатка', category: 'misc', rarity: null, priceGp: 2, weightLb: 20, slot: null, descriptionRu: 'Палатка, рассчитанная на двух персонажей.' },
  { srdSlug: 'mirror-steel', titleRu: 'Стальное зеркало', category: 'misc', rarity: null, priceGp: 5, weightLb: 0.5, slot: null, descriptionRu: 'Полированное зеркало из стали.' },
  { srdSlug: 'mess-kit', titleRu: 'Походный набор посуды', category: 'misc', rarity: null, priceGp: 0.2, weightLb: 1, slot: null, descriptionRu: 'Чашка, миска, ложка и складной чайник.' },

  // ─────────────────── PHB Equipment — extended (chat poisons-batch) ───────────────────
  // 82 PHB equipment entries missing from base seed. Source:
  // dnd.su/articles/inventory/98-equipment. Existing dups skipped:
  // алхимический огонь, верёвка пеньковая, зелье лечения,
  // зеркало стальное, кислота, комплект целителя, масло,
  // палатка двухместная, противоядие (=антитоксин), рюкзак,
  // святая вода, спальник, столовый набор, точильный камень
  // (rename below), факел, фонарь закрытый, яд простой.
  // category='misc' across the board; slot=null; source_slug='srd-5e'.

  // Standalone gear (alphabetical by Russian title for findability)
  { srdSlug: 'abacus', titleRu: 'Абак', category: 'misc', rarity: null, priceGp: 2, weightLb: 2, slot: null, descriptionRu: 'Счётная доска для арифметики.' },
  { srdSlug: 'crossbow-bolts', titleRu: 'Арбалетные болты (20)', category: 'misc', rarity: null, priceGp: 1, weightLb: 1.5, slot: null, descriptionRu: 'Боеприпасы для арбалетов. 20 штук в связке.' },
  { srdSlug: 'block-and-tackle', titleRu: 'Блок и лебёдка', category: 'misc', rarity: null, priceGp: 1, weightLb: 5, slot: null, descriptionRu: 'Блоки и тросы с крюками. Позволяет поднимать в 4 раза больше обычного.' },
  { srdSlug: 'barrel', titleRu: 'Бочка', category: 'misc', rarity: null, priceGp: 2, weightLb: 70, slot: null, descriptionRu: 'Деревянная бочка. Вместимость 40 галлонов / 4 куб. фута.' },
  { srdSlug: 'paper-sheet', titleRu: 'Бумага (один лист)', category: 'misc', rarity: null, priceGp: 0.2, weightLb: 0, slot: null, descriptionRu: 'Один лист бумаги.' },
  { srdSlug: 'waterskin', titleRu: 'Бурдюк', category: 'misc', rarity: null, priceGp: 0.2, weightLb: 5, slot: null, descriptionRu: 'Кожаный бурдюк. Вместимость 4 пинты. Вес указан в полном виде.' },
  { srdSlug: 'bottle-glass', titleRu: 'Бутылка, стеклянная', category: 'misc', rarity: null, priceGp: 2, weightLb: 2, slot: null, descriptionRu: 'Стеклянная бутылка. Вместимость 1.5 пинты.' },
  { srdSlug: 'bucket', titleRu: 'Ведро', category: 'misc', rarity: null, priceGp: 0.05, weightLb: 2, slot: null, descriptionRu: 'Ведро. Вместимость 3 галлона / 0.5 куб. фута.' },
  { srdSlug: 'rope-silk-50ft', titleRu: 'Верёвка шёлковая, 50 футов', category: 'misc', rarity: null, priceGp: 10, weightLb: 5, slot: null, descriptionRu: '50 футов шёлковой верёвки. 2 HP, разрывается проверкой Силы Сл 17.' },
  { srdSlug: 'scale-merchants', titleRu: 'Весы, торговые', category: 'misc', rarity: null, priceGp: 5, weightLb: 3, slot: null, descriptionRu: 'Рычажные весы с грузиками на 2 фунта. Точное измерение веса драгоценностей и товаров.' },
  { srdSlug: 'wax', titleRu: 'Воск', category: 'misc', rarity: null, priceGp: 0.5, weightLb: 0, slot: null, descriptionRu: 'Кусок воска. Для печатей и других мелких нужд.' },
  { srdSlug: 'pot-iron', titleRu: 'Горшок, железный', category: 'misc', rarity: null, priceGp: 2, weightLb: 10, slot: null, descriptionRu: 'Чугунный горшок. Вместимость 1 галлон.' },
  { srdSlug: 'perfume-vial', titleRu: 'Духи (флакон)', category: 'misc', rarity: null, priceGp: 5, weightLb: 0, slot: null, descriptionRu: 'Флакон духов.' },
  { srdSlug: 'blowgun-needles', titleRu: 'Иглы для трубки (50)', category: 'misc', rarity: null, priceGp: 1, weightLb: 1, slot: null, descriptionRu: 'Боеприпасы для духовой трубки. 50 штук.' },
  { srdSlug: 'lock', titleRu: 'Замок', category: 'misc', rarity: null, priceGp: 10, weightLb: 1, slot: null, descriptionRu: 'Замок с ключом. Без ключа — Лвк Сл 15 воровскими инструментами.' },
  { srdSlug: 'caltrops', titleRu: 'Калтропы (20 в сумке)', category: 'misc', rarity: null, priceGp: 1, weightLb: 2, slot: null, descriptionRu: 'Действием рассыпать на 5×5 фт. Спасбросок Лвк Сл 15 — иначе 1 колющий + остановка хода + −10 фт скорости до восстановления HP.' },
  { srdSlug: 'manacles', titleRu: 'Кандалы', category: 'misc', rarity: null, priceGp: 2, weightLb: 6, slot: null, descriptionRu: 'Сковывают существ Маленького/Среднего размера. Побег — Лвк Сл 20, поломка — Сила Сл 20. С ключом; без ключа — Лвк Сл 15. 15 HP.' },
  { srdSlug: 'miners-pick', titleRu: 'Кирка, горняцкая', category: 'misc', rarity: null, priceGp: 2, weightLb: 10, slot: null, descriptionRu: 'Шахтёрская кирка для копания.' },
  { srdSlug: 'book', titleRu: 'Книга', category: 'misc', rarity: null, priceGp: 25, weightLb: 5, slot: null, descriptionRu: 'Кожаный том со стихами, документами или иной информацией.' },
  { srdSlug: 'spellbook', titleRu: 'Книга заклинаний', category: 'misc', rarity: null, priceGp: 50, weightLb: 3, slot: null, descriptionRu: '100 пустых пергаментных страниц для записи заклинаний волшебника.' },
  { srdSlug: 'bell', titleRu: 'Колокольчик', category: 'misc', rarity: null, priceGp: 1, weightLb: 0, slot: null, descriptionRu: 'Маленький колокольчик.' },
  { srdSlug: 'quiver', titleRu: 'Колчан', category: 'misc', rarity: null, priceGp: 1, weightLb: 1, slot: null, descriptionRu: 'Помещается 20 стрел.' },
  { srdSlug: 'signet-ring', titleRu: 'Кольцо-печатка', category: 'misc', rarity: null, priceGp: 5, weightLb: 0, slot: null, descriptionRu: 'Перстень с гербовой печатью.' },
  { srdSlug: 'climbers-kit', titleRu: 'Комплект для лазания', category: 'misc', rarity: null, priceGp: 25, weightLb: 12, slot: null, descriptionRu: 'Шлямбуры, накладные подошвы, перчатки, страховка. Действием закрепиться: не упасть более чем на 25 фт от точки крепления.' },
  { srdSlug: 'fishing-tackle', titleRu: 'Комплект для рыбалки', category: 'misc', rarity: null, priceGp: 1, weightLb: 4, slot: null, descriptionRu: 'Удилище, шёлковая леска, поплавок, крючки, грузила, приманки, мелкоячеистая сеть.' },
  { srdSlug: 'crossbow-bolt-case', titleRu: 'Контейнер для арбалетных болтов', category: 'misc', rarity: null, priceGp: 1, weightLb: 1, slot: null, descriptionRu: 'Деревянный контейнер на 20 болтов.' },
  { srdSlug: 'map-case', titleRu: 'Контейнер для карт и свитков', category: 'misc', rarity: null, priceGp: 1, weightLb: 1, slot: null, descriptionRu: 'Кожаный тубус. До 10 листов бумаги или 5 листов пергамента.' },
  { srdSlug: 'basket', titleRu: 'Корзина', category: 'misc', rarity: null, priceGp: 0.4, weightLb: 2, slot: null, descriptionRu: 'Плетёная корзина. Вместимость 2 куб. фута / 40 фунтов.' },
  { srdSlug: 'pouch', titleRu: 'Кошель', category: 'misc', rarity: null, priceGp: 0.5, weightLb: 1, slot: null, descriptionRu: 'Кожаный или тканевый кошель. До 20 снарядов для пращи или 50 игл для трубки.' },
  { srdSlug: 'grappling-hook', titleRu: 'Крюк-кошка', category: 'misc', rarity: null, priceGp: 2, weightLb: 4, slot: null, descriptionRu: 'Металлический крюк для лазания и зацепа.' },
  { srdSlug: 'jug', titleRu: 'Кувшин или графин', category: 'misc', rarity: null, priceGp: 0.02, weightLb: 4, slot: null, descriptionRu: 'Кувшин или графин. Вместимость 1 галлон.' },
  { srdSlug: 'lamp', titleRu: 'Лампа', category: 'misc', rarity: null, priceGp: 0.5, weightLb: 1, slot: null, descriptionRu: 'Яркий свет 15 фт + тусклый ещё 30 фт. 6 часов от 1 пинты масла.' },
  { srdSlug: 'ladder-10ft', titleRu: 'Лестница (10 футов)', category: 'misc', rarity: null, priceGp: 0.1, weightLb: 25, slot: null, descriptionRu: 'Деревянная лестница 10 футов.' },
  { srdSlug: 'crowbar', titleRu: 'Ломик', category: 'misc', rarity: null, priceGp: 2, weightLb: 5, slot: null, descriptionRu: 'Преимущество на проверки Силы, где помогает рычаг.' },
  { srdSlug: 'shovel', titleRu: 'Лопата', category: 'misc', rarity: null, priceGp: 2, weightLb: 5, slot: null, descriptionRu: 'Обычная лопата для копания.' },
  { srdSlug: 'chalk', titleRu: 'Мел (1 кусочек)', category: 'misc', rarity: null, priceGp: 0.01, weightLb: 0, slot: null, descriptionRu: 'Один кусочек мела.' },
  { srdSlug: 'ball-bearings', titleRu: 'Металлические шарики (1000)', category: 'misc', rarity: null, priceGp: 1, weightLb: 2, slot: null, descriptionRu: 'Действием рассыпать на 10×10 фт. Спасбросок Лвк Сл 10 — иначе ничком.' },
  { srdSlug: 'sack', titleRu: 'Мешок', category: 'misc', rarity: null, priceGp: 0.01, weightLb: 0.5, slot: null, descriptionRu: 'Простой мешок. Вместимость 1 куб. фут / 30 фунтов.' },
  { srdSlug: 'component-pouch', titleRu: 'Мешочек с компонентами', category: 'misc', rarity: null, priceGp: 25, weightLb: 2, slot: null, descriptionRu: 'Водонепроницаемый поясной кошель с отделениями. Заменяет материальные компоненты заклинаний без указанной стоимости.' },
  { srdSlug: 'hammer-blacksmiths', titleRu: 'Молот, кузнечный', category: 'misc', rarity: null, priceGp: 2, weightLb: 10, slot: null, descriptionRu: 'Тяжёлый кузнечный молот.' },
  { srdSlug: 'hammer', titleRu: 'Молоток', category: 'misc', rarity: null, priceGp: 1, weightLb: 3, slot: null, descriptionRu: 'Обычный молоток.' },
  { srdSlug: 'soap', titleRu: 'Мыло', category: 'misc', rarity: null, priceGp: 0.02, weightLb: 0, slot: null, descriptionRu: 'Кусок мыла.' },
  { srdSlug: 'clothes-traveler', titleRu: 'Одежда, дорожная', category: 'misc', rarity: null, priceGp: 2, weightLb: 4, slot: null, descriptionRu: 'Прочная одежда для путешествий.' },
  { srdSlug: 'clothes-costume', titleRu: 'Одежда, костюм', category: 'misc', rarity: null, priceGp: 5, weightLb: 4, slot: null, descriptionRu: 'Костюм для маскарадов и выступлений.' },
  { srdSlug: 'clothes-common', titleRu: 'Одежда, обычная', category: 'misc', rarity: null, priceGp: 0.5, weightLb: 3, slot: null, descriptionRu: 'Простая повседневная одежда.' },
  { srdSlug: 'clothes-fine', titleRu: 'Одежда, отличная', category: 'misc', rarity: null, priceGp: 15, weightLb: 6, slot: null, descriptionRu: 'Дорогая одежда для приёмов и аудиенций.' },
  { srdSlug: 'blanket', titleRu: 'Одеяло', category: 'misc', rarity: null, priceGp: 0.5, weightLb: 3, slot: null, descriptionRu: 'Шерстяное одеяло.' },
  { srdSlug: 'hunting-trap', titleRu: 'Охотничий капкан', category: 'misc', rarity: null, priceGp: 5, weightLb: 25, slot: null, descriptionRu: 'Действием установить. Спасбросок Лвк Сл 13 — иначе 1d4 колющий + остановка. Высвобождение — Сила Сл 13 (провал = 1 колющий).' },
  { srdSlug: 'parchment-sheet', titleRu: 'Пергамент (один лист)', category: 'misc', rarity: null, priceGp: 0.1, weightLb: 0, slot: null, descriptionRu: 'Один лист пергамента.' },
  { srdSlug: 'hourglass', titleRu: 'Песочные часы', category: 'misc', rarity: null, priceGp: 25, weightLb: 1, slot: null, descriptionRu: 'Песочные часы.' },
  { srdSlug: 'quill', titleRu: 'Писчее перо', category: 'misc', rarity: null, priceGp: 0.02, weightLb: 0, slot: null, descriptionRu: 'Перо для письма.' },
  { srdSlug: 'spyglass', titleRu: 'Подзорная труба', category: 'misc', rarity: null, priceGp: 1000, weightLb: 1, slot: null, descriptionRu: 'Увеличивает изображение в 2 раза.' },
  { srdSlug: 'rations', titleRu: 'Рационы (1 день)', category: 'misc', rarity: null, priceGp: 0.5, weightLb: 2, slot: null, descriptionRu: 'Обезвоженная пища на 1 день: вяленое мясо, сухофрукты, галеты, орехи.' },
  { srdSlug: 'robes', titleRu: 'Ряса', category: 'misc', rarity: null, priceGp: 1, weightLb: 4, slot: null, descriptionRu: 'Длинная ряса (одежда монаха или жреца).' },
  { srdSlug: 'candle', titleRu: 'Свеча', category: 'misc', rarity: null, priceGp: 0.01, weightLb: 0, slot: null, descriptionRu: 'Горит 1 час. Яркий свет 5 фт + тусклый ещё 5 фт.' },
  { srdSlug: 'sling-bullets', titleRu: 'Снаряды для пращи (20)', category: 'misc', rarity: null, priceGp: 0.04, weightLb: 1.5, slot: null, descriptionRu: 'Боеприпасы для пращи. 20 штук.' },
  { srdSlug: 'signal-whistle', titleRu: 'Сигнальный свисток', category: 'misc', rarity: null, priceGp: 0.05, weightLb: 0, slot: null, descriptionRu: 'Громкий свисток для подачи сигналов.' },
  { srdSlug: 'arrows', titleRu: 'Стрелы (20)', category: 'misc', rarity: null, priceGp: 1, weightLb: 1, slot: null, descriptionRu: 'Боеприпасы для луков. 20 штук в связке.' },
  { srdSlug: 'chest', titleRu: 'Сундук', category: 'misc', rarity: null, priceGp: 5, weightLb: 25, slot: null, descriptionRu: 'Деревянный сундук. Вместимость 12 куб. фута / 300 фунтов.' },
  { srdSlug: 'ram-portable', titleRu: 'Таран, портативный', category: 'misc', rarity: null, priceGp: 4, weightLb: 35, slot: null, descriptionRu: '+4 к проверкам Силы для выбивания дверей; преимущество с помощником.' },
  { srdSlug: 'tinderbox', titleRu: 'Трутница', category: 'misc', rarity: null, priceGp: 0.5, weightLb: 1, slot: null, descriptionRu: 'Кремень, кресало, трут. Действием поджечь факел; 1 минута для другого огня.' },
  { srdSlug: 'magnifying-glass', titleRu: 'Увеличительное стекло', category: 'misc', rarity: null, priceGp: 100, weightLb: 0, slot: null, descriptionRu: 'Линза. Преимущество к проверкам осмотра мелких/детализированных предметов. Можно разжечь огонь на солнце за 5 мин.' },
  { srdSlug: 'vial', titleRu: 'Флакон', category: 'misc', rarity: null, priceGp: 1, weightLb: 0, slot: null, descriptionRu: 'Стеклянный флакон. Вместимость 4 унции / 100 г.' },
  { srdSlug: 'tankard', titleRu: 'Фляга или большая кружка', category: 'misc', rarity: null, priceGp: 0.02, weightLb: 1, slot: null, descriptionRu: 'Фляга или кружка. Вместимость 1 пинта.' },
  { srdSlug: 'lantern-bullseye', titleRu: 'Фонарь, направленный', category: 'misc', rarity: null, priceGp: 10, weightLb: 2, slot: null, descriptionRu: 'Яркий свет 60-фт конусом + тусклый ещё 60 фт. 6 часов от 1 пинты масла.' },
  { srdSlug: 'chain-10ft', titleRu: 'Цепь (10 футов)', category: 'misc', rarity: null, priceGp: 5, weightLb: 10, slot: null, descriptionRu: '10 футов цепи. 10 HP, разрывается Сила Сл 20.' },
  { srdSlug: 'ink-bottle', titleRu: 'Чернила (бутылочка 30 г)', category: 'misc', rarity: null, priceGp: 10, weightLb: 0, slot: null, descriptionRu: 'Бутылочка чернил для письма.' },
  { srdSlug: 'pole-10ft', titleRu: 'Шест (10 футов)', category: 'misc', rarity: null, priceGp: 0.05, weightLb: 7, slot: null, descriptionRu: '10-футовый деревянный шест.' },
  { srdSlug: 'iron-spikes', titleRu: 'Шипы, железные (10)', category: 'misc', rarity: null, priceGp: 1, weightLb: 5, slot: null, descriptionRu: '10 железных шипов для крепления, ловушек, заклинивания дверей.' },
  { srdSlug: 'piton', titleRu: 'Шлямбур', category: 'misc', rarity: null, priceGp: 0.05, weightLb: 0.25, slot: null, descriptionRu: 'Железный костыль для скалолазания.' },

  // Arcane spellcasting foci (PHB)
  { srdSlug: 'arcane-focus-wand', titleRu: 'Волшебная палочка (фокусировка)', category: 'misc', rarity: null, priceGp: 10, weightLb: 1, slot: null, descriptionRu: 'Магическая фокусировка волшебников/колдунов/чародеев. Заменяет материальные компоненты без стоимости.' },
  { srdSlug: 'arcane-focus-rod', titleRu: 'Жезл (фокусировка)', category: 'misc', rarity: null, priceGp: 10, weightLb: 2, slot: null, descriptionRu: 'Магическая фокусировка волшебников/колдунов/чародеев.' },
  { srdSlug: 'arcane-focus-crystal', titleRu: 'Кристалл (фокусировка)', category: 'misc', rarity: null, priceGp: 10, weightLb: 1, slot: null, descriptionRu: 'Магическая фокусировка волшебников/колдунов/чародеев.' },
  { srdSlug: 'arcane-focus-staff', titleRu: 'Посох (фокусировка)', category: 'misc', rarity: null, priceGp: 5, weightLb: 4, slot: null, descriptionRu: 'Магическая фокусировка волшебников/колдунов/чародеев. Та же палка, что боевой посох, но с особой подготовкой.' },
  { srdSlug: 'arcane-focus-orb', titleRu: 'Сфера (фокусировка)', category: 'misc', rarity: null, priceGp: 20, weightLb: 3, slot: null, descriptionRu: 'Магическая фокусировка волшебников/колдунов/чародеев.' },

  // Holy symbols (cleric/paladin)
  { srdSlug: 'holy-symbol-amulet', titleRu: 'Амулет (священный символ)', category: 'misc', rarity: null, priceGp: 5, weightLb: 1, slot: null, descriptionRu: 'Священный символ — амулет с символом божества. Носится у всех на виду.' },
  { srdSlug: 'holy-symbol-reliquary', titleRu: 'Реликварий', category: 'misc', rarity: null, priceGp: 5, weightLb: 2, slot: null, descriptionRu: 'Священный символ — коробочка со священной реликвией.' },
  { srdSlug: 'holy-symbol-emblem', titleRu: 'Эмблема (священный символ)', category: 'misc', rarity: null, priceGp: 5, weightLb: 0, slot: null, descriptionRu: 'Священный символ — эмблема, выгравированная или выложенная камнями на щите.' },

  // Druidic foci
  { srdSlug: 'druidic-focus-mistletoe', titleRu: 'Веточка омелы', category: 'misc', rarity: null, priceGp: 1, weightLb: 0, slot: null, descriptionRu: 'Фокусировка друида.' },
  { srdSlug: 'druidic-focus-wooden-staff', titleRu: 'Деревянный посох (фокусировка друида)', category: 'misc', rarity: null, priceGp: 5, weightLb: 4, slot: null, descriptionRu: 'Фокусировка друида — посох из живого дерева.' },
  { srdSlug: 'druidic-focus-yew-wand', titleRu: 'Тисовая палочка', category: 'misc', rarity: null, priceGp: 10, weightLb: 1, slot: null, descriptionRu: 'Фокусировка друида — палочка из тиса или другого дерева.' },
  { srdSlug: 'druidic-focus-totem', titleRu: 'Тотем (фокусировка друида)', category: 'misc', rarity: null, priceGp: 1, weightLb: 0, slot: null, descriptionRu: 'Фокусировка друида — тотем с перьями, мехом, костями и зубами священных животных.' },
  { srdSlug: 'thieves-tools', titleRu: 'Воровские инструменты', category: 'tool', rarity: null, priceGp: 25, weightLb: 1, slot: null, descriptionRu: 'Набор отмычек, шилов и зеркальца. Для проверки навыка взлома.' },
  { srdSlug: 'healers-kit', titleRu: 'Набор лекаря', category: 'tool', rarity: null, priceGp: 5, weightLb: 3, slot: null, descriptionRu: '10 зарядов. Стабилизация умирающего без проверки.' },

  // ─────────────────── Tools — extended (PHB + XGE) ───────────────────
  // 36 tool kits / instruments / gaming sets missing from base seed.
  // Source: dnd.su/articles/inventory/100-tools. category='tool',
  // source_slug='srd-5e', rarity=null, slot=null. Price conversions
  // PHB: 1 см = 0.1 зм. Existing 'thieves-tools' kept as-is.

  // Standalone kits
  { srdSlug: 'navigators-tools', titleRu: 'Инструменты навигатора', category: 'tool', rarity: null, priceGp: 25, weightLb: 2, slot: null, descriptionRu: 'Секстант, компас, циркуль, перо, чернила, пергамент. Прокладка курса в море, чтение морских карт.' },
  { srdSlug: 'poisoners-kit', titleRu: 'Инструменты отравителя', category: 'tool', rarity: null, priceGp: 50, weightLb: 2, slot: null, descriptionRu: 'Склянки, ступка, реагенты. Создание и применение ядов; БМ к проверкам с ядами.' },
  { srdSlug: 'disguise-kit', titleRu: 'Набор для грима', category: 'tool', rarity: null, priceGp: 25, weightLb: 3, slot: null, descriptionRu: 'Косметика, краски для волос, реквизит, наряды. Изменение внешности, маскировка.' },
  { srdSlug: 'forgery-kit', titleRu: 'Набор для фальсификации', category: 'tool', rarity: null, priceGp: 15, weightLb: 5, slot: null, descriptionRu: 'Бумаги, перья, чернила, печати, сургуч, фольга. Подделка документов и подписей.' },
  { srdSlug: 'herbalism-kit', titleRu: 'Набор травника', category: 'tool', rarity: null, priceGp: 5, weightLb: 3, slot: null, descriptionRu: 'Мешочки, ступка, флаконы. Сбор трав, опознание растений. Требуется для создания зелья лечения и противоядия.' },

  // Gaming sets
  { srdSlug: 'dragonchess-set', titleRu: 'Драконьи шахматы', category: 'tool', rarity: null, priceGp: 1, weightLb: 0.5, slot: null, descriptionRu: 'Игровой набор. Стратегическая настольная игра.' },
  { srdSlug: 'playing-card-set', titleRu: 'Карты (игровой набор)', category: 'tool', rarity: null, priceGp: 0.5, weightLb: 0, slot: null, descriptionRu: 'Игровой набор. Колода карт для азартных игр.' },
  { srdSlug: 'dice-set', titleRu: 'Кости (игровой набор)', category: 'tool', rarity: null, priceGp: 0.1, weightLb: 0, slot: null, descriptionRu: 'Игровой набор. Кости для азартных игр.' },
  { srdSlug: 'three-dragon-ante-set', titleRu: 'Ставка трёх драконов', category: 'tool', rarity: null, priceGp: 1, weightLb: 0, slot: null, descriptionRu: 'Игровой набор. Карточная игра в Фаэруне.' },

  // Musical instruments
  { srdSlug: 'drum', titleRu: 'Барабан', category: 'tool', rarity: null, priceGp: 6, weightLb: 3, slot: null, descriptionRu: 'Музыкальный инструмент. Может использоваться бардом как фокусировка.' },
  { srdSlug: 'viol', titleRu: 'Виола', category: 'tool', rarity: null, priceGp: 30, weightLb: 1, slot: null, descriptionRu: 'Музыкальный инструмент. Струнный, играют смычком. Может использоваться бардом как фокусировка.' },
  { srdSlug: 'bagpipes', titleRu: 'Волынка', category: 'tool', rarity: null, priceGp: 30, weightLb: 6, slot: null, descriptionRu: 'Музыкальный инструмент. Духовой с мехами. Может использоваться бардом как фокусировка.' },
  { srdSlug: 'lyre', titleRu: 'Лира', category: 'tool', rarity: null, priceGp: 30, weightLb: 2, slot: null, descriptionRu: 'Музыкальный инструмент. Струнный. Может использоваться бардом как фокусировка.' },
  { srdSlug: 'lute', titleRu: 'Лютня', category: 'tool', rarity: null, priceGp: 35, weightLb: 2, slot: null, descriptionRu: 'Музыкальный инструмент. Струнный. Может использоваться бардом как фокусировка.' },
  { srdSlug: 'horn', titleRu: 'Рожок', category: 'tool', rarity: null, priceGp: 3, weightLb: 2, slot: null, descriptionRu: 'Музыкальный инструмент. Духовой. Может использоваться бардом как фокусировка.' },
  { srdSlug: 'pan-flute', titleRu: 'Свирель', category: 'tool', rarity: null, priceGp: 12, weightLb: 2, slot: null, descriptionRu: 'Музыкальный инструмент. Деревянная духовая (флейта Пана). Может использоваться бардом как фокусировка.' },
  { srdSlug: 'flute', titleRu: 'Флейта', category: 'tool', rarity: null, priceGp: 2, weightLb: 1, slot: null, descriptionRu: 'Музыкальный инструмент. Деревянная духовая. Может использоваться бардом как фокусировка.' },
  { srdSlug: 'dulcimer', titleRu: 'Цимбалы', category: 'tool', rarity: null, priceGp: 25, weightLb: 10, slot: null, descriptionRu: 'Музыкальный инструмент. Струнный с молоточками. Может использоваться бардом как фокусировка.' },
  { srdSlug: 'shawm', titleRu: 'Шалмей', category: 'tool', rarity: null, priceGp: 2, weightLb: 1, slot: null, descriptionRu: 'Музыкальный инструмент. Деревянный духовой с двойной тростью. Может использоваться бардом как фокусировка.' },

  // Artisan tools (17 — XGE expanded)
  { srdSlug: 'alchemists-supplies', titleRu: 'Инструменты алхимика', category: 'tool', rarity: null, priceGp: 50, weightLb: 8, slot: null, descriptionRu: 'Мензурки, реагенты, ступка, пестик. Создание кислоты, алхимического огня, масла, противоядия, духов, мыла.' },
  { srdSlug: 'potters-tools', titleRu: 'Инструменты гончара', category: 'tool', rarity: null, priceGp: 10, weightLb: 3, slot: null, descriptionRu: 'Иглы, цикли, скребки, нож, кронциркуль. Изготовление и опознание керамики.' },
  { srdSlug: 'calligraphers-supplies', titleRu: 'Инструменты каллиграфа', category: 'tool', rarity: null, priceGp: 10, weightLb: 5, slot: null, descriptionRu: 'Чернила, пергамент, три писчих пера. Каллиграфия, экспертиза рукописей и подписей.' },
  { srdSlug: 'masons-tools', titleRu: 'Инструменты каменщика', category: 'tool', rarity: null, priceGp: 10, weightLb: 8, slot: null, descriptionRu: 'Мастерок, молоток, долото, щётки, угольник. Каменное зодчество; двойной урон каменным строениям.' },
  { srdSlug: 'cartographers-tools', titleRu: 'Инструменты картографа', category: 'tool', rarity: null, priceGp: 15, weightLb: 6, slot: null, descriptionRu: 'Перо, чернила, пергамент, циркуль, кронциркуль, линейка. Составление и расшифровка карт.' },
  { srdSlug: 'leatherworkers-tools', titleRu: 'Инструменты кожевника', category: 'tool', rarity: null, priceGp: 5, weightLb: 5, slot: null, descriptionRu: 'Резак, киянка, канавкорез, пробойник, нить, кожа. Работа с кожей и шкурами; БМ к осмотру кожаных предметов.' },
  { srdSlug: 'smiths-tools', titleRu: 'Инструменты кузнеца', category: 'tool', rarity: null, priceGp: 20, weightLb: 8, slot: null, descriptionRu: 'Молоты, клещи, уголь, ветошь, точильный камень. Обработка металла; +10 HP металлическому предмету за 1 час работы.' },
  { srdSlug: 'brewers-supplies', titleRu: 'Инструменты пивовара', category: 'tool', rarity: null, priceGp: 20, weightLb: 9, slot: null, descriptionRu: 'Бутыль, хмель, сифон, змеевик, трубки. Пивоварение; очистка до 6 галлонов воды на длинном отдыхе.' },
  { srdSlug: 'carpenters-tools', titleRu: 'Инструменты плотника', category: 'tool', rarity: null, priceGp: 8, weightLb: 6, slot: null, descriptionRu: 'Пила, молоток, гвозди, топор, угольник, рубанок, стамеска. Деревянные сооружения; укрепление двери (+5 к Сл выбивания).' },
  { srdSlug: 'cooks-utensils', titleRu: 'Инструменты повара', category: 'tool', rarity: null, priceGp: 1, weightLb: 8, slot: null, descriptionRu: 'Котёл, ножи, вилки, ложка, половник. На коротком отдыхе — +1 HP за каждую потраченную Кость Хитов до 5 союзникам.' },
  { srdSlug: 'woodcarvers-tools', titleRu: 'Инструменты резчика по дереву', category: 'tool', rarity: null, priceGp: 1, weightLb: 5, slot: null, descriptionRu: 'Нож, стамеска, маленькая пила. Резьба по дереву; до 5 стрел на коротком отдыхе, до 20 на длинном.' },
  { srdSlug: 'tinkers-tools', titleRu: 'Инструменты ремонтника', category: 'tool', rarity: null, priceGp: 50, weightLb: 10, slot: null, descriptionRu: 'Ручные инструменты, нитки, иголки, точильный камень, ткань, кожа, клей. +10 HP повреждённому предмету за 1 час.' },
  { srdSlug: 'cobblers-tools', titleRu: 'Инструменты сапожника', category: 'tool', rarity: null, priceGp: 5, weightLb: 5, slot: null, descriptionRu: 'Молоток, шило, нож, обувная колодка, ножницы, кожа, нитки. Починка обуви; до 6 союзников ходят 10 ч/день без спасбросков от истощения.' },
  { srdSlug: 'glassblowers-tools', titleRu: 'Инструменты стеклодува', category: 'tool', rarity: null, priceGp: 30, weightLb: 5, slot: null, descriptionRu: 'Трубка для выдувания, обкатка, катальник, развёртки, щипцы. Стеклодувное дело; нужен источник тепла.' },
  { srdSlug: 'weavers-tools', titleRu: 'Инструменты ткача', category: 'tool', rarity: null, priceGp: 1, weightLb: 5, slot: null, descriptionRu: 'Нитки, иголки, куски ткани. Шитьё одежды; починка предмета одежды на коротком отдыхе.' },
  { srdSlug: 'painters-supplies', titleRu: 'Инструменты художника', category: 'tool', rarity: null, priceGp: 10, weightLb: 5, slot: null, descriptionRu: 'Мольберт, холст, краски, кисти, угольные карандаши, палитра. Живопись; БМ к Магии/Истории/Религии при осмотре произведений искусства.' },
  { srdSlug: 'jewelers-tools', titleRu: 'Инструменты ювелира', category: 'tool', rarity: null, priceGp: 25, weightLb: 2, slot: null, descriptionRu: 'Пилка, молоточек, напильники, щипцы, пинцет. Опознание и оценка драгоценностей.' },

  // ─────────────────── Consumables ───────────────────
  { srdSlug: 'potion-of-healing', titleRu: 'Зелье лечения', category: 'consumable', rarity: 'common', priceGp: 50, weightLb: 0.5, slot: null, descriptionRu: 'Восстанавливает 2d4+2 HP при выпивании.' },
  { srdSlug: 'potion-of-greater-healing', titleRu: 'Зелье среднего лечения', category: 'consumable', rarity: 'uncommon', priceGp: 200, weightLb: 0.5, slot: null, descriptionRu: 'Восстанавливает 4d4+4 HP.' },
  { srdSlug: 'potion-of-superior-healing', titleRu: 'Зелье отличного лечения', category: 'consumable', rarity: 'rare', priceGp: 500, weightLb: 0.5, slot: null, descriptionRu: 'Восстанавливает 8d4+8 HP.' },
  { srdSlug: 'antitoxin-vial', titleRu: 'Антитоксин', category: 'consumable', rarity: null, priceGp: 50, weightLb: 0, slot: null, descriptionRu: 'Бутылка. Преимущество к спасброскам от яда на 1 час.' },
  { srdSlug: 'holy-water-flask', titleRu: 'Святая вода', category: 'consumable', rarity: null, priceGp: 25, weightLb: 1, slot: null, descriptionRu: 'Метательная бутыль. 2d6 урона излучением нежити или исчадиям.' },
  { srdSlug: 'alchemists-fire', titleRu: 'Алхимический огонь', category: 'consumable', rarity: null, priceGp: 50, weightLb: 1, slot: null, descriptionRu: 'Метательная бутыль. 1d4 огня в начале хода цели, пока он не потушит огонь.' },
  { srdSlug: 'acid-vial', titleRu: 'Кислота, бутыль', category: 'consumable', rarity: null, priceGp: 25, weightLb: 1, slot: null, descriptionRu: 'Метательная бутыль. 2d6 кислотой при попадании.' },
  { srdSlug: 'poison-basic-vial', titleRu: 'Простой яд', category: 'consumable', rarity: null, priceGp: 100, weightLb: 0, slot: null, descriptionRu: 'Покрывает одно оружие. При попадании цель проходит спасбросок Тел DC 10 или получает 1d4 яда.' },

  // ─────────────────── Magic items ───────────────────
  { srdSlug: 'longsword-plus-1', titleRu: '+1 длинный меч', category: 'magic-item', rarity: 'uncommon', priceGp: 1000, weightLb: 3, slot: 'versatile', descriptionRu: '+1 к броску атаки и урона. 1d8 / 1d10 рубящий.' },
  { srdSlug: 'cloak-of-protection', titleRu: 'Плащ защиты', category: 'wondrous', rarity: 'uncommon', priceGp: 4000, weightLb: 1, slot: 'cloak', descriptionRu: '+1 к AC и спасброскам, пока носите. Требует настройки.', requiresAttunement: true },
  { srdSlug: 'boots-of-elvenkind', titleRu: 'Сапоги эльфов', category: 'wondrous', rarity: 'uncommon', priceGp: 4000, weightLb: 1, slot: 'boots', descriptionRu: 'Шаги бесшумны. Преимущество на скрытность бесшумных движений.' },
  { srdSlug: 'bag-of-holding', titleRu: 'Сумка хранения', category: 'wondrous', rarity: 'uncommon', priceGp: 4000, weightLb: 15, slot: null, descriptionRu: 'Внутреннее пространство 64 куб. фута / 500 фунтов; снаружи весит 15 фунтов.' },
  { srdSlug: 'ring-of-protection', titleRu: 'Кольцо защиты', category: 'magic-item', rarity: 'rare', priceGp: 8000, weightLb: 0, slot: 'ring', descriptionRu: '+1 к AC и спасброскам. Требует настройки.', requiresAttunement: true },
  { srdSlug: 'amulet-of-health', titleRu: 'Амулет здоровья', category: 'magic-item', rarity: 'rare', priceGp: 8000, weightLb: 1, slot: 'amulet', descriptionRu: 'Телосложение становится 19. Требует настройки.', requiresAttunement: true },
  { srdSlug: 'gauntlets-of-ogre-power', titleRu: 'Перчатки силы огра', category: 'magic-item', rarity: 'uncommon', priceGp: 4000, weightLb: 2, slot: 'gloves', descriptionRu: 'Сила становится 19. Требует настройки.', requiresAttunement: true },

  // ─────────────────── Magic items — extended pool (chat 70) ───────────────────
  // Uncommon weapons / armor / shields with +N
  { srdSlug: 'shield-plus-1', titleRu: '+1 щит', category: 'magic-item', rarity: 'uncommon', priceGp: 1000, weightLb: 6, slot: 'shield', descriptionRu: '+1 к AC сверх обычного бонуса щита.' },
  { srdSlug: 'shortsword-plus-1', titleRu: '+1 короткий меч', category: 'magic-item', rarity: 'uncommon', priceGp: 1000, weightLb: 2, slot: '1-handed', descriptionRu: '+1 к броску атаки и урона. 1d6 колющий, фехтовальное.' },
  { srdSlug: 'dagger-plus-1', titleRu: '+1 кинжал', category: 'magic-item', rarity: 'uncommon', priceGp: 1000, weightLb: 1, slot: '1-handed', descriptionRu: '+1 к броску атаки и урона. 1d4, можно метать.' },
  { srdSlug: 'longbow-plus-1', titleRu: '+1 длинный лук', category: 'magic-item', rarity: 'uncommon', priceGp: 1000, weightLb: 2, slot: 'ranged', descriptionRu: '+1 к броску атаки и урона. 1d8 колющий, дальность 150/600.' },
  { srdSlug: 'leather-armor-plus-1', titleRu: '+1 кожаный доспех', category: 'magic-item', rarity: 'rare', priceGp: 4000, weightLb: 10, slot: 'body', descriptionRu: '+1 к AC сверх обычного. Лёгкий, без помех скрытности.' },
  { srdSlug: 'chain-shirt-plus-1', titleRu: '+1 кольчужная рубаха', category: 'magic-item', rarity: 'rare', priceGp: 4000, weightLb: 20, slot: 'body', descriptionRu: '+1 к AC сверх обычного.' },
  { srdSlug: 'plate-armor-plus-1', titleRu: '+1 латные доспехи', category: 'magic-item', rarity: 'very-rare', priceGp: 24000, weightLb: 65, slot: 'body', descriptionRu: '+1 к AC сверх обычного. Тяжёлый.' },

  // Wands
  { srdSlug: 'wand-of-magic-missiles', titleRu: 'Жезл магических снарядов', category: 'magic-item', rarity: 'uncommon', priceGp: 1500, weightLb: 1, slot: null, descriptionRu: '7 зарядов. 1 заряд = «Волшебная стрела» 1 круга, до 7 зарядов = до 7 круга.' },
  { srdSlug: 'wand-of-fireballs', titleRu: 'Жезл огненных шаров', category: 'magic-item', rarity: 'rare', priceGp: 6000, weightLb: 1, slot: null, descriptionRu: '7 зарядов. 1 заряд = «Огненный шар» 3 круга, +1 круг за каждый дополнительный заряд.' },
  { srdSlug: 'wand-of-web', titleRu: 'Жезл паутины', category: 'magic-item', rarity: 'uncommon', priceGp: 1500, weightLb: 1, slot: null, descriptionRu: '7 зарядов. 1 заряд = «Паутина», DC спасброска Лвк 15. Требует настройки заклинателя.', requiresAttunement: true },

  // Wondrous slot items (cloak / boots / ring / headwear / gloves / amulet)
  { srdSlug: 'cloak-of-elvenkind', titleRu: 'Плащ эльфов', category: 'wondrous', rarity: 'uncommon', priceGp: 4000, weightLb: 1, slot: 'cloak', descriptionRu: 'Преимущество на скрытность; помеха проверкам Внимания обнаружить вас. Требует настройки.', requiresAttunement: true },
  { srdSlug: 'cape-of-the-mountebank', titleRu: 'Плащ шарлатана', category: 'wondrous', rarity: 'rare', priceGp: 5000, weightLb: 1, slot: 'cloak', descriptionRu: 'Раз в день — телепорт «Туманный шаг» (60 футов).' },
  { srdSlug: 'boots-of-speed', titleRu: 'Сапоги быстроты', category: 'wondrous', rarity: 'rare', priceGp: 5000, weightLb: 1, slot: 'boots', descriptionRu: 'Удвоенная скорость на 10 минут в день. Требует настройки.', requiresAttunement: true },
  { srdSlug: 'boots-of-striding-and-springing', titleRu: 'Сапоги поступи и прыжков', category: 'wondrous', rarity: 'uncommon', priceGp: 4000, weightLb: 1, slot: 'boots', descriptionRu: 'Скорость 30 футов независимо от Силы; прыжки утрояются. Требует настройки.', requiresAttunement: true },
  { srdSlug: 'winged-boots', titleRu: 'Крылатые сапоги', category: 'wondrous', rarity: 'uncommon', priceGp: 4000, weightLb: 1, slot: 'boots', descriptionRu: 'Полёт со скоростью ходьбы. 4 часа полёта в день. Требует настройки.', requiresAttunement: true },
  { srdSlug: 'slippers-of-spider-climbing', titleRu: 'Туфли паучьего лазания', category: 'wondrous', rarity: 'uncommon', priceGp: 4000, weightLb: 0, slot: 'boots', descriptionRu: 'Лазание со скоростью ходьбы по любым поверхностям. Требует настройки.', requiresAttunement: true },
  { srdSlug: 'ring-of-jumping', titleRu: 'Кольцо прыжков', category: 'wondrous', rarity: 'uncommon', priceGp: 4000, weightLb: 0, slot: 'ring', descriptionRu: 'Бонусное действие — «Прыжок» на себя. Требует настройки.', requiresAttunement: true },
  { srdSlug: 'ring-of-warmth', titleRu: 'Кольцо тепла', category: 'wondrous', rarity: 'uncommon', priceGp: 4000, weightLb: 0, slot: 'ring', descriptionRu: 'Сопротивление холоду; комфорт при −45°C и теплее. Требует настройки.', requiresAttunement: true },
  { srdSlug: 'ring-of-spell-storing', titleRu: 'Кольцо хранения заклинаний', category: 'wondrous', rarity: 'rare', priceGp: 5000, weightLb: 0, slot: 'ring', descriptionRu: 'Хранит до 5 уровней заклинаний; владелец накладывает их позже. Требует настройки.', requiresAttunement: true },
  { srdSlug: 'goggles-of-night', titleRu: 'Очки ночного видения', category: 'wondrous', rarity: 'uncommon', priceGp: 4000, weightLb: 0, slot: 'headwear', descriptionRu: 'Тёмное зрение 60 футов, пока надеты.' },
  { srdSlug: 'eyes-of-the-eagle', titleRu: 'Очки орла', category: 'wondrous', rarity: 'uncommon', priceGp: 4000, weightLb: 0, slot: 'headwear', descriptionRu: 'Преимущество на проверки Внимания, основанные на зрении. Требует настройки.', requiresAttunement: true },
  { srdSlug: 'helm-of-telepathy', titleRu: 'Шлем телепатии', category: 'wondrous', rarity: 'uncommon', priceGp: 4000, weightLb: 1, slot: 'headwear', descriptionRu: 'Заклинание «Обнаружение мыслей»; «Внушение» 3 раза в день. Требует настройки.', requiresAttunement: true },
  { srdSlug: 'bracers-of-defense', titleRu: 'Наручи защиты', category: 'wondrous', rarity: 'rare', priceGp: 6000, weightLb: 1, slot: 'gloves', descriptionRu: '+2 к AC, если вы без доспехов и щита. Требует настройки.', requiresAttunement: true },
  { srdSlug: 'pearl-of-power', titleRu: 'Жемчужина силы', category: 'wondrous', rarity: 'uncommon', priceGp: 1500, weightLb: 0, slot: null, descriptionRu: '1 раз в день восстанавливает использованную ячейку заклинания 3-го круга или ниже. Требует настройки заклинателя.', requiresAttunement: true },
  { srdSlug: 'driftglobe', titleRu: 'Парящий шар', category: 'wondrous', rarity: 'uncommon', priceGp: 1500, weightLb: 1, slot: null, descriptionRu: 'Шар-светильник. Команда — свет / парение в радиусе 60 футов хозяина.' },
  { srdSlug: 'immovable-rod', titleRu: 'Несдвигаемый жезл', category: 'wondrous', rarity: 'uncommon', priceGp: 4000, weightLb: 2, slot: null, descriptionRu: 'Кнопка фиксирует жезл в воздухе; держит до 3500 кг.' },
  { srdSlug: 'broom-of-flying', titleRu: 'Метла полёта', category: 'wondrous', rarity: 'uncommon', priceGp: 1500, weightLb: 3, slot: null, descriptionRu: 'Полёт со скоростью 50 футов; до 200 кг.' },
  { srdSlug: 'portable-hole', titleRu: 'Переносная яма', category: 'wondrous', rarity: 'rare', priceGp: 5000, weightLb: 0, slot: null, descriptionRu: 'Чёрный круг диаметром 6 футов; превращается в внепространственную яму глубиной 10 футов.' },
  { srdSlug: 'javelin-of-lightning', titleRu: 'Молниевое копьё', category: 'magic-item', rarity: 'uncommon', priceGp: 1500, weightLb: 2, slot: 'versatile', descriptionRu: 'Метание = молниевая линия 5×120 футов, 4d6 урона электричеством. Расходный.' },
  { srdSlug: 'flame-tongue', titleRu: 'Пламенный язык', category: 'magic-item', rarity: 'rare', priceGp: 5000, weightLb: 3, slot: 'versatile', descriptionRu: 'Командное слово зажигает клинок: +2d6 огненного урона. Свет 40 футов.' },
  { srdSlug: 'dragon-scale-mail', titleRu: 'Драконья чешуя', category: 'magic-item', rarity: 'very-rare', priceGp: 50000, weightLb: 45, slot: 'body', descriptionRu: '+1 к AC, преимущество на спасброски от страха драконов; 1 раз в день — чувствуете драконов в радиусе 30 миль.' },

  // ─────────────────── Consumables — extended pool ───────────────────
  { srdSlug: 'potion-of-heroism', titleRu: 'Зелье героизма', category: 'consumable', rarity: 'rare', priceGp: 500, weightLb: 0.5, slot: null, descriptionRu: '10 временных HP + эффект «Благословение» 1 час.' },
  { srdSlug: 'potion-of-invisibility', titleRu: 'Зелье невидимости', category: 'consumable', rarity: 'very-rare', priceGp: 5000, weightLb: 0.5, slot: null, descriptionRu: 'Невидимость на 1 час или до атаки/каста.' },
  { srdSlug: 'potion-of-flying', titleRu: 'Зелье полёта', category: 'consumable', rarity: 'very-rare', priceGp: 5000, weightLb: 0.5, slot: null, descriptionRu: 'Скорость полёта 60 футов на 1 час.' },
  { srdSlug: 'potion-of-speed', titleRu: 'Зелье скорости', category: 'consumable', rarity: 'very-rare', priceGp: 5000, weightLb: 0.5, slot: null, descriptionRu: 'Эффект «Ускорения» на 1 минуту, без концентрации.' },
  { srdSlug: 'potion-of-water-breathing', titleRu: 'Зелье дыхания под водой', category: 'consumable', rarity: 'uncommon', priceGp: 200, weightLb: 0.5, slot: null, descriptionRu: 'Дыхание под водой 1 час.' },
  { srdSlug: 'potion-of-climbing', titleRu: 'Зелье лазания', category: 'consumable', rarity: 'common', priceGp: 50, weightLb: 0.5, slot: null, descriptionRu: 'Скорость лазания = скорости ходьбы; преимущество на лазание; 1 час.' },
  { srdSlug: 'potion-of-growth', titleRu: 'Зелье увеличения', category: 'consumable', rarity: 'uncommon', priceGp: 200, weightLb: 0.5, slot: null, descriptionRu: 'Эффект «Увеличения», размер +1 категория, 1d4 часа.' },
  { srdSlug: 'oil-of-slipperiness', titleRu: 'Масло скольжения', category: 'consumable', rarity: 'uncommon', priceGp: 200, weightLb: 0.5, slot: null, descriptionRu: 'Намазать существо/предмет: 8 часов «Освобождения» / зона 10 футов «Жирной грязи» 8 часов.' },
  { srdSlug: 'dust-of-disappearance', titleRu: 'Пыль исчезновения', category: 'consumable', rarity: 'uncommon', priceGp: 200, weightLb: 0, slot: null, descriptionRu: 'Невидимость для всех в радиусе 10 футов на 2d4 минуты.' },
  { srdSlug: 'dust-of-dryness', titleRu: 'Пыль сухости', category: 'consumable', rarity: 'uncommon', priceGp: 200, weightLb: 0, slot: null, descriptionRu: 'Высушивает до 15 куб. футов воды в горошину; разбить горошину — вода возвращается.' },

  // ─────────────────── Poisons (DMG + VRGR + IMR + JRC) ───────────────────
  // Source: dnd.su/articles/inventory/148-poisons. category='consumable'
  // (matches existing `poison-basic-vial` in the base seed). Slot=null.
  // Rarity=null (5e poisons are mundane). Weight=0 (vials are
  // effectively weightless). Book attribution kept inline in
  // descriptionRu for items from VRGR / IMR / JRC since the catalog
  // currently exposes only `srd-5e` and `homebrew` source slugs —
  // future split into per-book sources is a follow-up.
  { srdSlug: 'pale-tincture', titleRu: 'Бледная настойка', category: 'consumable', rarity: null, priceGp: 250, weightLb: 0, slot: null, descriptionRu: 'Поглощаемый. Спасбросок Тел Сл 16; провал — 1d6 яда + отравление, повтор каждые 24 ч. Урон не лечится. После 7 успехов эффект кончается.' },
  { srdSlug: 'burnt-othur-fumes', titleRu: 'Дым жжённого отура', category: 'consumable', rarity: null, priceGp: 500, weightLb: 0, slot: null, descriptionRu: 'Вдыхаемый. Спасбросок Тел Сл 13; провал — 3d6 яда + повтор в начале каждого хода (1d6 при провале). После 3 успехов эффект кончается.' },
  { srdSlug: 'bizas-breath', titleRu: 'Дыхание Бизы', category: 'consumable', rarity: null, priceGp: null, weightLb: 0, slot: null, descriptionRu: 'Вдыхаемый (JRC). Спасбросок Тел Сл 16; провал — отравлен 1 мин и должен атаковать случайную цель в досягаемости. Повтор в конце хода.' },
  { srdSlug: 'malice', titleRu: 'Злоба', category: 'consumable', rarity: null, priceGp: 250, weightLb: 0, slot: null, descriptionRu: 'Вдыхаемый. Спасбросок Тел Сл 15; провал — отравлен 1 час, ослеплён пока отравлен.' },
  { srdSlug: 'serpent-venom', titleRu: 'Змеиный яд', category: 'consumable', rarity: null, priceGp: 200, weightLb: 0, slot: null, descriptionRu: 'Оружейный. Собирают с гигантской ядовитой змеи. Спасбросок Тел Сл 11; 3d6 яда при провале, половина при успехе.' },
  { srdSlug: 'assassins-blood', titleRu: 'Кровь ассасина', category: 'consumable', rarity: null, priceGp: 150, weightLb: 0, slot: null, descriptionRu: 'Поглощаемый. Спасбросок Тел Сл 10; провал — 1d12 яда + отравлен 24 ч. Успех — половина урона, без отравления.' },
  { srdSlug: 'lycanthropic-blood', titleRu: 'Кровь ликантропа', category: 'consumable', rarity: null, priceGp: null, weightLb: 0, slot: null, descriptionRu: 'Оружейный (IMR). Кровь ликантропа в зверином/гибридном виде. Спасбросок Тел Сл 12; провал — проклят ликантропией (вид по к6/к10). Снимается «Снятием проклятья».' },
  { srdSlug: 'oil-of-taggit', titleRu: 'Масло таггита', category: 'consumable', rarity: null, priceGp: 400, weightLb: 0, slot: null, descriptionRu: 'Контактный. Спасбросок Тел Сл 13; провал — отравлен 24 ч и без сознания. Урон будит, но отравление остаётся.' },
  { srdSlug: 'midnight-tears', titleRu: 'Полуночные слёзы', category: 'consumable', rarity: null, priceGp: 1500, weightLb: 0, slot: null, descriptionRu: 'Поглощаемый. До полуночи никаких эффектов. Затем спасбросок Тел Сл 17; провал — 9d6 яда, успех — половина.' },
  { srdSlug: 'mummys-dust', titleRu: 'Пыль мумии', category: 'consumable', rarity: null, priceGp: null, weightLb: 0, slot: null, descriptionRu: 'Вдыхаемый (IMR). Спасбросок Тел Сл 12; провал — проклят гнилью мумии: HP не лечатся, макс HP падает на 3d6 каждые 24 ч. На 0 — смерть, тело в пыль.' },
  { srdSlug: 'carrion-crawler-mucus', titleRu: 'Слизь ползающего падальщика', category: 'consumable', rarity: null, priceGp: 200, weightLb: 0, slot: null, descriptionRu: 'Контактный. Собирают с падальщика. Спасбросок Тел Сл 13; провал — отравлен 1 мин и парализован. Повтор в конце хода.' },
  { srdSlug: 'torpor', titleRu: 'Ступор', category: 'consumable', rarity: null, priceGp: 600, weightLb: 0, slot: null, descriptionRu: 'Поглощаемый. Спасбросок Тел Сл 15; провал — отравлен 4d6 ч и недееспособен.' },
  { srdSlug: 'truth-serum', titleRu: 'Сыворотка правды', category: 'consumable', rarity: null, priceGp: 150, weightLb: 0, slot: null, descriptionRu: 'Поглощаемый. Спасбросок Тел Сл 11; провал — отравлен 1 час и не может сознательно лгать (как «область истины»).' },
  { srdSlug: 'thessaltoxin', titleRu: 'Фессалтоксин', category: 'consumable', rarity: null, priceGp: null, weightLb: 0, slot: null, descriptionRu: 'Поглощаемый или оружейный (IMR). Спасбросок Тел Сл 15; провал — превращение в случайного зверя/существо, виденного за последние 24 ч (выбор Мастера), до конца следующего долгого отдыха. Снимается «Высшим восстановлением».' },
  { srdSlug: 'ivanas-whisper', titleRu: 'Шёпот Иваны', category: 'consumable', rarity: null, priceGp: null, weightLb: 0, slot: null, descriptionRu: 'Вдыхаемый (VRGR). Спасбросок Тел Сл 18; провал — при следующем сне получает «вещий сон» от Иваны Борици. Немагический.' },
  { srdSlug: 'essence-of-ether', titleRu: 'Эссенция эфира', category: 'consumable', rarity: null, priceGp: 300, weightLb: 0, slot: null, descriptionRu: 'Вдыхаемый. Спасбросок Тел Сл 15; провал — отравлен 8 часов и без сознания. Урон или встряска будят.' },
  { srdSlug: 'wyvern-poison', titleRu: 'Яд виверны', category: 'consumable', rarity: null, priceGp: 1200, weightLb: 0, slot: null, descriptionRu: 'Оружейный. Собирают с виверны. Спасбросок Тел Сл 15; провал — 7d6 яда, успех — половина.' },
  { srdSlug: 'drow-poison', titleRu: 'Яд дроу', category: 'consumable', rarity: null, priceGp: 200, weightLb: 0, slot: null, descriptionRu: 'Оружейный. Изготавливают дроу без солнечного света. Спасбросок Тел Сл 13; провал — отравлен 1 час, при провале на 5+ — без сознания.' },
  { srdSlug: 'purple-worm-poison', titleRu: 'Яд лилового червя', category: 'consumable', rarity: null, priceGp: 2000, weightLb: 0, slot: null, descriptionRu: 'Оружейный. Собирают с лилового червя. Спасбросок Тел Сл 19; провал — 12d6 яда, успех — половина.' },

  // ─────────────────── Drugs & substances (DMG + EGW + RLW + JRC) ───────────────────
  // Source: dnd.su/articles/inventory/149-drugs-and-substances. Same
  // category/source convention as poisons. dnd.su's «Противоядие»
  // (DMG) intentionally skipped — already in seed as
  // `antitoxin-vial` (mig 044, identical mechanics: advantage on
  // poison saves 1h, 50 gp).
  { srdSlug: 'murasa-balm', titleRu: 'Бальзам мурусы', category: 'consumable', rarity: null, priceGp: 100, weightLb: 0, slot: null, descriptionRu: 'Бальзам (EGW). Нанесение четверти пинты за 1 минуту даёт сопротивление огню на 1 час. Доза от солнечных ожогов — 1 зм.' },
  { srdSlug: 'ghost-orchid-white-seed', titleRu: 'Белое семя призрачной орхидеи', category: 'consumable', rarity: null, priceGp: null, weightLb: 0, slot: null, descriptionRu: 'Семя орхидеи (JRC). Если смолоть и рассыпать над трупом — эффект «Воскрешение». При употреблении внутрь не действует.' },
  { srdSlug: 'dragons-blood', titleRu: 'Драконья кровь', category: 'consumable', rarity: null, priceGp: null, weightLb: 0, slot: null, descriptionRu: 'Стимулятор (RLW). Сильное привыкание; усиливает заклинательство или временно даёт способности чародея. Эффект непредсказуем — Мастер бросает по таблице «Волна дикой магии».' },
  { srdSlug: 'theki-root', titleRu: 'Корень тэки', category: 'consumable', rarity: null, priceGp: 3, weightLb: 0, slot: null, descriptionRu: 'Корень (EGW). Действием съесть; преимущество на спасброски против ядов и токсинов на 8 часов.' },
  { srdSlug: 'olisuba-leaf', titleRu: 'Лист олисуба', category: 'consumable', rarity: null, priceGp: 50, weightLb: 0, slot: null, descriptionRu: 'Чай (EGW). Выпить во время продолжительного отдыха — по окончании истощение снижается на 2 степени вместо 1.' },
  { srdSlug: 'shade-willow-oil', titleRu: 'Масло тенистой ивы', category: 'consumable', rarity: null, priceGp: 30, weightLb: 0, slot: null, descriptionRu: 'Масло (EGW). Действием нанести на окаменевшее существо (если окаменение < 1 минуты назад) — окаменение оканчивается в начале его следующего хода.' },
  { srdSlug: 'divinatory-salts', titleRu: 'Соли прорицания', category: 'consumable', rarity: null, priceGp: 150, weightLb: 0, slot: null, descriptionRu: 'Алкалоид (EGW). Доза с леденец перорально; преимущество к проверкам Интеллекта на 1d4 ч. За каждую дозу — спасбросок Тел Сл 15 или степень истощения, накапливается.' },
  { srdSlug: 'dreamlily', titleRu: 'Сонная лилия', category: 'consumable', rarity: null, priceGp: 1, weightLb: 0, slot: null, descriptionRu: 'Опиат (RLW). 1 зм на чёрном рынке / 10 зм легально. Отравлен 1 час; иммунитет к «испуганному», и при первом обнулении HP вместо смерти HP падает до 1.' },
  { srdSlug: 'cadaver-ichor', titleRu: 'Трупный ихор', category: 'consumable', rarity: null, priceGp: 200, weightLb: 0, slot: null, descriptionRu: 'Психоделик (EGW). 1 час: преим. на Инт/Мдр и уязвимость к психической. Спасбросок Тел Сл 15 — иначе отравлен 1d6 ч и «смятение» 1 мин. Нежить вместо этого получает преим. на Лвк и иммунитет к «испуганному».' },
  { srdSlug: 'ghost-orchid-black-seed', titleRu: 'Чёрное семя призрачной орхидеи', category: 'consumable', rarity: null, priceGp: null, weightLb: 0, slot: null, descriptionRu: 'Семя (JRC). Съевший подвергается «Притворной смерти». Если не желает — спасбросок Тел Сл 16, иначе считается согласным.' },
  { srdSlug: 'black-sap', titleRu: 'Чёрный сок', category: 'consumable', rarity: null, priceGp: 300, weightLb: 0, slot: null, descriptionRu: 'Опьяняющее (EGW). Курят или вводят в кровь. 1d6 ч нельзя очаровать или испугать. За дозу — спасбросок Тел Сл 15 или отравлен 2d4 ч; накапливается.' },
]


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

  // ─────────────────── Armor (mundane) ───────────────────
  { srdSlug: 'leather-armor', titleRu: 'Кожаный доспех', category: 'armor', rarity: null, priceGp: 10, weightLb: 10, slot: 'body', descriptionRu: 'Лёгкий доспех. AC 11 + Лвк, без помех скрытности.' },
  { srdSlug: 'studded-leather', titleRu: 'Клёпаный кожаный доспех', category: 'armor', rarity: null, priceGp: 45, weightLb: 13, slot: 'body', descriptionRu: 'Лёгкий доспех. AC 12 + Лвк, без помех скрытности.' },
  { srdSlug: 'chain-shirt', titleRu: 'Кольчужная рубаха', category: 'armor', rarity: null, priceGp: 50, weightLb: 20, slot: 'body', descriptionRu: 'Средний доспех. AC 13 + Лвк (макс +2).' },
  { srdSlug: 'scale-mail', titleRu: 'Чешуйчатый доспех', category: 'armor', rarity: null, priceGp: 50, weightLb: 45, slot: 'body', descriptionRu: 'Средний доспех. AC 14 + Лвк (макс +2). Помехи на скрытность.' },
  { srdSlug: 'half-plate', titleRu: 'Полулаты', category: 'armor', rarity: null, priceGp: 750, weightLb: 40, slot: 'body', descriptionRu: 'Средний доспех. AC 15 + Лвк (макс +2). Помехи на скрытность.' },
  { srdSlug: 'chain-mail', titleRu: 'Кольчуга', category: 'armor', rarity: null, priceGp: 75, weightLb: 55, slot: 'body', descriptionRu: 'Тяжёлый доспех. AC 16. Сила 13, помехи на скрытность.' },
  { srdSlug: 'plate-armor', titleRu: 'Латный доспех', category: 'armor', rarity: null, priceGp: 1500, weightLb: 65, slot: 'body', descriptionRu: 'Тяжёлый доспех. AC 18. Сила 15, помехи на скрытность.' },
  { srdSlug: 'shield', titleRu: 'Щит', category: 'armor', rarity: null, priceGp: 10, weightLb: 6, slot: 'shield', descriptionRu: '+2 к AC. Занимает руку.' },

  // ─────────────────── Adventuring gear ───────────────────
  { srdSlug: 'rope-hempen-50ft', titleRu: 'Верёвка пеньковая, 50 футов', category: 'misc', rarity: null, priceGp: 1, weightLb: 10, slot: null, descriptionRu: 'Прочная верёвка длиной 50 футов.' },
  { srdSlug: 'torch', titleRu: 'Факел', category: 'misc', rarity: null, priceGp: 0.01, weightLb: 1, slot: null, descriptionRu: 'Освещает 20 футов ярким светом, ещё 20 — тусклым. Горит 1 час.' },
  { srdSlug: 'backpack', titleRu: 'Рюкзак', category: 'misc', rarity: null, priceGp: 2, weightLb: 5, slot: null, descriptionRu: 'Походный рюкзак, вмещает до 1 куб. фута / 30 фунтов.' },
  { srdSlug: 'bedroll', titleRu: 'Спальный мешок', category: 'misc', rarity: null, priceGp: 1, weightLb: 7, slot: null, descriptionRu: 'Свёрнутый матрас и одеяло для сна на природе.' },
  { srdSlug: 'whetstone', titleRu: 'Точило', category: 'misc', rarity: null, priceGp: 0.01, weightLb: 1, slot: null, descriptionRu: 'Камень для затачивания клинков. Несколько применений.' },
  { srdSlug: 'lantern-hooded', titleRu: 'Закрытый фонарь', category: 'misc', rarity: null, priceGp: 5, weightLb: 2, slot: null, descriptionRu: 'Освещает 30 футов ярким светом и ещё 30 — тусклым. Расход масла: 1 час за пинту.' },
  { srdSlug: 'oil-flask', titleRu: 'Масло, бутыль', category: 'misc', rarity: null, priceGp: 0.1, weightLb: 1, slot: null, descriptionRu: 'Бутылка лампового масла. Можно поджечь как метательную при попадании.' },
  { srdSlug: 'tent-two-person', titleRu: 'Двухместная палатка', category: 'misc', rarity: null, priceGp: 2, weightLb: 20, slot: null, descriptionRu: 'Палатка, рассчитанная на двух персонажей.' },
  { srdSlug: 'mirror-steel', titleRu: 'Стальное зеркало', category: 'misc', rarity: null, priceGp: 5, weightLb: 0.5, slot: null, descriptionRu: 'Полированное зеркало из стали.' },
  { srdSlug: 'mess-kit', titleRu: 'Походный набор посуды', category: 'misc', rarity: null, priceGp: 0.2, weightLb: 1, slot: null, descriptionRu: 'Чашка, миска, ложка и складной чайник.' },
  { srdSlug: 'thieves-tools', titleRu: 'Воровские инструменты', category: 'tool', rarity: null, priceGp: 25, weightLb: 1, slot: null, descriptionRu: 'Набор отмычек, шилов и зеркальца. Для проверки навыка взлома.' },
  { srdSlug: 'healers-kit', titleRu: 'Набор лекаря', category: 'tool', rarity: null, priceGp: 5, weightLb: 3, slot: null, descriptionRu: '10 зарядов. Стабилизация умирающего без проверки.' },

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
  { srdSlug: 'cloak-of-protection', titleRu: 'Плащ защиты', category: 'wondrous', rarity: 'uncommon', priceGp: 4000, weightLb: 1, slot: 'cloak', descriptionRu: '+1 к AC и спасброскам, пока носите. Требует настройки.' },
  { srdSlug: 'boots-of-elvenkind', titleRu: 'Сапоги эльфов', category: 'wondrous', rarity: 'uncommon', priceGp: 4000, weightLb: 1, slot: 'boots', descriptionRu: 'Шаги бесшумны. Преимущество на скрытность бесшумных движений.' },
  { srdSlug: 'bag-of-holding', titleRu: 'Сумка хранения', category: 'wondrous', rarity: 'uncommon', priceGp: 4000, weightLb: 15, slot: null, descriptionRu: 'Внутреннее пространство 64 куб. фута / 500 фунтов; снаружи весит 15 фунтов.' },
  { srdSlug: 'ring-of-protection', titleRu: 'Кольцо защиты', category: 'magic-item', rarity: 'rare', priceGp: 8000, weightLb: 0, slot: 'ring', descriptionRu: '+1 к AC и спасброскам. Требует настройки.' },
  { srdSlug: 'amulet-of-health', titleRu: 'Амулет здоровья', category: 'magic-item', rarity: 'rare', priceGp: 8000, weightLb: 1, slot: 'amulet', descriptionRu: 'Телосложение становится 19. Требует настройки.' },
  { srdSlug: 'gauntlets-of-ogre-power', titleRu: 'Перчатки силы огра', category: 'magic-item', rarity: 'uncommon', priceGp: 4000, weightLb: 2, slot: 'gloves', descriptionRu: 'Сила становится 19. Требует настройки.' },

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
  { srdSlug: 'wand-of-web', titleRu: 'Жезл паутины', category: 'magic-item', rarity: 'uncommon', priceGp: 1500, weightLb: 1, slot: null, descriptionRu: '7 зарядов. 1 заряд = «Паутина», DC спасброска Лвк 15. Требует настройки заклинателя.' },

  // Wondrous slot items (cloak / boots / ring / headwear / gloves / amulet)
  { srdSlug: 'cloak-of-elvenkind', titleRu: 'Плащ эльфов', category: 'wondrous', rarity: 'uncommon', priceGp: 4000, weightLb: 1, slot: 'cloak', descriptionRu: 'Преимущество на скрытность; помеха проверкам Внимания обнаружить вас. Требует настройки.' },
  { srdSlug: 'cape-of-the-mountebank', titleRu: 'Плащ шарлатана', category: 'wondrous', rarity: 'rare', priceGp: 5000, weightLb: 1, slot: 'cloak', descriptionRu: 'Раз в день — телепорт «Туманный шаг» (60 футов).' },
  { srdSlug: 'boots-of-speed', titleRu: 'Сапоги быстроты', category: 'wondrous', rarity: 'rare', priceGp: 5000, weightLb: 1, slot: 'boots', descriptionRu: 'Удвоенная скорость на 10 минут в день. Требует настройки.' },
  { srdSlug: 'boots-of-striding-and-springing', titleRu: 'Сапоги поступи и прыжков', category: 'wondrous', rarity: 'uncommon', priceGp: 4000, weightLb: 1, slot: 'boots', descriptionRu: 'Скорость 30 футов независимо от Силы; прыжки утрояются. Требует настройки.' },
  { srdSlug: 'winged-boots', titleRu: 'Крылатые сапоги', category: 'wondrous', rarity: 'uncommon', priceGp: 4000, weightLb: 1, slot: 'boots', descriptionRu: 'Полёт со скоростью ходьбы. 4 часа полёта в день. Требует настройки.' },
  { srdSlug: 'slippers-of-spider-climbing', titleRu: 'Туфли паучьего лазания', category: 'wondrous', rarity: 'uncommon', priceGp: 4000, weightLb: 0, slot: 'boots', descriptionRu: 'Лазание со скоростью ходьбы по любым поверхностям. Требует настройки.' },
  { srdSlug: 'ring-of-jumping', titleRu: 'Кольцо прыжков', category: 'wondrous', rarity: 'uncommon', priceGp: 4000, weightLb: 0, slot: 'ring', descriptionRu: 'Бонусное действие — «Прыжок» на себя. Требует настройки.' },
  { srdSlug: 'ring-of-warmth', titleRu: 'Кольцо тепла', category: 'wondrous', rarity: 'uncommon', priceGp: 4000, weightLb: 0, slot: 'ring', descriptionRu: 'Сопротивление холоду; комфорт при −45°C и теплее. Требует настройки.' },
  { srdSlug: 'ring-of-spell-storing', titleRu: 'Кольцо хранения заклинаний', category: 'wondrous', rarity: 'rare', priceGp: 5000, weightLb: 0, slot: 'ring', descriptionRu: 'Хранит до 5 уровней заклинаний; владелец накладывает их позже. Требует настройки.' },
  { srdSlug: 'goggles-of-night', titleRu: 'Очки ночного видения', category: 'wondrous', rarity: 'uncommon', priceGp: 4000, weightLb: 0, slot: 'headwear', descriptionRu: 'Тёмное зрение 60 футов, пока надеты.' },
  { srdSlug: 'eyes-of-the-eagle', titleRu: 'Очки орла', category: 'wondrous', rarity: 'uncommon', priceGp: 4000, weightLb: 0, slot: 'headwear', descriptionRu: 'Преимущество на проверки Внимания, основанные на зрении. Требует настройки.' },
  { srdSlug: 'helm-of-telepathy', titleRu: 'Шлем телепатии', category: 'wondrous', rarity: 'uncommon', priceGp: 4000, weightLb: 1, slot: 'headwear', descriptionRu: 'Заклинание «Обнаружение мыслей»; «Внушение» 3 раза в день. Требует настройки.' },
  { srdSlug: 'bracers-of-defense', titleRu: 'Наручи защиты', category: 'wondrous', rarity: 'rare', priceGp: 6000, weightLb: 1, slot: 'gloves', descriptionRu: '+2 к AC, если вы без доспехов и щита. Требует настройки.' },
  { srdSlug: 'pearl-of-power', titleRu: 'Жемчужина силы', category: 'wondrous', rarity: 'uncommon', priceGp: 1500, weightLb: 0, slot: null, descriptionRu: '1 раз в день восстанавливает использованную ячейку заклинания 3-го круга или ниже. Требует настройки заклинателя.' },
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
]

